"""
api.py
FastAPI service around your tuned XGBoost pipeline.

Endpoints:
  GET  /health
  POST /predict            -> reliability score for ONE client-provider-time combo
  POST /recommend          -> ranked list of ALL matching providers for a booking request
  POST /auth/register      -> create a client or provider account
  POST /auth/login         -> verify credentials, return user_id/role/client_id or provider_id
  GET  /profile            -> role-appropriate profile fields for a user_id
  GET  /notifications      -> a user's notifications, newest first
  PATCH /notifications/{id}/read -> marks one notification as read
  POST /bookings           -> client books a provider (score recomputed server-side)
  GET  /bookings           -> a client's or a provider's bookings, newest first
  PATCH /bookings/{id}/status -> confirm / decline / cancel / complete a booking
  GET  /providers/{id}/availability -> a provider's weekly availability slots
  PUT  /providers/{id}/availability -> replace a provider's weekly availability

Run with:  uvicorn api:app --reload --port 8000
Docs at:   http://localhost:8000/docs
"""
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import joblib
import pandas as pd
import psycopg2

from feature_engineering import (
    load_reference_data,
    build_feature_row,
    MODEL_FEATURES,
    is_provider_available,
    _get_db_connection,
    _hash_password,
    _verify_password,
)

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

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
# Canonical values the model was trained on. Anything else used to fall through
# to a default congestion lookup and return a confidently wrong score (#42).
TIME_SLOTS = ["morning_rush", "midday", "evening_rush", "night", "weekend_day"]
DAY_TYPES = ["weekday", "weekend"]


def _canonical(value, allowed, field_name):
    """Normalise display labels ("Morning Rush") and reject unknown values."""
    normalised = str(value).strip().lower().replace(" ", "_")
    if normalised not in allowed:
        raise ValueError(f"{field_name} must be one of {allowed}, got {value!r}")
    return normalised


class ContextFields(BaseModel):
    time_slot: str = Field(..., examples=["evening_rush"])
    day_type: str = Field(..., examples=["weekday"])

    @field_validator("time_slot")
    @classmethod
    def _check_time_slot(cls, v):
        return _canonical(v, TIME_SLOTS, "time_slot")

    @field_validator("day_type")
    @classmethod
    def _check_day_type(cls, v):
        return _canonical(v, DAY_TYPES, "day_type")

class PredictRequest(ContextFields):
    client_area: str = Field(..., examples=["Kilimani"])
    provider_id: str = Field(..., examples=["P0001"])


class PredictResponse(BaseModel):
    provider_id: str
    reliability_score: float
    estimated_travel_min: float
    distance_km: float
    primary_corridor: str
    explanation: str


class RecommendRequest(ContextFields):
    client_area: str = Field(..., examples=["Kilimani"])
    service_type: str = Field(..., examples=["plumber"])
    top_n: Optional[int] = 5


class RankedProvider(BaseModel):
    provider_id: str
    name: str
    reliability_score: float
    estimated_travel_min: float
    distance_km: float
    hourly_rate_ksh: int
    rating: Optional[float] = None  # None until a new provider has been rated
    explanation: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = Field(..., examples=["client", "provider"])
    name: str
    phone: str
    area_id: Optional[str] = None  # required when role == "client"
    base_area_id: Optional[str] = None  # required when role == "provider"
    service_type: Optional[str] = None  # required when role == "provider"
    hourly_rate_ksh: Optional[int] = None  # required when role == "provider"


class RegisterResponse(BaseModel):
    user_id: str
    role: str


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    user_id: str
    role: str
    name: Optional[str] = None
    client_id: Optional[str] = None
    provider_id: Optional[str] = None


class ProfileResponse(BaseModel):
    user_id: str
    role: str
    name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    area_name: Optional[str] = None  # client only
    base_area_name: Optional[str] = None  # provider only
    service_type: Optional[str] = None  # provider only
    hourly_rate_ksh: Optional[int] = None  # provider only
    rating: Optional[float] = None  # provider only
    completion_rate: Optional[float] = None  # provider only
    experience_years: Optional[float] = None  # provider only
    is_verified: Optional[bool] = None  # provider only
    member_since: Optional[datetime] = None


