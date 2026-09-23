"""
generate_accuracy_plot.py
Computes test-set R²/RMSE/MAE for the tuned XGBoost pipeline and a
distance-only baseline, and saves a predicted-vs-actual scatter plot
for use in the demo presentation.

Uses the exact same FEATURES, NUMERIC/CATEGORICAL split, and
train_test_split parameters as finalize_model.py so the test set matches
the one the model was actually evaluated on.
"""
import os
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from finalize_model import (
    CATEGORICAL_FEATURES,
    DATA_PATH,
    FEATURES,
    MODEL_OUT,
    NUMERIC_FEATURES,
    TARGET,
    build_pipeline,
)

PLOT_OUT = "predicted_vs_actual.png"


def main():
    df = pd.read_csv(DATA_PATH)
    X, y = df[FEATURES], df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )

    if os.path.exists(MODEL_OUT):
        pipe = joblib.load(MODEL_OUT)
    else:
        pipe = build_pipeline()
        pipe.fit(X_train, y_train)

    pred = pipe.predict(X_test)

    r2 = r2_score(y_test, pred)
    rmse = np.sqrt(mean_squared_error(y_test, pred))
    mae = mean_absolute_error(y_test, pred)

    print(f"Test R²:   {r2:.4f}")
    print(f"Test RMSE: {rmse:.4f}")
    print(f"Test MAE:  {mae:.4f}")

    # Distance-only baseline for comparison
    baseline = LinearRegression()
    baseline.fit(X_train[["distance_km"]], y_train)
    baseline_pred = baseline.predict(X_test[["distance_km"]])
    baseline_r2 = r2_score(y_test, baseline_pred)
    print(f"Distance-only baseline R²: {baseline_r2:.4f}")

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(y_test, pred, alpha=0.4, s=15, color="blue", label="Test set predictions")
    ax.plot([0, 1], [0, 1], "r--", label="Perfect prediction")
    ax.set_xlabel("Actual Reliability Score")
    ax.set_ylabel("Predicted Reliability Score")
    ax.set_title(f"Predicted vs Actual — Test Set (R² = {r2:.2f})")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend()
    fig.tight_layout()
    fig.savefig(PLOT_OUT, dpi=120)
    print(f"\nSaved -> {PLOT_OUT}")


if __name__ == "__main__":
    main()
