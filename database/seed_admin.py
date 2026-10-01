"""
seed_admin.py
One-off, idempotent script to create the first admin account, so there's a
reproducible way to get an admin login instead of hand-inserting rows into
Postgres.

Run it with the ml-service virtualenv's Python, since it needs bcrypt +
psycopg2 (already installed there):

  export ADMIN_EMAIL=admin@example.com
  export ADMIN_PASSWORD=some-strong-password
  export DB_HOST=localhost
  export DB_PORT=5433
  export DB_NAME=nairobi_recommender
  export DB_USER=postgres
  export DB_PASSWORD=devpassword
  ml-service/.venv/bin/python3 database/seed_admin.py

Safe to re-run: if ADMIN_EMAIL already exists, it prints a message and exits
without changing anything.
"""
import os
import sys
from pathlib import Path

ML_SERVICE_DIR = Path(__file__).resolve().parent.parent / "ml-service"


def get_db_connection_params():
    """Reads database connection parameters from environment variables (same
    pattern as database/migrate_csv_to_postgres.py)."""
    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": int(os.environ.get("DB_PORT", 5432)),
        "dbname": os.environ.get("DB_NAME", "nairobi_recommender"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", ""),
    }


def next_user_id(cursor):
    cursor.execute("SELECT user_id FROM users ORDER BY user_id DESC LIMIT 1")
    row = cursor.fetchone()
    last_num = int(row[0][1:]) if row and row[0] else 0
    return f"U{last_num + 1:04d}"


def main():
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        print("Error: set ADMIN_EMAIL and ADMIN_PASSWORD environment variables first.")
        sys.exit(1)
    email = email.strip().lower()

    try:
        import psycopg2
    except ImportError:
        print("Error: psycopg2 is not installed. Run this with ml-service/.venv/bin/python3.")
        sys.exit(1)

    try:
        sys.path.insert(0, str(ML_SERVICE_DIR))
        from feature_engineering import _hash_password  # reuse api.py's exact hashing, not reimplemented
    except ImportError:
        print("Error: could not import bcrypt hashing from ml-service/feature_engineering.py. "
              "Run this with ml-service/.venv/bin/python3.")
        sys.exit(1)

    conn = psycopg2.connect(**get_db_connection_params())
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        existing = cursor.fetchone()
        if existing:
            print(f"Admin already exists: {email} (user_id={existing[0]}). Nothing to do.")
            return

        user_id = next_user_id(cursor)
        cursor.execute(
            """
            INSERT INTO users (user_id, email, password_hash, role, client_id, provider_id)
            VALUES (%s, %s, %s, 'admin', NULL, NULL)
            """,
            (user_id, email, _hash_password(password)),
        )
        conn.commit()
        print(f"Created admin account: {email} (user_id={user_id})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