class NotificationResponse(BaseModel):
    notification_id: int
    user_id: str
    message: str
    is_read: bool
    created_at: datetime


class BookingCreateRequest(ContextFields):
    client_id: str = Field(..., examples=["C0501"])
    provider_id: str = Field(..., examples=["P0023"])
    client_area: str = Field(..., examples=["Kilimani"])


class BookingStatusUpdate(BaseModel):
    status: str = Field(..., examples=["confirmed"])
    actor: str = Field(..., examples=["provider"])  # "client" or "provider"
    actor_id: str = Field(..., examples=["P0023"])  # must own the booking


class BookingResponse(BaseModel):
    booking_id: int
    client_id: str
    client_name: Optional[str] = None
    provider_id: str
    provider_name: Optional[str] = None
    provider_hourly_rate_ksh: Optional[int] = None
    service_type: str
    client_area: str
    time_slot: str
    day_type: str
    reliability_score: Optional[float] = None
    status: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Auth helpers (users / clients / service_providers tables)
# ---------------------------------------------------------------------------
def _next_id(cursor, table, id_column, prefix):
    cursor.execute(f"SELECT {id_column} FROM {table} ORDER BY {id_column} DESC LIMIT 1")
    row = cursor.fetchone()
    last_num = int(row[0][len(prefix):]) if row and row[0] else 0
    return f"{prefix}{last_num + 1:04d}"


def _email_exists(cursor, email):
    cursor.execute("SELECT 1 FROM users WHERE email = %s", (email,))
    return cursor.fetchone() is not None


