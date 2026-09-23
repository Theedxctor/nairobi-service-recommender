"""
finalize_model.py
Reproduces the exact tuned model from the Kaggle notebook's GridSearchCV
(best_params_: learning_rate=0.05, max_depth=3, min_child_weight=3),
saved as a single deployable sklearn Pipeline.
"""
import pandas as pd
import joblib
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.metrics import mean_squared_error, mean_absolute_error
from xgboost import XGBRegressor
import numpy as np

TARGET = "arrival_reliability_score"
DATA_PATH = "../data/raw/historical_bookings.csv"
MODEL_OUT = "models/xgboost_arrival_reliability_pipeline.pkl"

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


def main():
    df = pd.read_csv(DATA_PATH)
    X, y = df[FEATURES], df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)

    pipe = build_pipeline()
    pipe.fit(X_train, y_train)
    pred = pipe.predict(X_test)

    rmse = np.sqrt(mean_squared_error(y_test, pred))
    mae = mean_absolute_error(y_test, pred)

    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_rmse = -cross_val_score(pipe, X, y, cv=kf, scoring="neg_root_mean_squared_error")

    print(f"Tuned model -- features: {FEATURES}")
    print(f"Test RMSE: {rmse:.4f}   Test MAE: {mae:.4f}")
    print(f"5-fold CV RMSE: {cv_rmse.mean():.4f} (+/- {cv_rmse.std():.4f})")

    joblib.dump(pipe, MODEL_OUT)
    print(f"\nSaved -> {MODEL_OUT}")


if __name__ == "__main__":
    main()
