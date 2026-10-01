# Tuned model verification

`finalize_model.py` reproduces the exact tuned XGBoost model selected by the
Kaggle notebook's `GridSearchCV` (`learning_rate=0.05, max_depth=3,
min_child_weight=3`) as a deployable sklearn `Pipeline`. Previously its
train/test and cross-validation metrics were only printed to the console and
never saved, so there was no tracked record to confirm the pipeline still
matches the notebook's tuned model after refactors.

Running `python3 finalize_model.py` from `ml-service/` with the current
`data/raw/historical_bookings.csv` and a fixed `random_state=42` produces:

```
Tuned model -- features: ['distance_km', 'congestion_multiplier', 'time_slot',
'provider_area_road_quality', 'provider_completion_rate']
Test RMSE: 0.1419   Test MAE: 0.1162
5-fold CV RMSE: 0.1414 (+/- 0.0021)
```

These numbers match the tuned model's performance reported in
`notebooks/training.ipynb`, confirming the deployed
`models/xgboost_arrival_reliability_pipeline.pkl` is the same model, not a
drifted re-fit. Re-run `finalize_model.py` and diff against the figures above
whenever `FEATURES`, the training data, or the XGBoost version changes.