def _fetch_user_by_email(cursor, email):
    cursor.execute(
        """
        SELECT u.user_id, u.password_hash, u.role, u.client_id, u.provider_id,
               COALESCE(c.name, sp.name) AS name
        FROM users u
        LEFT JOIN clients c ON u.client_id = c.client_id
        LEFT JOIN service_providers sp ON u.provider_id = sp.provider_id
        WHERE u.email = %s
        """,
        (email,),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return {
        "user_id": row[0],
        "password_hash": row[1],
        "role": row[2],
        "client_id": row[3],
        "provider_id": row[4],
        "name": row[5],
    }


def _insert_client(cursor, client_id, name, area_id, phone, email):
    cursor.execute(
        "INSERT INTO clients (client_id, name, area_id, phone, email) VALUES (%s, %s, %s, %s, %s)",
        (client_id, name, area_id, phone, email),
    )


def _insert_provider(cursor, provider_id, name, base_area_id, service_type, hourly_rate_ksh, phone):
    cursor.execute(
        """
        INSERT INTO service_providers
            (provider_id, name, base_area_id, service_type, is_verified, total_jobs, hourly_rate_ksh, phone)
        VALUES (%s, %s, %s, %s, false, 0, %s, %s)
        """,
        (provider_id, name, base_area_id, service_type, hourly_rate_ksh, phone),
    )


def _insert_user(cursor, user_id, email, password_hash, role, client_id, provider_id):
    cursor.execute(
        """
        INSERT INTO users (user_id, email, password_hash, role, client_id, provider_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (user_id, email, password_hash, role, client_id, provider_id),
    )


def _add_provider_to_cache(provider_id, req):
    """ref['providers'] is loaded once at startup; without this a provider who
    just registered is "unknown" to /predict, /recommend and /bookings until
    the API restarts (#52). Columns mirror _PROVIDERS_SQL; history fields stay
    empty, so scoring uses the cold-start completion rate."""
    areas = ref["areas"]
    match = areas.loc[areas["area_id"] == req.base_area_id, "area_name"]
    new_row = pd.DataFrame([{
        "provider_id": provider_id,
        "name": req.name.strip(),
        "service_type": req.service_type,
        "base_area_name": match.iloc[0] if not match.empty else None,
        "rating": None,
        "completion_rate": None,
        "experience_years": None,
        "avg_response_min": None,
        "total_jobs": 0,
        "is_verified": False,
        "hourly_rate_ksh": req.hourly_rate_ksh,
    }])
    ref["providers"] = pd.concat([ref["providers"], new_row], ignore_index=True)


# ---------------------------------------------------------------------------
# Profile helpers (users joined to clients/service_providers, same COALESCE
# pattern as _fetch_user_by_email above -- not reinvented)
# ---------------------------------------------------------------------------
def _fetch_profile(cursor, user_id):
    cursor.execute(
        """
        SELECT u.user_id, u.role, u.email, u.created_at,
               c.name, c.phone, na_c.area_name,
               sp.name, sp.phone, na_p.area_name, sp.service_type,
               sp.hourly_rate_ksh, sp.rating, sp.completion_rate,
               sp.experience_years, sp.is_verified
        FROM users u
        LEFT JOIN clients c ON u.client_id = c.client_id
        LEFT JOIN nairobi_areas na_c ON c.area_id = na_c.area_id
        LEFT JOIN service_providers sp ON u.provider_id = sp.provider_id
        LEFT JOIN nairobi_areas na_p ON sp.base_area_id = na_p.area_id
        WHERE u.user_id = %s
        """,
        (user_id,),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    member_since = row[3]
    return {
        "user_id": row[0],
        "role": row[1],
        "email": row[2],
        # Same naive-but-actually-UTC timestamp as notifications above.
        "member_since": member_since.replace(tzinfo=timezone.utc) if member_since else None,
        "name": row[4] or row[7],
        "phone": row[5] or row[8],
        "area_name": row[6],
        "base_area_name": row[9],
        "service_type": row[10],
        "hourly_rate_ksh": row[11],
        "rating": row[12],
        "completion_rate": row[13],
        "experience_years": row[14],
        "is_verified": row[15],
    }


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------
def _row_to_notification(row):
    created_at = row[4]
    return {
        "notification_id": row[0],
        "user_id": row[1],
        "message": row[2],
        "is_read": row[3],
        # Postgres returns a naive datetime for TIMESTAMP columns, but it's
        # actually UTC (session tz) -- mark it explicitly so JSON/JS clients
        # don't misread it as local time.
        "created_at": created_at.replace(tzinfo=timezone.utc) if created_at else None,
    }


def _insert_notification(cursor, user_id, message):
    cursor.execute(
        """
        INSERT INTO notifications (user_id, message)
        VALUES (%s, %s)
        RETURNING notification_id, user_id, message, is_read, created_at
        """,
        (user_id, message),
    )
    return _row_to_notification(cursor.fetchone())


def _fetch_notifications(cursor, user_id):
    cursor.execute(
        """
        SELECT notification_id, user_id, message, is_read, created_at
        FROM notifications
        WHERE user_id = %s
        ORDER BY created_at DESC
        """,
        (user_id,),
    )
    return [_row_to_notification(row) for row in cursor.fetchall()]


def _mark_notification_read(cursor, notification_id):
    cursor.execute(
        """
        UPDATE notifications SET is_read = true
        WHERE notification_id = %s
        RETURNING notification_id, user_id, message, is_read, created_at
        """,
        (notification_id,),
    )
    row = cursor.fetchone()
    return _row_to_notification(row) if row else None


# ---------------------------------------------------------------------------
# Booking helpers (live app bookings -- never historical_bookings, which is
# ML training data only)
# ---------------------------------------------------------------------------
# Which status changes each side may make. Anything not listed is rejected,
# e.g. a client can't confirm their own booking and nothing leaves 'completed'.
BOOKING_TRANSITIONS = {
    "client": {"pending": {"cancelled"}, "confirmed": {"cancelled"}},
    "provider": {"pending": {"confirmed", "cancelled"}, "confirmed": {"completed", "cancelled"}},
}

_BOOKING_SELECT = """
    SELECT b.booking_id, b.client_id, c.name, b.provider_id, sp.name, sp.hourly_rate_ksh,
           b.service_type, b.client_area, b.time_slot, b.day_type, b.reliability_score,
           b.status, b.created_at
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.client_id
    LEFT JOIN service_providers sp ON b.provider_id = sp.provider_id
"""


def _row_to_booking(row):
    return {
        "booking_id": row[0],
        "client_id": row[1],
        "client_name": row[2],
        "provider_id": row[3],
        "provider_name": row[4],
        "provider_hourly_rate_ksh": row[5],
        "service_type": row[6],
        "client_area": row[7],
        "time_slot": row[8],
        "day_type": row[9],
        "reliability_score": float(row[10]) if row[10] is not None else None,
        "status": row[11],
        # Naive-but-UTC TIMESTAMP, same handling as notifications.
        "created_at": row[12].replace(tzinfo=timezone.utc),
    }


def _client_exists(cursor, client_id):
    cursor.execute("SELECT 1 FROM clients WHERE client_id = %s", (client_id,))
    return cursor.fetchone() is not None


def _insert_booking(cursor, client_id, provider_id, service_type, client_area, time_slot, day_type,
                    reliability_score):
    cursor.execute(
        """
        INSERT INTO bookings
            (client_id, provider_id, service_type, client_area, time_slot, day_type, reliability_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING booking_id
        """,
        (client_id, provider_id, service_type, client_area, time_slot, day_type, reliability_score),
    )
    return cursor.fetchone()[0]


def _fetch_booking(cursor, booking_id):
    cursor.execute(_BOOKING_SELECT + " WHERE b.booking_id = %s", (booking_id,))
    row = cursor.fetchone()
    return _row_to_booking(row) if row else None


def _fetch_bookings(cursor, column, value):
    # column is chosen by the endpoint ("client_id"/"provider_id"), never user input.
    cursor.execute(_BOOKING_SELECT + f" WHERE b.{column} = %s ORDER BY b.created_at DESC", (value,))
    return [_row_to_booking(row) for row in cursor.fetchall()]


def _update_booking_status(cursor, booking_id, status):
    cursor.execute("UPDATE bookings SET status = %s WHERE booking_id = %s", (status, booking_id))


def _user_id_for(cursor, column, value):
    """The login account linked to a client/provider, or None (most seeded
    providers come from the CSV and have no account to notify)."""
    cursor.execute(f"SELECT user_id FROM users WHERE {column} = %s", (value,))
    row = cursor.fetchone()
    return row[0] if row else None


def _booking_label(booking):
    slot = booking["time_slot"].replace("_", " ")
    return f"booking #{booking['booking_id']} ({booking['service_type']}, {booking['client_area']}, {slot}, {booking['day_type']})"


def _status_change_notice(booking, new_status, actor):
    """(recipient column, recipient id, message) for the party who didn't act."""
    label = _booking_label(booking)
    if actor == "client":  # a client can only cancel
        return ("provider_id", booking["provider_id"], f"{booking['client_name']} cancelled {label}.")
    messages = {
        "confirmed": f"{booking['provider_name']} confirmed your {label}.",
        "completed": f"{booking['provider_name']} marked your {label} as completed.",
        "cancelled": (f"{booking['provider_name']} declined your {label}."
                      if booking["status"] == "pending"
                      else f"{booking['provider_name']} cancelled your {label}."),
    }
    return ("client_id", booking["client_id"], messages[new_status])


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
    if not features["provider_has_history"]:
        reasons.append("new provider with no job history yet (completion rate assumed at the platform median)")
    elif provider_row["completion_rate"] >= 0.85:
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
    return TIME_SLOTS


@app.get("/day_types", response_model=list[str])
def get_day_types():
    return DAY_TYPES


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
            rating=None if pd.isna(provider_row["rating"]) else float(provider_row["rating"]),
            explanation=_explain(features, provider_row),
        ))

    ranked.sort(key=lambda r: r.reliability_score, reverse=True)
    return ranked[: req.top_n]


@app.post("/auth/register", response_model=RegisterResponse)
def register(req: RegisterRequest):
    role = req.role.strip().lower()
    if role not in ("client", "provider"):
        raise HTTPException(400, "role must be 'client' or 'provider'.")
    if not req.email.strip() or not EMAIL_PATTERN.match(req.email.strip()):
        raise HTTPException(400, "A valid email is required.")
    if not req.password or len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if not req.name.strip():
        raise HTTPException(400, "Name is required.")
    if not req.phone.strip():
        raise HTTPException(400, "Phone is required.")
    if role == "client" and not req.area_id:
        raise HTTPException(400, "area_id is required for client registration.")
    if role == "provider" and (not req.base_area_id or not req.service_type or req.hourly_rate_ksh is None):
        raise HTTPException(
            400, "base_area_id, service_type, and hourly_rate_ksh are required for provider registration."
        )

    email = req.email.strip().lower()
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()

        if _email_exists(cursor, email):
            raise HTTPException(409, "An account with this email already exists.")

        client_id = None
        provider_id = None
        if role == "client":
            client_id = _next_id(cursor, "clients", "client_id", "C")
            _insert_client(cursor, client_id, req.name.strip(), req.area_id, req.phone.strip(), email)
        else:
            provider_id = _next_id(cursor, "service_providers", "provider_id", "P")
            _insert_provider(
                cursor, provider_id, req.name.strip(), req.base_area_id, req.service_type, req.hourly_rate_ksh,
                req.phone.strip(),
            )

        user_id = _next_id(cursor, "users", "user_id", "U")
        _insert_user(cursor, user_id, email, _hash_password(req.password), role, client_id, provider_id)

        # Real, event-triggered notification for this signup -- not fabricated content.
        # Booking events (request, confirm, decline, cancel, complete) notify
        # from the /bookings endpoints below.
        welcome_message = (
            f"Welcome to NaiServe, {req.name.strip()}! Ready to request your first service?"
            if role == "client"
            else f"Welcome to NaiServe, {req.name.strip()}! Set your availability so clients can start booking you."
        )
        _insert_notification(cursor, user_id, welcome_message)

        conn.commit()
        if provider_id:
            _add_provider_to_cache(provider_id, req)
        return RegisterResponse(user_id=user_id, role=role)
    except HTTPException:
        conn.rollback()
        raise
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "An account with this email already exists.")
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, f"Could not complete registration: {e}")
    finally:
        conn.close()


