**Model Performance Report 27 October 2026**  
**Purpose and audit basis**  
This report records the performance of the model in the current repository at commit  
   
 `df55b7b117a50398adf446638961946ff6ecaee0`. The results were reproduced on 27  
   
 October 2026 with the pinned Python environment in `ml-service/.venv` and the current  
   
 `data/raw/historical_bookings.csv`. They apply to the synthetic dataset only and are  
   
 not evidence of performance on real Nairobi bookings.  
The prediction target is `arrival_reliability_score`, a continuous value from 0 to 1.  
   
 The task is regression, so RMSE, MAE and R² are reported; classification accuracy is  
   
 not applicable.  
**Dataset, features and partitioning**  
- Dataset: 3,000 synthetic historical bookings, 36 columns.  
- Final inputs: `distance_km`, `congestion_multiplier`, `time_slot`,  
 `provider_area_road_quality`, and `provider_completion_rate`.  
- Holdout design: 2,400 training records (80%) and 600 final test records (20%),  
   
 selected with `random_state=42`.  
- Validation design: five-fold `GridSearchCV` on the 2,400-record training portion.  
   
 Each fold trains on 1,920 records and validates on 480 records.  
- Leakage control: post-outcome fields such as actual travel time, delay, on-time  
   
 status, completion and client rating are excluded.  
- Preprocessing: numeric inputs pass through unchanged; `time_slot` and road quality  
   
 are one-hot encoded inside the pipeline. No numerical scaling is used.  
**Model selection**  
The grid search compared eight XGBoost configurations:  
- learning rate: 0.05 or 0.1;  
- maximum depth: 3 or 5;  
- minimum child weight: 1 or 3.  
The selected configuration was `learning_rate=0.05`, `max_depth=3`, and  
   
 `min_child_weight=3`. The validation RMSE was 0.140480. The five validation-fold  
   
 RMSE values were 0.137353, 0.138381, 0.141857, 0.141991 and 0.142816  
   
 (standard deviation 0.002183).  
The 600-record test set remained outside this selection process and was used only  
   
 after the best configuration had been chosen.  
**Train, validation and test performance**  
  
|  |  |  |  |  |  |  
| - | - | - | - | - | - |  
| **Partition** |  **Records** |  **RMSE** |  **MAE** |  **R²** |  **Interpretation** |  
| Training |  2,400 |  0.131569 |  0.107792 |  0.505628 |  Fit of the selected model to the records used for training |  
| Validation |  5 × 480 |  0.140480 |  Not recorded by the selection run |  Not recorded by the selection run |  Mean validation RMSE used to select the hyperparameters |  
| Held-out test |  600 |  0.141686 |  0.115984 |  0.471744 |  Final unbiased estimate within this synthetic-data design |  
  
   
The test RMSE is only 0.010117 above the training RMSE, and the test R² is 0.033885  
   
 below the training R². Together with the close validation and test RMSE values, this  
   
 does not indicate severe overfitting. It does not establish real-world generalisation,  
   
 because the data are synthetic and the random split allows the same providers to  
   
 appear in both training and test records.  
**Comparison with the baselines**  
All models below were evaluated on the same 600-record test set.  
  
|  |  |  |  |  |  
| - | - | - | - | - |  
| **Model** |  **Inputs** |  **RMSE** |  **MAE** |  **R²** |  
| Distance-only linear regression |  `distance_km` |  0.187228 |  0.151360 |  0.0776 |  
| Rating-only linear regression |  `provider_rating` |  0.193568 |  0.158501 |  0.0141 |  
| Default XGBoost |  Five final inputs |  0.158277 |  0.124747 |  Not recorded |  
| **Tuned XGBoost** |  **Five final inputs** |  **0.141686** |  **0.115984** |  **0.471744** |  
  
   
Relative to the distance-only baseline, the tuned model reduced RMSE by 24.3% and  
   
 MAE by 23.4%. Relative to the rating-only baseline, it reduced RMSE by 26.8% and  
   
 MAE by 26.8%. This satisfies Chapter 4 requirement NFR-01 on this dataset.  
The model's MAE of 0.115984 means that its predictions differ from the synthetic  
   
 target by about 0.116 on the 0–1 score scale on average. An R² of 0.471744 means the  
   
 model explains about 47.2% of the target variance in the held-out synthetic records;  
   
 it is materially better than the baselines but not close to perfect prediction.  
**Final-pipeline cross-validation**  
Running `finalize_model.py` also performs shuffled five-fold cross-validation over all  
   
 3,000 records with `random_state=42`. The reproduced result was mean RMSE 0.1414  
   
 with standard deviation 0.0020. This is a stability check for the already selected  
   
 configuration; it must not be presented as a second independent test set.  
The notebook's older unshuffled full-dataset five-fold result is 0.141095 ± 0.004274.  
   
 The difference is caused by a different fold construction, not by a different headline  
   
 test result. The report should choose one named protocol and use it consistently.  
**Feature importance and error behaviour**  
Aggregated gain importance from the trained pipeline was:  
  
|  |  |  
| - | - |  
| **Feature group** |  **Share** |  
| Congestion multiplier |  51.5% |  
| Provider completion rate |  16.5% |  
| Time slot (five encoded values) |  11.9% |  
| Provider-area road quality (three encoded values) |  10.3% |  
| Distance |  9.8% |  
  
   
These values describe how the model used features generated by the simulator. They  
   
 are not causal estimates of what determines provider reliability in Nairobi. The  
   
 predicted-versus-actual plot also shows regression toward the mean: the model tends  
   
 to overpredict the least reliable cases and produces a narrower score range than the  
   
 target.  
**Valid conclusion for the presentation**  
On 3,000 synthetic Nairobi-style booking records, the tuned five-feature XGBoost  
   
 model outperformed distance-only and rating-only linear baselines on the same 600  
   
 held-out records. Its test RMSE was 0.1417, MAE 0.1160 and R² 0.4717. Five-fold  
   
 validation on the training partition produced RMSE 0.1405, close to the held-out test  
   
 result. The evidence supports the value of the contextual feature set within the  
   
 simulation, but live booking data and provider-grouped or time-based validation are  
   
 still required before claiming real-world predictive performance.  
**Reproduction evidence**  
- `ml-service/finalize_model.py`: reproduced test RMSE 0.1417, test MAE 0.1160 and  
   
 shuffled full-dataset five-fold RMSE 0.1414 ± 0.0020.  
- `notebooks/training.ipynb`: records the baseline comparison, training-only grid  
   
 search and held-out test evaluation.  
- `ml-service/predicted_vs_actual.png`: error-distribution figure used in Chapter 5.  
- Backend verification on 27 October 2026: 195 tests passed against the dedicated  
   
 PostgreSQL/PostGIS test database; seven non-failing warnings were emitted.  
- Frontend verification on 27 October 2026: `npm run build` completed successfully  
   
 and generated all 21 static pages/routes.  
