"""Where exactly the job is, and who may see it (#105).

An area ("Kilimani") is not enough to find a house, so an area-only booking
needs written directions. The provider sees the exact point, the directions
and the client's phone only while the booking is confirmed; the client sees
the provider's phone only then.
"""
import os
from datetime import date, datetime
from pathlib import Path
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import api

MONDAY = date(2026, 10, 12)  # frozen "today in Nairobi"
BODY = {
    "client_id": "C0501",
    "provider_id": "P0023",
    "client_area": "Kilimani",
    "time_slot": "morning_rush",
    "day_type": "weekday",
}
EXACT = {"client_lat": -1.2921, "client_lng": 36.7801}


def _booking(status, **over):
    return {
        "booking_id": 7, "client_id": "C0501", "client_name": "Grace Wanjiru",
        "provider_id": "P0023", "provider_name": "Auma Cheruiyot", "provider_hourly_rate_ksh": 894,
        "service_type": "plumber", "client_area": "Kilimani", "time_slot": "morning_rush",
        "day_type": "weekday", "reliability_score": 0.84, "status": status,
        "created_at": datetime(2026, 10, 7, 9, 0, 0),
        "client_lat": -1.2921, "client_lng": 36.7801,
        "location_details": "Galana Plaza, Apt 4B",
        "client_phone": "0711223344", "provider_phone": "0722334455",
        **over,
    }


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def fake_db(monkeypatch):
    state = MagicMock()
    state.kwargs = None

    def insert_booking(cursor, *args, **kwargs):
        state.kwargs = kwargs
        return 7

    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_client_exists", lambda cursor, cid: True)
    monkeypatch.setattr(api, "_insert_booking", insert_booking)
    monkeypatch.setattr(api, "_fetch_booking", lambda cursor, bid: _booking("pending"))
    monkeypatch.setattr(api, "_user_id_for", lambda *a: None)
    monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: True)
    return state


# ---------------------------------------------------------------------------
# POST /bookings: directions are required unless an exact point was shared
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("details", [None, "", "   "])
def test_area_only_booking_without_directions_is_rejected(client, fake_db, details):
    body = {**BODY, **({} if details is None else {"location_details": details})}
    res = client.post("/bookings", json=body)
    assert res.status_code == 422
    assert "Add directions for the provider" in res.text
    assert fake_db.kwargs is None  # nothing was written


def test_area_only_booking_stores_trimmed_directions(client, fake_db):
    res = client.post("/bookings", json={**BODY, "location_details": "  Galana Plaza, Apt 4B  "})
    assert res.status_code == 201, res.text
    assert fake_db.kwargs["location_details"] == "Galana Plaza, Apt 4B"


def test_exact_point_booking_does_not_need_directions(client, fake_db):
    res = client.post("/bookings", json={**BODY, **EXACT})
    assert res.status_code == 201, res.text
    assert fake_db.kwargs["location_details"] is None


def test_directions_longer_than_300_characters_are_rejected(client, fake_db):
    res = client.post("/bookings", json={**BODY, "location_details": "x" * 301})
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Who sees what
# ---------------------------------------------------------------------------
def test_provider_sees_only_the_area_before_accepting():
    seen = api._booking_for_viewer(_booking("pending"), "provider")
    assert seen.client_area == "Kilimani"
    assert (seen.client_lat, seen.client_lng, seen.location_details, seen.client_phone) == (None, None, None, None)


def test_provider_sees_location_and_client_phone_once_confirmed():
    seen = api._booking_for_viewer(_booking("confirmed"), "provider")
    assert seen.location_details == "Galana Plaza, Apt 4B"
    assert (seen.client_lat, seen.client_lng) == (-1.2921, 36.7801)
    assert seen.client_phone == "0711223344"
    assert seen.provider_phone is None  # their own number is not echoed back


def test_client_sees_provider_phone_only_once_confirmed():
    pending = api._booking_for_viewer(_booking("pending"), "client")
    assert pending.provider_phone is None
    assert pending.location_details == "Galana Plaza, Apt 4B"  # their own directions
    confirmed = api._booking_for_viewer(_booking("confirmed"), "client")
    assert confirmed.provider_phone == "0722334455"
    assert confirmed.client_phone is None


@pytest.mark.parametrize("status", ["completed", "cancelled"])
def test_contact_details_are_hidden_once_the_job_is_over(status):
    for_provider = api._booking_for_viewer(_booking(status), "provider")
    for_client = api._booking_for_viewer(_booking(status), "client")
    assert for_provider.client_phone is None and for_provider.location_details is None
    assert for_provider.client_lat is None
    assert for_client.provider_phone is None