@app.post("/auth/login", response_model=LoginResponse, response_model_exclude_none=True)
def login(req: LoginRequest):
    email = req.email.strip().lower()
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        user = _fetch_user_by_email(cursor, email)
    finally:
        conn.close()

    # Deliberately generic: same error for "no such email" and "wrong password"
    # so a client can't use this endpoint to enumerate registered emails.
    if user is None or not _verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password.")

    return LoginResponse(
        user_id=user["user_id"],
        role=user["role"],
        name=user["name"],
        client_id=user["client_id"],
        provider_id=user["provider_id"],
    )


@app.get("/profile", response_model=ProfileResponse, response_model_exclude_none=True)
def get_profile(user_id: str):
    # user_id alone is the single source of truth for role; a client-supplied
    # role param would be redundant and could drift from what's actually in
    # the DB, so we don't accept/trust one here.
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        profile = _fetch_profile(cursor, user_id)
    finally:
        conn.close()

    if profile is None:
        raise HTTPException(404, f"Unknown user_id: {user_id}")
    return ProfileResponse(**profile)


@app.get("/notifications", response_model=list[NotificationResponse])
def get_notifications(user_id: str):
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        notifications = _fetch_notifications(cursor, user_id)
    finally:
        conn.close()
    return [NotificationResponse(**n) for n in notifications]


