"""Real PostgreSQL transactions, constraints and concurrent submissions (#77).

RUN_DB_TESTS=1 plus DB_* pointing at a local test database enables these tests.
Each test owns a fresh schema; application tables/data are never modified.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
from fastapi.testclient import TestClient

import api


@pytest.fixture
def reviews_db(monkeypatch):
    if os.environ.get("RUN_DB_TESTS") != "1":
        pytest.skip("Set RUN_DB_TESTS=1 and DB_* to run isolated PostgreSQL review tests")
    connect = api._get_db_connection
    schema = "review_test_" + uuid4().hex
    admin = connect()
    admin.autocommit = True
    with admin.cursor() as cursor:
        cursor.execute(f'CREATE SCHEMA "{schema}"')

    def isolated_connection():
        conn = connect()
        with conn.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}", public')
        conn.commit()
        return conn

    try:
        with isolated_connection() as conn, conn.cursor() as cursor:
            cursor.execute((Path(__file__).resolve().parents[2] / "database/schema.sql").read_text())
            # Migration is safe on a fresh schema and when repeated.
            migration = (Path(__file__).resolve().parents[2] / "database/migrations/003_booking_reviews.sql").read_text()
            cursor.execute(migration)
            cursor.execute(migration)
            cursor.execute("""
                INSERT INTO clients (client_id, name) VALUES ('CR1', 'Review client');
                INSERT INTO service_providers (provider_id, name, service_type, rating)
                VALUES ('PR1', 'Review provider', 'plumber', 4.8);
                INSERT INTO users (user_id, email, password_hash, role, provider_id)
                VALUES ('UR1', 'review@example.test', 'unused', 'provider', 'PR1');
                INSERT INTO bookings (client_id, provider_id, service_type, client_area, time_slot, day_type, status)
                VALUES ('CR1', 'PR1', 'plumber', 'Kilimani', 'midday', 'weekday', 'completed'),
                       ('CR1', 'PR1', 'plumber', 'Kilimani', 'midday', 'weekday', 'completed'),
                       ('CR1', 'PR1', 'plumber', 'Kilimani', 'midday', 'weekday', 'pending');
            """)
        monkeypatch.setattr(api, "_get_db_connection", isolated_connection)
        yield TestClient(api.app), isolated_connection
    finally:
        with admin.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA "{schema}" CASCADE')
        admin.close()


def submit(client, booking=1, **overrides):
    return client.post(f"/bookings/{booking}/review", json={
        "client_id": "CR1", "rating": 5, "comment": "  Arrived and fixed the leak.  ", **overrides,
    })


def test_reviews_persist_notify_and_replace_imported_rating(reviews_db):
    client, connect = reviews_db
    first = submit(client)
    assert first.status_code == 201, first.text
    assert first.json()["review"]["comment"] == "Arrived and fixed the leak."
    assert first.json()["review"]["created_at"].endswith("Z")
    assert submit(client, booking=2, rating=2, comment="  ").status_code == 201
    for owner in ({"client_id": "CR1"}, {"provider_id": "PR1"}):
        rows = client.get("/bookings", params=owner).json()
        assert sorted(b["review"]["rating"] for b in rows if b["review"]) == [2, 5]
    profile = client.get("/profile", params={"user_id": "UR1"}).json()
    assert profile["rating"] == 3.5 and profile["review_count"] == 2
    assert api._fetch_current_ratings(["PR1"])["PR1"] == {"rating": 3.5, "review_count": 2}
    notes = client.get("/notifications", params={"user_id": "UR1"}).json()
    assert len(notes) == 2 and all("review for booking" in n["message"] for n in notes)
    with connect() as conn, conn.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM historical_bookings")
        assert cursor.fetchone()[0] == 0


@pytest.mark.parametrize("overrides", [
    {"rating": 0}, {"rating": 6}, {"rating": 4.5}, {"rating": True}, {"rating": "5"},
    {"comment": "x" * 1001},
])
def test_rejects_invalid_review(reviews_db, overrides):
    client, _ = reviews_db
    assert submit(client, **overrides).status_code == 422
    assert api._fetch_current_ratings(["PR1"])["PR1"] == {"rating": 4.8, "review_count": 0}


def test_rejects_wrong_owner_state_missing_booking_and_duplicate(reviews_db):
    client, connect = reviews_db
    assert submit(client, client_id="another").status_code == 403
    assert submit(client, booking=9999).status_code == 404
    for status in ("pending", "confirmed", "cancelled"):
        with connect() as conn, conn.cursor() as cursor:
            cursor.execute("UPDATE bookings SET status=%s WHERE booking_id=3", (status,))
        assert submit(client, booking=3).status_code == 409
    assert submit(client).status_code == 201
    assert submit(client, rating=1).status_code == 409
    assert api._fetch_current_ratings(["PR1"])["PR1"] == {"rating": 5.0, "review_count": 1}


def test_notification_failure_rolls_back_review_and_rating(reviews_db, monkeypatch):
    client, connect = reviews_db
    def fail(*args):
        raise RuntimeError("notification write failed")
    monkeypatch.setattr(api, "_insert_notification", fail)
    with pytest.raises(RuntimeError, match="notification write failed"):
        submit(client)
    assert api._fetch_current_ratings(["PR1"])["PR1"] == {"rating": 4.8, "review_count": 0}
    with connect() as conn, conn.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM booking_reviews")
        assert cursor.fetchone()[0] == 0


def test_concurrent_duplicate_creates_one_review_and_notification(reviews_db):
    client, _ = reviews_db
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: submit(client).status_code, range(2)))
    assert sorted(statuses) == [201, 409]
    assert len(client.get("/notifications?user_id=UR1").json()) == 1


def test_concurrent_reviews_for_provider_do_not_lose_average(reviews_db):
    client, _ = reviews_db
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda pair: submit(client, booking=pair[0], rating=pair[1]).status_code,
                                 [(1, 5), (2, 2)]))
    assert statuses == [201, 201]
    assert api._fetch_current_ratings(["PR1"])["PR1"] == {"rating": 3.5, "review_count": 2}


def test_database_constraints_reject_out_of_range_and_duplicate(reviews_db):
    client, connect = reviews_db
    with pytest.raises(psycopg2.errors.CheckViolation):
        with connect() as conn, conn.cursor() as cursor:
            cursor.execute("INSERT INTO booking_reviews (booking_id, rating) VALUES (1, 6)")
    assert submit(client).status_code == 201
    with pytest.raises(psycopg2.errors.UniqueViolation):
        with connect() as conn, conn.cursor() as cursor:
            cursor.execute("INSERT INTO booking_reviews (booking_id, rating) VALUES (1, 4)")
