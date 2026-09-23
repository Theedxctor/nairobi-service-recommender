"""
api.py
FastAPI service around your tuned XGBoost pipeline.

Endpoints:
  GET  /health
  POST /predict     -> reliability score for ONE client-provider-time combo
  POST /recommend    -> ranked list of ALL matching providers for a booking request

Run with:  uvicorn api:app --reload --port 8000
Docs at:   http://localhost:8000/docs
"""
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import joblib
import pandas as pd

from feature_engineering import load_reference_data, build_feature_row, MODEL_FEATURES, is_provider_available

app = FastAPI(title="Nairobi Context-Aware Provider Reliability API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "xgboost_arrival_reliability_pipeline.pkl"
if not MODEL_PATH.exists():
    MODEL_PATH = BASE_DIR / "xgboost_arrival_reliability_pipeline.pkl"

pipeline = joblib.load(MODEL_PATH)
ref = load_reference_data()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    client_area: str = Field(..., examples=["Kilimani"])
    provider_id: str = Field(..., examples=["P0001"])
    time_slot: str = Field(..., examples=["evening_rush"])
    day_type: str = Field(..., examples=["weekday"])


class PredictResponse(BaseModel):
    provider_id: str
    reliability_score: float
    estimated_travel_min: float
    distance_km: float
    primary_corridor: str
    explanation: str


class RecommendRequest(BaseModel):
    client_area: str = Field(..., examples=["Kilimani"])
    service_type: str = Field(..., examples=["plumber"])
    time_slot: str = Field(..., examples=["evening_rush"])
    day_type: str = Field(..., examples=["weekday"])
    top_n: Optional[int] = 5


class RankedProvider(BaseModel):
    provider_id: str
    name: str
    reliability_score: float
    estimated_travel_min: float
    distance_km: float
    hourly_rate_ksh: int
    rating: float
    explanation: str


# ---------------------------------------------------------------------------
# Core scoring logic
# ---------------------------------------------------------------------------
def _score_provider(client_area, provider_row, time_slot, day_type):
    features = build_feature_row(client_area, provider_row, time_slot, day_type, ref)
    X = pd.DataFrame([{k: features[k] for k in MODEL_FEATURES}])
    score = float(pipeline.predict(X)[0])
    return score, features


def _explain(features, provider_row):
    reasons = []
    if features["congestion_multiplier"] <= 1.5:
        reasons.append("clear route at this time")
    elif features["congestion_multiplier"] >= 2.5:
        reasons.append("heavy congestion on this route")
    if features["provider_area_road_quality"] == "good":
        reasons.append("good road access to provider's base area")
    elif features["provider_area_road_quality"] == "poor":
        reasons.append("poor road access to provider's base area")
    if provider_row["completion_rate"] >= 0.85:
        reasons.append("strong historical completion rate")
    return "; ".join(reasons) if reasons else "based on standard traffic and provider profile"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "providers_loaded": len(ref["providers"]) if "providers" in ref else 0,
        "areas_loaded": len(ref["areas"]) if "areas" in ref else 0,
        "availability_loaded": len(ref["availability"]) if "availability" in ref else 0,
    }


@app.get("/areas", response_model=list[str])
def get_areas():
    if "areas" in ref and "area_name" in ref["areas"].columns:
        return sorted(ref["areas"]["area_name"].dropna().unique().tolist())
    return []


@app.get("/service_types", response_model=list[str])
def get_service_types():
    if "providers" in ref and "service_type" in ref["providers"].columns:
        return sorted(ref["providers"]["service_type"].dropna().unique().tolist())
    return []


@app.get("/time_slots", response_model=list[str])
def get_time_slots():
    return [
        "morning_rush",
        "midday",
        "evening_rush",
        "night",
        "weekend_day",
    ]


@app.get("/day_types", response_model=list[str])
def get_day_types():
    return ["weekday", "weekend"]


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    match = ref["providers"].loc[ref["providers"].provider_id == req.provider_id]
    if match.empty:
        raise HTTPException(404, f"Unknown provider_id: {req.provider_id}")
    provider_row = match.iloc[0]

    try:
        score, features = _score_provider(req.client_area, provider_row, req.time_slot, req.day_type)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return PredictResponse(
        provider_id=req.provider_id,
        reliability_score=round(max(0.0, min(1.0, float(score))), 4),
        estimated_travel_min=round(max(4.0, float(features["estimated_travel_min"])), 1),
        distance_km=round(max(0.8, float(features["distance_km"])), 2),
        primary_corridor=features["primary_corridor"],
        explanation=_explain(features, provider_row),
    )


@app.post("/recommend", response_model=list[RankedProvider])
def recommend(req: RecommendRequest):
    service_target = req.service_type.strip().lower()
    candidates = ref["providers"].loc[
        ref["providers"].service_type.astype(str).str.strip().str.lower() == service_target
    ]
    if candidates.empty:
        candidates = ref["providers"].loc[
            ref["providers"].service_type.astype(str).str.strip().str.lower().str.contains(service_target)
        ]
    if candidates.empty:
        raise HTTPException(404, f"No providers found for service_type: {req.service_type}")

    # Filter to available providers before scoring
    availability_df = ref.get("availability")
    available_mask = candidates["provider_id"].apply(
        lambda pid: is_provider_available(pid, req.day_type, req.time_slot, availability_df)
    )
    available_candidates = candidates.loc[available_mask]

    if available_candidates.empty:
        raise HTTPException(
            404,
            f"Providers exist for service_type '{req.service_type}', but none are available for day_type '{req.day_type}' and time_slot '{req.time_slot}'."
        )

    ranked = []
    for _, provider_row in available_candidates.iterrows():
        try:
            score, features = _score_provider(req.client_area, provider_row, req.time_slot, req.day_type)
        except ValueError as e:
            print(f"[recommend] Skipping provider_id={provider_row['provider_id']}: {e}")
            continue
        ranked.append(RankedProvider(
            provider_id=str(provider_row["provider_id"]),
            name=str(provider_row["name"]),
            reliability_score=round(max(0.0, min(1.0, float(score))), 4),
            estimated_travel_min=round(max(4.0, float(features["estimated_travel_min"])), 1),
            distance_km=round(max(0.8, float(features["distance_km"])), 2),
            hourly_rate_ksh=int(provider_row["hourly_rate_ksh"]),
            rating=float(provider_row["rating"]),
            explanation=_explain(features, provider_row),
        ))

    ranked.sort(key=lambda r: r.reliability_score, reverse=True)
    return ranked[: req.top_n]
