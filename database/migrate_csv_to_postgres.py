"""
migrate_csv_to_postgres.py
Migrates raw CSV files from data/raw/ into PostgreSQL/PostGIS tables
defined in database/schema.sql.

Usage:
  # Dry-run validation mode (no database connection required):
  python database/migrate_csv_to_postgres.py --dry-run

  # Live migration mode (reads connection from environment variables):
  export DB_HOST=localhost
  export DB_PORT=5432
  export DB_NAME=nairobi_recommender
  export DB_USER=postgres
  export DB_PASSWORD=your_password
  python database/migrate_csv_to_postgres.py
"""

import os
import sys
import argparse
from pathlib import Path
import pandas as pd


def get_db_connection_params():
    """Reads database connection parameters from environment variables."""
    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": int(os.environ.get("DB_PORT", 5432)),
        "dbname": os.environ.get("DB_NAME", "nairobi_recommender"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", ""),
    }


def find_data_dir():
    """Locates the data/raw directory."""
    base = Path(__file__).resolve().parent
    candidates = [
        base.parent / "data" / "raw",
        base / "data" / "raw",
        Path("data/raw"),
        Path("../data/raw"),
    ]
    for c in candidates:
        if (c / "nairobi_areas.csv").exists():
            return c
    raise FileNotFoundError("Could not locate data/raw/ directory.")


# ---------------------------------------------------------------------------
# Migration functions for each table in dependency order
# ---------------------------------------------------------------------------

def migrate_nairobi_areas(conn, data_dir, dry_run=False):
    """
    1. nairobi_areas:
       Converts lat/lng columns into PostGIS geometry point:
       ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    """
    df = pd.read_csv(data_dir / "nairobi_areas.csv")
    print(f"\n[1/7] nairobi_areas: Preparing {len(df)} records...")

    if dry_run:
        sample = df.head(2).to_dict(orient="records")
        print(f"      [DRY RUN] Would insert {len(df)} rows into nairobi_areas.")
        print(f"      [DRY RUN] Sample geom conversion: ST_SetSRID(ST_MakePoint({sample[0]['lng']}, {sample[0]['lat']}), 4326)")
        return len(df)

    insert_sql = """
        INSERT INTO nairobi_areas (area_id, area_name, geom, area_type, avg_income, road_quality)
        VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s)
        ON CONFLICT (area_id) DO NOTHING;
    """

    cursor = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        cursor.execute(
            insert_sql,
            (
                str(row["area_id"]).strip(),
                str(row["area_name"]).strip(),
                float(row["lng"]),
                float(row["lat"]),
                str(row["area_type"]).strip() if pd.notna(row["area_type"]) else None,
                str(row["avg_income"]).strip() if pd.notna(row["avg_income"]) else None,
                str(row["road_quality"]).strip() if pd.notna(row["road_quality"]) else None,
            ),
        )
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into nairobi_areas.")
    return inserted


def migrate_clients(conn, data_dir, dry_run=False):
    """
    2. clients:
       References nairobi_areas(area_id).
    """
    df = pd.read_csv(data_dir / "clients.csv")
    print(f"\n[2/7] clients: Preparing {len(df)} records...")

    if dry_run:
        print(f"      [DRY RUN] Would insert {len(df)} rows into clients.")
        return len(df)

    insert_sql = """
        INSERT INTO clients (client_id, name, area_id, phone, email)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (client_id) DO NOTHING;
    """

    cursor = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        phone_val = str(int(row["phone"])) if pd.notna(row["phone"]) and isinstance(row["phone"], (int, float)) else str(row["phone"]) if pd.notna(row["phone"]) else None
        cursor.execute(
            insert_sql,
            (
                str(row["client_id"]).strip(),
                str(row["name"]).strip(),
                str(row["area_id"]).strip(),
                phone_val,
                str(row["email"]).strip() if ("email" in row and pd.notna(row["email"])) else None,
            ),
        )
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into clients.")
    return inserted


def migrate_service_providers(conn, data_dir, dry_run=False):
    """
    3. service_providers:
       References nairobi_areas(area_id).
    """
    df = pd.read_csv(data_dir / "service_providers.csv")
    print(f"\n[3/7] service_providers: Preparing {len(df)} records...")

    if dry_run:
        print(f"      [DRY RUN] Would insert {len(df)} rows into service_providers.")
        return len(df)

    insert_sql = """
        INSERT INTO service_providers (
            provider_id, name, base_area_id, service_type, rating,
            completion_rate, experience_years, avg_response_min,
            total_jobs, is_verified, hourly_rate_ksh, phone
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (provider_id) DO UPDATE SET phone = EXCLUDED.phone;
    """

    cursor = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        phone_val = (
            str(int(row["phone"])) if pd.notna(row["phone"]) and isinstance(row["phone"], (int, float))
            else str(row["phone"]) if pd.notna(row["phone"]) else None
        )
        cursor.execute(
            insert_sql,
            (
                str(row["provider_id"]).strip(),
                str(row["name"]).strip(),
                str(row["base_area_id"]).strip(),
                str(row["service_type"]).strip(),
                float(row["rating"]) if pd.notna(row["rating"]) else None,
                float(row["completion_rate"]) if pd.notna(row["completion_rate"]) else None,
                float(row["years_experience"]) if pd.notna(row["years_experience"]) else None,
                float(row["avg_response_time_min"]) if pd.notna(row["avg_response_time_min"]) else None,
                int(row["total_jobs_completed"]) if pd.notna(row["total_jobs_completed"]) else None,
                str(row["is_verified"]).strip().lower() == "true",
                int(row["hourly_rate_ksh"]) if pd.notna(row["hourly_rate_ksh"]) else None,
                phone_val,
            ),
        )
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into service_providers.")
    return inserted