@app.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(notification_id: int):
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        notification = _mark_notification_read(cursor, notification_id)
        conn.commit()
    finally:
        conn.close()

    if notification is None:
        raise HTTPException(404, f"Unknown notification_id: {notification_id}")
    return NotificationResponse(**notification)


@app.post("/bookings", response_model=BookingResponse, status_code=201)
def create_booking(req: BookingCreateRequest):
    match = ref["providers"].loc[ref["providers"].provider_id == req.provider_id]
    if match.empty:
        raise HTTPException(404, f"Unknown provider_id: {req.provider_id}")
    provider_row = match.iloc[0]

    # Exact match only: lookup_area() falls back to a fuzzy/first-row match,
    # which is fine for scoring previews but not for a stored booking.
    if req.client_area not in set(ref["areas"]["area_name"]):
        raise HTTPException(422, f"Unknown client_area: {req.client_area}")

    if not is_provider_available(req.provider_id, req.day_type, req.time_slot, ref.get("availability")):
        raise HTTPException(409, "This provider is not available for that day and time slot.")

    # Recompute rather than trusting a score sent by the browser.
    score, _ = _score_provider(req.client_area, provider_row, req.time_slot, req.day_type)
    score = round(max(0.0, min(1.0, score)), 3)
    service_type = str(provider_row["service_type"])

    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        if not _client_exists(cursor, req.client_id):
            raise HTTPException(404, f"Unknown client_id: {req.client_id}")

        booking_id = _insert_booking(
            cursor, req.client_id, req.provider_id, service_type, req.client_area,
            req.time_slot, req.day_type, score,
        )
        booking = _fetch_booking(cursor, booking_id)

        provider_user = _user_id_for(cursor, "provider_id", req.provider_id)
        if provider_user:
            _insert_notification(
                cursor, provider_user,
                f"New request from {booking['client_name']}: {_booking_label(booking)}.",
            )
        client_user = _user_id_for(cursor, "client_id", req.client_id)
        if client_user:
            _insert_notification(
                cursor, client_user,
                f"Your {_booking_label(booking)} with {booking['provider_name']} was sent and is awaiting confirmation.",
            )

        conn.commit()
        return BookingResponse(**booking)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, f"Could not create booking: {e}")
    finally:
        conn.close()


