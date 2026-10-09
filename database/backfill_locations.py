"""
backfill_locations.py
One-off (idempotent) backfill of clients.location and service_providers.location
from the exact lat/lng in data/raw/*.csv, for databases migrated before #72.
Only fills rows whose location is NULL; app-registered accounts (not in the
CSVs) are left alone. Uses one batched UPDATE per table (fast over WAN).

Uses the same DB_* env vars as migrate_csv_to_postgres.py (and PGSSLMODE).
Run after database/migrations/002_exact_locations.sql.
"""
import os
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def _connect():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ.get("DB_NAME", "nairobi_recommender"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", ""),
    )


def backfill(cursor, table, id_col, csv_name):
    df = pd.read_csv(DATA_DIR / csv_name)
    rows = [(str(r[id_col]), float(r["lng"]), float(r["lat"])) for _, r in df.iterrows()]
    execute_values(
        cursor,
        f"""
        UPDATE {table} AS t
        SET location = ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)
        FROM (VALUES %s) AS v(id, lng, lat)
        WHERE t.{id_col} = v.id AND t.location IS NULL
        """,
        rows,
        template="(%s, %s::double precision, %s::double precision)",
        page_size=1000,
    )
    return cursor.rowcount


def main():
    conn = _connect()
    try:
        cur = conn.cursor()
        n_c = backfill(cur, "clients", "client_id", "clients.csv")
        n_p = backfill(cur, "service_providers", "provider_id", "service_providers.csv")
        conn.commit()
        print(f"Backfilled locations: {n_c} clients, {n_p} providers (rows that were NULL).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