def migrate_traffic_patterns(conn, data_dir, dry_run=False):
    """
    4. traffic_patterns:
       Loads corridor records (excluding pipe-delimited served_areas).
    """
    df = pd.read_csv(data_dir / "traffic_patterns.csv")
    print(f"\n[4/7] traffic_patterns: Preparing {len(df)} records...")

    if dry_run:
        print(f"      [DRY RUN] Would insert {len(df)} rows into traffic_patterns.")
        return len(df)

    insert_sql = """
        INSERT INTO traffic_patterns (
            traffic_pattern_id, corridor_name, direction, time_slot,
            day_type, congestion_multiplier, avg_speed_kmh, congestion_level
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (traffic_pattern_id) DO NOTHING;
    """

    cursor = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        cursor.execute(
            insert_sql,
            (
                str(row["traffic_pattern_id"]).strip(),
                str(row["corridor_name"]).strip(),
                str(row["direction"]).strip() if pd.notna(row["direction"]) else None,
                str(row["time_slot"]).strip(),
                str(row["day_type"]).strip(),
                float(row["congestion_multiplier"]) if pd.notna(row["congestion_multiplier"]) else None,
                float(row["avg_speed_kmh"]) if pd.notna(row["avg_speed_kmh"]) else None,
                float(row["congestion_level"]) if pd.notna(row["congestion_level"]) else None,
            ),
        )
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into traffic_patterns.")
    return inserted


def migrate_corridor_areas(conn, data_dir, dry_run=False):
    """
    5. corridor_areas:
       Junction table linking traffic_patterns and nairobi_areas.
       Splits served_areas string (e.g. 'A11|A12|A27') into one row per area.
    """
    df = pd.read_csv(data_dir / "traffic_patterns.csv")
    corridor_rows = []
    for _, row in df.iterrows():
        tp_id = str(row["traffic_pattern_id"]).strip()
        served = str(row["served_areas"]).split("|") if pd.notna(row["served_areas"]) else []
        for area_id in served:
            area_id = area_id.strip()
            if area_id:
                corridor_rows.append((tp_id, area_id))

    print(f"\n[5/7] corridor_areas: Prepared {len(corridor_rows)} junction mappings from traffic_patterns.served_areas...")

    if dry_run:
        print(f"      [DRY RUN] Would insert {len(corridor_rows)} rows into corridor_areas.")
        return len(corridor_rows)

    insert_sql = """
        INSERT INTO corridor_areas (traffic_pattern_id, area_id)
        VALUES (%s, %s)
        ON CONFLICT (traffic_pattern_id, area_id) DO NOTHING;
    """

    cursor = conn.cursor()
    inserted = 0
    for tp_id, area_id in corridor_rows:
        cursor.execute(insert_sql, (tp_id, area_id))
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into corridor_areas.")
    return inserted


def migrate_provider_availability(conn, data_dir, dry_run=False):
    """
    6. provider_availability:
       References service_providers(provider_id).
    """
    df = pd.read_csv(data_dir / "provider_availability.csv")
    print(f"\n[6/7] provider_availability: Preparing {len(df)} records...")

    if dry_run:
        print(f"      [DRY RUN] Would insert {len(df)} rows into provider_availability.")
        return len(df)

    insert_sql = """
        INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time)
        VALUES (%s, %s, %s, %s);
    """

    cursor = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        cursor.execute(
            insert_sql,
            (
                str(row["provider_id"]).strip(),
                str(row["day_of_week"]).strip(),
                str(row["start_time"]).strip(),
                str(row["end_time"]).strip(),
            ),
        )
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into provider_availability.")
    return inserted