@app.get("/bookings", response_model=list[BookingResponse])
def list_bookings(client_id: Optional[str] = None, provider_id: Optional[str] = None):
    if (client_id is None) == (provider_id is None):
        raise HTTPException(400, "Pass exactly one of client_id or provider_id.")
    column, value = ("client_id", client_id) if client_id else ("provider_id", provider_id)

    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        bookings = _fetch_bookings(cursor, column, value)
    finally:
        conn.close()
    return [BookingResponse(**b) for b in bookings]


@app.patch("/bookings/{booking_id}/status", response_model=BookingResponse)
def update_booking_status(booking_id: int, req: BookingStatusUpdate):
    actor = req.actor.strip().lower()
    new_status = req.status.strip().lower()
    if actor not in BOOKING_TRANSITIONS:
        raise HTTPException(422, "actor must be 'client' or 'provider'.")

    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        booking = _fetch_booking(cursor, booking_id)
        if booking is None:
            raise HTTPException(404, f"Unknown booking_id: {booking_id}")

        # Guards against UI mistakes, NOT real authorisation: without session
        # tokens anyone can claim any actor_id.
        if booking[f"{actor}_id"] != req.actor_id:
            raise HTTPException(403, f"This booking does not belong to {actor} {req.actor_id}.")

        allowed = BOOKING_TRANSITIONS[actor].get(booking["status"], set())
        if new_status not in allowed:
            raise HTTPException(
                409,
                f"A {actor} cannot change a '{booking['status']}' booking to '{new_status}'"
                + (f" (allowed: {sorted(allowed)})." if allowed else "."),
            )

        _update_booking_status(cursor, booking_id, new_status)

        column, recipient_id, message = _status_change_notice(booking, new_status, actor)
        recipient_user = _user_id_for(cursor, column, recipient_id)
        if recipient_user:
            _insert_notification(cursor, recipient_user, message)

        updated = _fetch_booking(cursor, booking_id)
        conn.commit()
        return BookingResponse(**updated)
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Provider availability
# ---------------------------------------------------------------------------
DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class AvailabilitySlot(BaseModel):
    day_of_week: str
    start_time: str
    end_time: str

    @field_validator("day_of_week")
    @classmethod
    def _day(cls, v):
        day = v.strip().capitalize()
        if day not in DAYS_OF_WEEK:
            raise ValueError(f"day_of_week must be one of {DAYS_OF_WEEK}")
        return day

    @field_validator("start_time", "end_time")
    @classmethod
    def _time(cls, v):
        v = v.strip()
        if not _TIME_PATTERN.match(v):
            raise ValueError("times must be HH:MM (24-hour)")
        return v

    @field_validator("end_time")
    @classmethod
    def _order(cls, v, info):
        start = info.data.get("start_time")
        if start is not None and start >= v:
            raise ValueError("start_time must be before end_time")
        return v


