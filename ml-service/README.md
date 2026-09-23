# ML Service

See the top-level repo README for the full picture. This folder is
self-contained: it can be run independently of frontend/database work.

- `feature_engineering.py` — turns a booking request into model features
- `finalize_model.py` — trains/retrains the tuned XGBoost pipeline
- `api.py` — FastAPI service (`/predict`, `/recommend`)
- `models/` — trained model artifact (gitignored, regenerate via finalize_model.py)
- `results/` — evaluation outputs for documentation

## Reference data source

`load_reference_data()` reads areas/providers/traffic/availability from
PostgreSQL/PostGIS (see `database/schema.sql` + `database/migrate_csv_to_postgres.py`),
using the same `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` env
vars as the migration script:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=nairobi_recommender
export DB_USER=postgres
export DB_PASSWORD=your_password
```

If no database is reachable, it falls back to the `data/raw/*.csv` files so
local dev/tests still work without Docker/Postgres running.
