"""
finalize_model.py
Reproduces the exact tuned model from the Kaggle notebook's GridSearchCV
(best_params_: learning_rate=0.05, max_depth=3, min_child_weight=3),
saved as a single deployable sklearn Pipeline.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import joblib
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from xgboost import XGBRegressor
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
TARGET = "arrival_reliability_score"
DATA_PATH = BASE_DIR.parent / "data" / "raw" / "historical_bookings.csv"
MODEL_OUT = BASE_DIR / "models" / "xgboost_arrival_reliability_pipeline.pkl"
METRICS_OUT = BASE_DIR / "results" / "latest_model_metrics.json"

FEATURES = [
    "distance_km",
    "congestion_multiplier",
    "time_slot",
    "provider_area_road_quality",
    "provider_completion_rate",
]
NUMERIC_FEATURES = ["distance_km", "congestion_multiplier", "provider_completion_rate"]
CATEGORICAL_FEATURES = ["time_slot", "provider_area_road_quality"]


def build_pipeline():
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", "passthrough", NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )
    # exact best_params_ from the notebook's GridSearchCV
    model = XGBRegressor(
        learning_rate=0.05,
        max_depth=3,
        min_child_weight=3,
        random_state=42,
    )
    return Pipeline(steps=[("preprocessor", preprocessor), ("model", model)])


def train_and_evaluate(save=True):
    """Train the fixed pipeline, return it with reproducible evaluation data.

    Model and metrics files are replaced atomically so live API workers never
    observe a partially written artifact.
    """
    df = pd.read_csv(DATA_PATH)
    X, y = df[FEATURES], df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)

    pipe = build_pipeline()
    pipe.fit(X_train, y_train)
    train_pred = pipe.predict(X_train)
    pred = pipe.predict(X_test)

    rmse = np.sqrt(mean_squared_error(y_test, pred))
    mae = mean_absolute_error(y_test, pred)

    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_rmse = -cross_val_score(pipe, X, y, cv=kf, scoring="neg_root_mean_squared_error")

    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "synthetic",
        "records": int(len(df)),
        "train_records": int(len(X_train)),
        "test_records": int(len(X_test)),
        "features": FEATURES,
        "train": {
            "rmse": float(np.sqrt(mean_squared_error(y_train, train_pred))),
            "mae": float(mean_absolute_error(y_train, train_pred)),
            "r2": float(r2_score(y_train, train_pred)),
        },
        "test": {
            "rmse": float(rmse),
            "mae": float(mae),
            "r2": float(r2_score(y_test, pred)),
        },
        "cross_validation": {
            "folds": 5,
            "scope": "all synthetic records, shuffled KFold",
            "rmse_mean": float(cv_rmse.mean()),
            "rmse_std": float(cv_rmse.std()),
        },
    }

    if save:
        MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
        METRICS_OUT.parent.mkdir(parents=True, exist_ok=True)
        model_tmp = MODEL_OUT.with_suffix(".tmp")
        metrics_tmp = METRICS_OUT.with_suffix(".tmp")
        joblib.dump(pipe, model_tmp)
        metrics_tmp.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
        os.replace(model_tmp, MODEL_OUT)
        os.replace(metrics_tmp, METRICS_OUT)

    return pipe, metrics


def main():
    _, metrics = train_and_evaluate(save=True)
    print(f"Tuned model -- features: {FEATURES}")
    print(f"Test RMSE: {metrics['test']['rmse']:.4f}   Test MAE: {metrics['test']['mae']:.4f}")
    cv = metrics["cross_validation"]
    print(f"5-fold CV RMSE: {cv['rmse_mean']:.4f} (+/- {cv['rmse_std']:.4f})")

    print(f"\nSaved -> {MODEL_OUT}")
    print(f"Metrics -> {METRICS_OUT}")


if __name__ == "__main__":
    main()
