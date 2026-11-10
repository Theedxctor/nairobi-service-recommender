# Administrator Use-Case Alignment — 28 October 2026

The system administrator actor in `docs/diagrams/UseCase Diagram.png` has three
use cases. The implementation now maps to all three without adding unrelated
administrator powers.

| Use case | Interface | API and persistence | Verification evidence |
|---|---|---|---|
| Verify Provider Identity | `/admin/verify-providers` | `GET /admin/providers`; `PATCH /admin/providers/{provider_id}/verification`; `provider_identity_reviews` audit table; synchronised `service_providers.is_verified` | Pending/approved/rejected queues, reviewer, note and timestamp; provider notification when a linked account exists |
| Monitor System Performance | `/admin/dashboard` | `GET /admin/overview` | Live booking/provider/review counts, API-loaded reference counts, and packaged train/test/CV model metrics |
| Trigger Model Retraining | `/admin/dashboard#model-retraining` | `POST /admin/model/retrain`; `GET /admin/model/retrain/status` | Single active job, visible queued/running/succeeded/failed status, atomic model and metrics replacement, live pipeline reload |

## Provider verification boundary

The prototype records provider profile and contact evidence, an administrator
decision, a note and an audit timestamp. It does **not** collect or validate a
government identity document. The presentation should therefore describe this as
provider profile/contact verification, not full KYC or government-ID verification.

## Model retraining boundary

Retraining uses the repository's approved 3,000-record synthetic dataset and fixed
five-feature XGBoost pipeline. It regenerates the held-out test and shuffled five-fold
cross-validation metrics, writes the model and metrics atomically, and replaces the
API process's in-memory pipeline only after training succeeds.

The latest end-to-end administrator-triggered run completed successfully with test
RMSE 0.1417. The persisted machine-readable evidence is
`ml-service/results/latest_model_metrics.json`.

## Security and operational limitation

Each administrator endpoint checks the supplied `admin_user_id` against the database.
The wider prototype still stores identity/role state in browser local storage and has
no signed server session. A production version requires signed authentication,
authorisation middleware, CSRF protection and a durable external job queue. The
retraining job state is currently process-local, although the resulting model and
metrics artifacts persist.

## Validation

- Complete backend suite: 192 passed, 13 skipped database-isolation cases.
- Frontend production build and TypeScript validation: passed.
- Headless browser smoke test: all three administrator use cases rendered with live
  database and model data.
- Non-administrator access check: HTTP 403.
