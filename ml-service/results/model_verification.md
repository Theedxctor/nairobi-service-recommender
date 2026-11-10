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
Test RMSE: 0.1417   Test MAE: 0.1160
5-fold CV RMSE: 0.1414 (+/- 0.0020)   (shuffled KFold, all 3,000 records)
```

These numbers were reproduced on 2026-10-28 with the pinned environment. The
cross-validation figure uses shuffled folds over all records and differs by
protocol from the training-partition validation in
`model_performance_report_2026-10-27.md`. They agree with `notebooks/training.ipynb`
to within the fourth decimal place, confirming the deployed
`models/xgboost_arrival_reliability_pipeline.pkl` is the same model, not a
drifted re-fit. Re-run `finalize_model.py` and diff against the figures above
whenever `FEATURES`, the training data, or the XGBoost version changes.