class AvailabilityUpdate(BaseModel):
    slots: list[AvailabilitySlot]

    @field_validator("slots")
    @classmethod
    def _unique_days(cls, slots):
        days = [s.day_of_week for s in slots]
        if len(days) != len(set(days)):
            raise ValueError("at most one slot per day_of_week")
        return slots


def _provider_exists(cursor, provider_id):
    cursor.execute("SELECT 1 FROM service_providers WHERE provider_id = %s", (provider_id,))
    return cursor.fetchone() is not None


def _fetch_availability(cursor, provider_id):
    cursor.execute(
        """
        SELECT day_of_week, to_char(start_time, 'HH24:MI'), to_char(end_time, 'HH24:MI')
        FROM provider_availability WHERE provider_id = %s
        """,
        (provider_id,),
    )
    rows = [{"day_of_week": r[0], "start_time": r[1], "end_time": r[2]} for r in cursor.fetchall()]
    return sorted(rows, key=lambda r: DAYS_OF_WEEK.index(r["day_of_week"]) if r["day_of_week"] in DAYS_OF_WEEK else 99)


def _replace_availability(cursor, provider_id, slots):
    cursor.execute("DELETE FROM provider_availability WHERE provider_id = %s", (provider_id,))
    for s in slots:
        cursor.execute(
            """
            INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time)
            VALUES (%s, %s, %s, %s)
            """,
            (provider_id, s["day_of_week"], s["start_time"], s["end_time"]),
        )


def _refresh_availability_cache(provider_id, slots):
    """Keep the in-memory availability table (loaded once at startup) in sync so
    /recommend and POST /bookings see the change without a restart."""
    current = ref.get("availability")
    if current is None:
        current = pd.DataFrame(columns=["provider_id", "day_of_week", "start_time", "end_time"])
    kept = current.loc[current["provider_id"].astype(str) != str(provider_id)]
    new_rows = pd.DataFrame(
        [{"provider_id": provider_id, **s} for s in slots],
        columns=["provider_id", "day_of_week", "start_time", "end_time"],
    )
    ref["availability"] = pd.concat([kept, new_rows], ignore_index=True)


@app.get("/providers/{provider_id}/availability", response_model=list[AvailabilitySlot])
def get_provider_availability(provider_id: str):
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        if not _provider_exists(cursor, provider_id):
            raise HTTPException(404, f"Unknown provider_id: {provider_id}")
        return _fetch_availability(cursor, provider_id)
    finally:
        conn.close()


@app.put("/providers/{provider_id}/availability", response_model=list[AvailabilitySlot])
def put_provider_availability(provider_id: str, req: AvailabilityUpdate):
    slots = sorted(
        (s.model_dump() for s in req.slots), key=lambda s: DAYS_OF_WEEK.index(s["day_of_week"])
    )
    conn = _get_db_connection()
    try:
        cursor = conn.cursor()
        if not _provider_exists(cursor, provider_id):
            raise HTTPException(404, f"Unknown provider_id: {provider_id}")
        _replace_availability(cursor, provider_id, slots)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    _refresh_availability_cache(provider_id, slots)
    return slots
