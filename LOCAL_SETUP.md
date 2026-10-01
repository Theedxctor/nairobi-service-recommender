# Running the project locally

Three things need to be running at once, in this order: the database, the
backend API, then the frontend. All paths below are absolute so you can copy
them from anywhere.

## 1. Database (Postgres/PostGIS in Docker)

The dev database runs in a Docker container named `nairobi-recommender-db`
(Postgres 16 + PostGIS, port `5433` on the host, mapped from `5432` in the
container).

**If the container already exists** (check with `docker ps -a`), just start it:

```bash
docker start nairobi-recommender-db
```

**If it doesn't exist yet** (fresh machine), create it:

```bash
docker run -d --name nairobi-recommender-db \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=nairobi_recommender \
  -p 5433:5432 \
  postgis/postgis:16-3.4
```

Then apply the schema and migrate the CSVs (only needed once, or after a
schema change):

```bash
cd /home/theedxctor/Desktop/nairobi-service-recommender

PGPASSWORD=devpassword psql -h localhost -p 5433 -U postgres -d nairobi_recommender \
  -f database/schema.sql

DB_HOST=localhost DB_PORT=5433 DB_NAME=nairobi_recommender DB_USER=postgres DB_PASSWORD=devpassword \
  python3 database/migrate_csv_to_postgres.py
```

Verify it's up:

```bash
docker exec nairobi-recommender-db pg_isready -U postgres
```

## 2. Backend (FastAPI)

```bash
cd /home/theedxctor/Desktop/nairobi-service-recommender/ml-service
source .venv/bin/activate

DB_HOST=localhost DB_PORT=5433 DB_NAME=nairobi_recommender DB_USER=postgres DB_PASSWORD=devpassword \
  uvicorn api:app --host 127.0.0.1 --port 8000
```

Leave this running. Check it worked: open `http://localhost:8000/health` or
`http://localhost:8000/docs`.

**Common mistake:** running `uvicorn` from the wrong folder or without
activating `.venv` first gives `ModuleNotFoundError: No module named 'fastapi'`.
You must `cd` into `ml-service/` and activate `.venv` before running it.

## 3. Frontend (Next.js)

In a separate terminal:

```bash
cd /home/theedxctor/Desktop/nairobi-service-recommender/frontend
npm run dev
```

Open `http://localhost:3000`.

## Quick reference

| Thing | Command | Where |
|---|---|---|
| Start DB | `docker start nairobi-recommender-db` | anywhere |
| Start backend | `source .venv/bin/activate && DB_HOST=localhost DB_PORT=5433 DB_NAME=nairobi_recommender DB_USER=postgres DB_PASSWORD=devpassword uvicorn api:app --host 127.0.0.1 --port 8000` | `ml-service/` |
| Start frontend | `npm run dev` | `frontend/` |
| Stop DB | `docker stop nairobi-recommender-db` | anywhere |

## Troubleshooting

- `docker ps` shows nothing for `nairobi-recommender-db` -> it's stopped, not
  missing. Run `docker start nairobi-recommender-db`, don't recreate it (that
  would lose all migrated data).
- Frontend shows fetch/network errors on `/login` or `/register` -> the
  backend isn't running on port 8000, or the DB isn't reachable.
- `psql: could not connect to server` on port 5432 -> you're hitting the
  default Postgres port. This project's container is on port **5433**, not
  5432. Don't use `sudo -u postgres psql` (that targets a system-installed
  Postgres, not this Docker container) -- use the `psql -h localhost -p 5433
  ...` form shown above instead.
