# Deployment: Vercel + Render + Neon

| Part | Host | Free-tier notes |
|---|---|---|
| Frontend (Next.js, `frontend/`) | Vercel | Fine for demo traffic |
| Backend (FastAPI + XGBoost, `ml-service/`) | Render (Docker) | **Sleeps after 15 min idle**: first request then takes ~30–60 s. Open `/health` a minute before demoing. 512 MB RAM. |
| Database (Postgres 16 + PostGIS) | Neon | Region `AWS eu-central-1 (Frankfurt)` to sit next to Render's Frankfurt region |

Nothing secret is committed. Connection details live only in your local
`deploy.env` (gitignored via `*.env`) and in the Render/Vercel dashboards.

## 1. Database on Neon

1. Create a Neon project (Postgres 16, region **AWS eu-central-1**). From
   *Connection details* note host, database, user, password.
2. Save them locally in the repo root as `deploy.env` (never committed):
   ```bash
   DB_HOST=ep-xxxx.eu-central-1.aws.neon.tech
   DB_PORT=5432
   DB_NAME=neondb
   DB_USER=neondb_owner
   DB_PASSWORD=...
   PGSSLMODE=require
   ```
3. Load schema, data and an admin, from the repo root. `psql` comes from the
   PostGIS image, so nothing extra to install:
   ```bash
   set -a; source deploy.env; set +a
   docker run --rm --network host -v "$PWD/database:/db" \
     -e PGHOST="$DB_HOST" -e PGPORT="$DB_PORT" -e PGDATABASE="$DB_NAME" \
     -e PGUSER="$DB_USER" -e PGPASSWORD="$DB_PASSWORD" -e PGSSLMODE=require \
     postgis/postgis:16-3.4 psql -v ON_ERROR_STOP=1 -f /db/schema.sql
   source ml-service/.venv/bin/activate
   python database/migrate_csv_to_postgres.py
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='choose-one' python database/seed_admin.py
   ```
   `PGSSLMODE=require` is read by libpq, so the Python scripts use SSL
   without code changes. Check: `SELECT PostGIS_Version();` and row counts
   (201 providers, 30 areas, 6000 historical bookings).

## 2. Backend on Render

1. Render → **New → Blueprint** → select this repo. It reads `render.yaml`.
2. Fill the `sync: false` values from `deploy.env`, and set `CORS_ORIGINS` to
   your Vercel URL (you can add it after step 3, then redeploy).
3. The Docker build trains the model inside the image
   (`ml-service/finalize_model.py`, `random_state=42`, pinned versions in
   `ml-service/requirements-api.txt`). The build log prints the test
   RMSE/MAE and CV RMSE.
4. Verify: `curl https://<service>.onrender.com/health` returns
   `{"status":"ok","providers_loaded":201,...}`.

Local equivalent of what Render runs:
```bash
docker build -f ml-service/Dockerfile -t naiserve-api .
docker run --rm -p 8000:8000 --env-file deploy.env -e CORS_ORIGINS=http://localhost:3000 naiserve-api
```

## 3. Frontend on Vercel

1. Vercel → **Add New → Project** → import this repo.
2. **Root Directory: `frontend`** (framework auto-detected as Next.js).
3. Environment variable: `NEXT_PUBLIC_API_URL=https://<service>.onrender.com`
   (read at build time, so redeploy after changing it).
4. Put the resulting `https://<project>.vercel.app` into Render's
   `CORS_ORIGINS` and redeploy the backend.

## 4. Smoke test

Run the end-to-end suite against the live URLs (it creates its own test
accounts):
```bash
cd tests/e2e
E2E_BASE_URL=https://<project>.vercel.app E2E_API_URL=https://<service>.onrender.com npx playwright test
```

## Known limitations (documented, not hidden)

- Auth is a client-side guard (`localStorage`), not session tokens. See CLAUDE.md.
- Free Render instance cold starts (~30–60 s after idle).
- New providers rank below the top 10 until they have history (#61).