def migrate_historical_bookings(conn, data_dir, dry_run=False):
    """
    7. historical_bookings:
       References clients, service_providers, and nairobi_areas.
       Maps client_area and provider_area names to area_id.
    """
    df_areas = pd.read_csv(data_dir / "nairobi_areas.csv")
    area_name_to_id = {row["area_name"].strip().lower(): str(row["area_id"]).strip() for _, row in df_areas.iterrows()}

    df = pd.read_csv(data_dir / "historical_bookings.csv")
    print(f"\n[7/7] historical_bookings: Preparing {len(df)} records...")

    if dry_run:
        print(f"      [DRY RUN] Would insert {len(df)} rows into historical_bookings.")
        return len(df)

    insert_sql = """
        INSERT INTO historical_bookings (
            client_id, provider_id, client_area_id, provider_area_id,
            service_type, distance_km, time_slot, day_type,
            congestion_multiplier, estimated_travel_min,
            arrival_reliability_score, on_time, job_completed,
            delay_min, actual_travel_min, client_rating_given
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
    """

    cursor = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        client_area_str = str(row["client_area"]).strip().lower()
        prov_area_str = str(row["provider_area"]).strip().lower()

        client_area_id = area_name_to_id.get(client_area_str)
        prov_area_id = area_name_to_id.get(prov_area_str)

        cursor.execute(
            insert_sql,
            (
                str(row["client_id"]).strip(),
                str(row["provider_id"]).strip(),
                client_area_id,
                prov_area_id,
                str(row["service_type"]).strip() if pd.notna(row["service_type"]) else None,
                float(row["distance_km"]) if pd.notna(row["distance_km"]) else None,
                str(row["time_slot"]).strip() if pd.notna(row["time_slot"]) else None,
                str(row["day_type"]).strip() if pd.notna(row["day_type"]) else None,
                float(row["congestion_multiplier"]) if pd.notna(row["congestion_multiplier"]) else None,
                float(row["estimated_travel_min"]) if pd.notna(row["estimated_travel_min"]) else None,
                float(row["arrival_reliability_score"]) if pd.notna(row["arrival_reliability_score"]) else None,
                bool(row["on_time"]) if pd.notna(row["on_time"]) else None,
                bool(row["job_completed"]) if pd.notna(row["job_completed"]) else None,
                float(row["delay_min"]) if pd.notna(row["delay_min"]) else None,
                float(row["actual_travel_min"]) if pd.notna(row["actual_travel_min"]) else None,
                float(row["client_rating_given"]) if pd.notna(row["client_rating_given"]) else None,
            ),
        )
        inserted += 1
    conn.commit()
    cursor.close()
    print(f"      Successfully inserted {inserted} rows into historical_bookings.")
    return inserted


ALL_TABLES = [
    "historical_bookings",
    "provider_availability",
    "corridor_areas",
    "traffic_patterns",
    "service_providers",
    "clients",
    "nairobi_areas",
]


def reset_tables(conn):
    """Truncates all 7 tables and restarts identity sequences so re-runs start from a clean slate."""
    cursor = conn.cursor()
    table_list = ", ".join(ALL_TABLES)
    cursor.execute(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE;")
    conn.commit()
    cursor.close()
    print(f"Reset complete: truncated {len(ALL_TABLES)} tables (RESTART IDENTITY CASCADE).")


# ---------------------------------------------------------------------------
# Main Migration Pipeline
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Migrate raw CSVs to PostgreSQL with PostGIS.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate CSVs and display insertion counts without connecting to the database.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Truncate all 7 tables (RESTART IDENTITY CASCADE) before migrating, to avoid duplicate rows on re-run.",
    )
    args = parser.parse_args()

    data_dir = find_data_dir()
    print(f"Found CSV data directory at: {data_dir}")

    conn = None
    if not args.dry_run:
        try:
            import psycopg2
        except ImportError:
            print("Error: psycopg2 is not installed. Install it with `pip install psycopg2-binary` or run with `--dry-run`.")
            sys.exit(1)

        db_params = get_db_connection_params()
        print(f"Connecting to PostgreSQL database '{db_params['dbname']}' on {db_params['host']}:{db_params['port']}...")
        try:
            conn = psycopg2.connect(**db_params)
            print("Connected successfully.")
        except Exception as e:
            print(f"Database connection error: {e}")
            sys.exit(1)

        if args.reset:
            print("Resetting tables before migration (--reset)...")
            try:
                reset_tables(conn)
            except Exception as e:
                print(f"Error resetting tables: {e}")
                conn.close()
                sys.exit(1)
    else:
        print("Running in DRY-RUN mode. No database operations will be executed.")
        if args.reset:
            print("[DRY RUN] Would truncate all 7 tables (RESTART IDENTITY CASCADE) before migrating.")

    tasks = [
        ("nairobi_areas", migrate_nairobi_areas),
        ("clients", migrate_clients),
        ("service_providers", migrate_service_providers),
        ("traffic_patterns", migrate_traffic_patterns),
        ("corridor_areas", migrate_corridor_areas),
        ("provider_availability", migrate_provider_availability),
        ("historical_bookings", migrate_historical_bookings),
    ]

    summary = {}
    for table_name, task_fn in tasks:
        try:
            count = task_fn(conn, data_dir, dry_run=args.dry_run)
            summary[table_name] = f"SUCCESS ({count} rows)"
        except Exception as e:
            if conn and not args.dry_run:
                conn.rollback()
            summary[table_name] = f"FAILED: {e}"
            print(f"      [ERROR] Failed migrating table '{table_name}': {e}")

    if conn:
        conn.close()

    print("\n" + "=" * 50)
    print("MIGRATION SUMMARY")
    print("=" * 50)
    for tbl, status in summary.items():
        print(f"  {tbl:25s} -> {status}")
    print("=" * 50)


if __name__ == "__main__":
    main()
