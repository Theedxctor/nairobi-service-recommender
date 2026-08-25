# ML Service

See the top-level repo README for the full picture. This folder is
self-contained: it can be run independently of frontend/database work.

- `feature_engineering.py` — turns a booking request into model features
- `finalize_model.py` — trains/retrains the tuned XGBoost pipeline
- `api.py` — FastAPI service (`/predict`, `/recommend`)
- `models/` — trained model artifact (gitignored, regenerate via finalize_model.py)
- `results/` — evaluation outputs for documentation