# ---------------------------------------------------------------------------
# Real PostgreSQL: the column, the SQL and the whole flow end to end
# ---------------------------------------------------------------------------
@pytest.fixture
def real_db(monkeypatch):
    if os.environ.get("RUN_DB_TESTS") != "1":
        pytest.skip("Set RUN_DB_TESTS=1 and DB_* to run isolated PostgreSQL booking location tests")
    connect = api._get_db_connection
    schema = "location_test_" + uuid4().hex
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

    root = Path(__file__).resolve().parents[2]
    try:
        with isolated_connection() as conn, conn.cursor() as cursor:
            cursor.execute((root / "database/schema.sql").read_text())
            migration = (root / "database/migrations/008_booking_location_details.sql").read_text()
            cursor.execute(migration)  # safe on a fresh schema and when repeated
            cursor.execute(migration)
            cursor.execute("""
                INSERT INTO clients (client_id, name, phone) VALUES ('C0501', 'Location client', '0711223344');
                INSERT INTO service_providers (provider_id, name, service_type, phone)
                VALUES ('P0023', 'Location provider', 'plumber', '0722334455');
                INSERT INTO bookings (client_id, provider_id, service_type, client_area, time_slot, day_type, status)
                VALUES ('C0501', 'P0023', 'plumber', 'Kilimani', 'midday', 'weekday', 'confirmed');
            """)
        monkeypatch.setattr(api, "_get_db_connection", isolated_connection)
        monkeypatch.setattr(api, "_today_in_nairobi", lambda: MONDAY)
        monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: True)
        yield TestClient(api.app)
    finally:
        with admin.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA "{schema}" CASCADE')
        admin.close()


def _provider_view(client, booking_id):
    rows = client.get("/bookings", params={"provider_id": "P0023"}).json()
    return next(b for b in rows if b["booking_id"] == booking_id)


def _client_view(client, booking_id):
    rows = client.get("/bookings", params={"client_id": "C0501"}).json()
    return next(b for b in rows if b["booking_id"] == booking_id)


def test_directions_flow_end_to_end_on_postgres(real_db):
    client = real_db
    created = client.post("/bookings", json={
        **BODY, "job_date": "2026-10-13", "location_details": "  Galana Plaza, Apt 4B. Call at the gate.  ",
    })
    assert created.status_code == 201, created.text
    booking = created.json()
    bid = booking["booking_id"]
    assert booking["location_details"] == "Galana Plaza, Apt 4B. Call at the gate."
    assert booking["provider_phone"] is None  # pending

    pending = _provider_view(client, bid)
    assert pending["location_details"] is None and pending["client_phone"] is None

    accepted = client.patch(f"/bookings/{bid}/status",
                            json={"status": "confirmed", "actor": "provider", "actor_id": "P0023"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["location_details"] == "Galana Plaza, Apt 4B. Call at the gate."
    assert accepted.json()["client_phone"] == "0711223344"
    assert _provider_view(client, bid)["client_phone"] == "0711223344"
    assert _client_view(client, bid)["provider_phone"] == "0722334455"

    done = client.patch(f"/bookings/{bid}/status",
                        json={"status": "completed", "actor": "provider", "actor_id": "P0023"})
    assert done.status_code == 200, done.text
    assert _provider_view(client, bid)["client_phone"] is None
    assert _client_view(client, bid)["provider_phone"] is None


def test_exact_point_reaches_provider_after_accepting_on_postgres(real_db):
    client = real_db
    created = client.post("/bookings", json={**BODY, **EXACT, "job_date": "2026-10-13"})
    assert created.status_code == 201, created.text
    bid = created.json()["booking_id"]
    assert _provider_view(client, bid)["client_lat"] is None
    client.patch(f"/bookings/{bid}/status", json={"status": "confirmed", "actor": "provider", "actor_id": "P0023"})
    seen = _provider_view(client, bid)
    assert (seen["client_lat"], seen["client_lng"]) == (-1.2921, 36.7801)
    assert seen["location_details"] is None


def test_bookings_made_before_directions_existed_still_load(real_db):
    rows = real_db.get("/bookings", params={"provider_id": "P0023"}).json()
    legacy = rows[-1]
    assert legacy["status"] == "confirmed" and legacy["location_details"] is None
    assert legacy["client_phone"] == "0711223344"
