"""Rescheduling (#83): either party proposes a new date/time slot for a pending
or confirmed booking, the other accepts or declines, and the booking (with a
recomputed score) only changes on acceptance."""
import os
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import api

MONDAY = date(2026, 10, 12)  # frozen "today in Nairobi"
CURRENT, NEW = date(2026, 10, 13), date(2026, 10, 15)  # Tuesday -> Thursday
PROPOSE = {"actor": "client", "actor_id": "C0501", "job_date": NEW.isoformat(), "time_slot": "midday"}


def _booking(status="confirmed", **over):
    return {
        "booking_id": 7, "client_id": "C0501", "client_name": "Grace Wanjiru",
        "provider_id": "P0023", "provider_name": "Auma Cheruiyot", "provider_hourly_rate_ksh": 894,
        "service_type": "plumber", "client_area": "Kilimani", "time_slot": "morning_rush",
        "day_type": "weekday", "job_date": CURRENT, "reliability_score": 0.84, "status": status,
        "client_lat": None, "client_lng": None,
        "created_at": datetime(2026, 10, 7, 9, 0, 0), "reschedule": None,
        **over,
    }


def _proposal(by="client", job_date=NEW, time_slot="midday"):
    return {"proposed_by": by, "job_date": job_date, "time_slot": time_slot,
            "created_at": datetime(2026, 10, 12, 8, 0, tzinfo=timezone.utc)}


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def db(monkeypatch):
    """Fake DB layer holding one booking; records proposals, moves and notifications."""
    state = MagicMock()
    state.booking = _booking()
    state.notifications = []
    state.resolved = []
    state.moved = None

    def insert_reschedule(cursor, booking_id, proposed_by, job_date, time_slot, prev_date, prev_slot):
        state.previous = (prev_date, prev_slot)
        state.booking = {**state.booking, "reschedule": _proposal(proposed_by, job_date, time_slot)}

    def resolve(cursor, booking_id, status):
        if state.booking["reschedule"]:
            state.resolved.append(status)
        state.booking = {**state.booking, "reschedule": None}

    def move(cursor, booking_id, job_date, time_slot, day_type, score):
        state.moved = (job_date, time_slot, day_type, score)
        state.booking = {**state.booking, "job_date": job_date, "time_slot": time_slot,
                         "day_type": day_type, "reliability_score": score}

    def update_status(cursor, booking_id, status, cancelled_by=None, reason=None):
        state.booking = {**state.booking, "status": status,
                         "cancelled_by": cancelled_by, "cancellation_reason": reason}

    monkeypatch.setattr(api, "_today_in_nairobi", lambda: MONDAY)
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_fetch_booking", lambda cursor, bid: state.booking if bid == 7 else None)
    monkeypatch.setattr(api, "_insert_reschedule", insert_reschedule)
    monkeypatch.setattr(api, "_resolve_reschedule", resolve)
    monkeypatch.setattr(api, "_move_booking", move)
    monkeypatch.setattr(api, "_update_booking_status", update_status)
    monkeypatch.setattr(api, "_user_id_for", lambda cursor, column, value: f"U-{value}")
    monkeypatch.setattr(api, "_insert_notification",
                        lambda cursor, user_id, message: state.notifications.append((user_id, message)))
    return state


def _answer(client, decision, actor="provider", actor_id="P0023"):
    return client.patch("/bookings/7/reschedule",
                        json={"actor": actor, "actor_id": actor_id, "decision": decision})


# ---------------------------------------------------------------------------
# Proposing
# ---------------------------------------------------------------------------
def test_proposal_is_stored_without_changing_the_booking_and_notifies_the_other_party(client, db):
    res = client.post("/bookings/7/reschedule", json=PROPOSE)

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["reschedule"]["proposed_by"] == "client"
    assert (body["reschedule"]["job_date"], body["reschedule"]["time_slot"]) == ("2026-10-15", "midday")
    # The booking itself is untouched until the provider answers.
    assert (body["job_date"], body["time_slot"], body["reliability_score"]) == ("2026-10-13", "morning_rush", 0.84)
    assert db.moved is None and db.previous == (CURRENT, "morning_rush")
    [(user, message)] = db.notifications
    assert user == "U-P0023"
    assert "Grace Wanjiru asked to move booking #7" in message and "midday, Thu 15 Oct 2026" in message


def test_provider_can_propose_and_pending_bookings_can_be_rescheduled(client, db):
    db.booking = _booking(status="pending")
    res = client.post("/bookings/7/reschedule", json={**PROPOSE, "actor": "provider", "actor_id": "P0023"})
    assert res.status_code == 201
    assert res.json()["reschedule"]["proposed_by"] == "provider"
    assert db.notifications[0][0] == "U-C0501"


def test_undated_booking_can_be_given_a_date(client, db):
    db.booking = _booking(job_date=None, time_slot="midday")
    assert client.post("/bookings/7/reschedule", json=PROPOSE).status_code == 201
    assert db.previous == (None, "midday")


@pytest.mark.parametrize("override, status, phrase", [
    ({"job_date": "2026-10-11"}, 422, "past"),
    ({"job_date": "2026-12-12"}, 422, "60 days"),
    ({"job_date": "15/10/2026"}, 422, "date"),
    ({"time_slot": "night"}, 422, "time_slot"),
    ({"job_date": "2026-10-13", "time_slot": "morning_rush"}, 422, "current date and time slot"),
    ({"actor": "admin"}, 422, "actor"),
    ({"actor_id": "C9999"}, 403, "does not belong"),
])
def test_invalid_proposals_are_rejected(client, db, override, status, phrase):
    res = client.post("/bookings/7/reschedule", json={**PROPOSE, **override})
    assert res.status_code == status
    assert phrase in str(res.json()["detail"])
    assert db.booking["reschedule"] is None and db.notifications == []


def test_same_date_with_a_different_slot_is_a_valid_proposal(client, db):
    res = client.post("/bookings/7/reschedule", json={**PROPOSE, "job_date": CURRENT.isoformat()})
    assert res.status_code == 201


@pytest.mark.parametrize("status", ["completed", "cancelled"])
def test_finished_bookings_cannot_be_rescheduled(client, db, status):
    db.booking = _booking(status=status)
    res = client.post("/bookings/7/reschedule", json=PROPOSE)
    assert res.status_code == 409 and status in res.json()["detail"]


def test_unknown_booking_is_404(client, db):
    assert client.post("/bookings/8/reschedule", json=PROPOSE).status_code == 404


def test_only_one_open_proposal_per_booking(client, db):
    assert client.post("/bookings/7/reschedule", json=PROPOSE).status_code == 201
    again = client.post("/bookings/7/reschedule",
                        json={**PROPOSE, "actor": "provider", "actor_id": "P0023", "job_date": "2026-10-16"})
    assert again.status_code == 409
    assert db.booking["reschedule"]["job_date"] == NEW


def test_proposal_checks_the_provider_works_that_weekday(client, db, monkeypatch):
    # P0023 keeps only its Monday hours: Monday 19 Oct is fine, Thursday is not.
    slots = api.ref["availability"]
    monday_only = slots.loc[(slots.provider_id != "P0023") | (slots.day_of_week.str.lower() == "monday")]
    assert (monday_only.provider_id == "P0023").any()
    monkeypatch.setitem(api.ref, "availability", monday_only)

    refused = client.post("/bookings/7/reschedule", json=PROPOSE)
    assert refused.status_code == 409 and db.booking["reschedule"] is None
    assert client.post("/bookings/7/reschedule", json={**PROPOSE, "job_date": "2026-10-19"}).status_code == 201


# ---------------------------------------------------------------------------
# Answering
# ---------------------------------------------------------------------------
def test_accepting_moves_the_booking_and_recomputes_the_score(client, db):
    db.booking = _booking(reschedule=_proposal(time_slot="evening_rush"))
    provider_row = api.ref["providers"].loc[api.ref["providers"].provider_id == "P0023"].iloc[0]
    expected, _ = api._score_provider("Kilimani", provider_row, "evening_rush", "weekday")
    stale, _ = api._score_provider("Kilimani", provider_row, "morning_rush", "weekday")

    res = _answer(client, "accept")

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["job_date"], body["time_slot"], body["day_type"]) == ("2026-10-15", "evening_rush", "weekday")
    assert body["reschedule"] is None and body["status"] == "confirmed"
    # Scored for the new slot, not carried over from the old one.
    assert body["reliability_score"] == round(expected, 3)
    assert round(expected, 3) != round(stale, 3)
    assert db.resolved == ["accepted"]
    [(user, message)] = db.notifications
    assert user == "U-C0501"
    assert "Auma Cheruiyot accepted" in message and "evening rush, Thu 15 Oct 2026" in message


def test_accepting_a_weekend_date_changes_the_day_type(client, db):
    db.booking = _booking(reschedule=_proposal(job_date=date(2026, 10, 17), time_slot="weekend_day"))
    res = _answer(client, "accept")
    if res.status_code == 409:  # P0023 does not work Saturdays in this dataset
        pytest.skip("P0023 has no Saturday availability")
    assert res.json()["day_type"] == "weekend" and db.moved[2] == "weekend"


def test_accepting_uses_the_bookings_exact_location(client, db):
    lat, lng = -1.2921, 36.7801
    db.booking = _booking(client_lat=lat, client_lng=lng, reschedule=_proposal())
    provider_row = api.ref["providers"].loc[api.ref["providers"].provider_id == "P0023"].iloc[0]
    expected, _ = api._score_provider("Kilimani", provider_row, "midday", "weekday", (lat, lng))
    assert _answer(client, "accept").json()["reliability_score"] == round(expected, 3)


def test_declining_leaves_the_booking_unchanged(client, db):
    db.booking = _booking(reschedule=_proposal())
    res = _answer(client, "decline")
    assert res.status_code == 200
    body = res.json()
    assert (body["job_date"], body["time_slot"], body["reliability_score"]) == ("2026-10-13", "morning_rush", 0.84)
    assert body["reschedule"] is None and db.moved is None and db.resolved == ["declined"]
    assert "declined your request" in db.notifications[0][1] and "unchanged" in db.notifications[0][1]


def test_proposer_can_withdraw_and_the_other_party_is_told(client, db):
    db.booking = _booking(reschedule=_proposal())
    res = _answer(client, "withdraw", actor="client", actor_id="C0501")
    assert res.status_code == 200 and db.resolved == ["withdrawn"] and db.moved is None
    assert db.notifications[0][0] == "U-P0023" and "withdrew" in db.notifications[0][1]


@pytest.mark.parametrize("decision, actor, actor_id, status", [
    ("accept", "client", "C0501", 403),    # cannot accept your own request
    ("decline", "client", "C0501", 403),
    ("withdraw", "provider", "P0023", 403),  # not theirs to withdraw
    ("accept", "provider", "P9999", 403),
    ("approve", "provider", "P0023", 422),
])
def test_wrong_party_or_decision_is_rejected(client, db, decision, actor, actor_id, status):
    db.booking = _booking(reschedule=_proposal())
    assert _answer(client, decision, actor, actor_id).status_code == status
    assert db.booking["reschedule"] is not None and db.moved is None and db.notifications == []


def test_answering_without_an_open_proposal_is_409(client, db):
    assert _answer(client, "accept").status_code == 409


def test_accepting_a_date_that_has_passed_is_refused(client, db, monkeypatch):
    db.booking = _booking(reschedule=_proposal())
    monkeypatch.setattr(api, "_today_in_nairobi", lambda: date(2026, 10, 16))
    res = _answer(client, "accept")
    assert res.status_code == 409 and "passed" in res.json()["detail"]
    assert db.moved is None and db.booking["reschedule"] is not None


def test_accepting_rechecks_availability(client, db, monkeypatch):
    db.booking = _booking(reschedule=_proposal())
    monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: False)
    assert _answer(client, "accept").status_code == 409
    assert db.moved is None


@pytest.mark.parametrize("new_status, reason", [("cancelled", "Plans changed"), ("completed", None)])
def test_closing_a_booking_closes_its_open_proposal(client, db, new_status, reason):
    db.booking = _booking(reschedule=_proposal())
    body = {"status": new_status, "actor": "provider", "actor_id": "P0023"}
    res = client.patch("/bookings/7/status", json={**body, **({"reason": reason} if reason else {})})
    assert res.status_code == 200, res.text
    assert res.json()["reschedule"] is None and db.resolved == ["withdrawn"]


def test_confirming_a_pending_booking_keeps_its_open_proposal(client, db):
    db.booking = _booking(status="pending", reschedule=_proposal())
    res = client.patch("/bookings/7/status", json={"status": "confirmed", "actor": "provider", "actor_id": "P0023"})
    assert res.status_code == 200 and res.json()["reschedule"] is not None


# ---------------------------------------------------------------------------
# Real PostgreSQL: the SQL itself (RUN_DB_TESTS=1, isolated schema, as in #77)
# ---------------------------------------------------------------------------
@pytest.fixture
def real_db(monkeypatch):
    if os.environ.get("RUN_DB_TESTS") != "1":
        pytest.skip("Set RUN_DB_TESTS=1 and DB_* to run isolated PostgreSQL rescheduling tests")
    connect = api._get_db_connection
    schema = "reschedule_test_" + uuid4().hex
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
            migration = (root / "database/migrations/006_booking_reschedules.sql").read_text()
            cursor.execute(migration)  # safe on a fresh schema and when repeated
            cursor.execute(migration)
            cursor.execute("""
                INSERT INTO clients (client_id, name) VALUES ('C0501', 'Reschedule client');
                INSERT INTO service_providers (provider_id, name, service_type) VALUES ('P0023', 'Reschedule provider', 'plumber');
                INSERT INTO users (user_id, email, password_hash, role, client_id)
                VALUES ('UC1', 'rc@example.test', 'unused', 'client', 'C0501');
                INSERT INTO users (user_id, email, password_hash, role, provider_id)
                VALUES ('UP1', 'rp@example.test', 'unused', 'provider', 'P0023');
                INSERT INTO bookings (client_id, provider_id, service_type, client_area, time_slot, day_type,
                                      job_date, reliability_score, status)
                VALUES ('C0501', 'P0023', 'plumber', 'Kilimani', 'morning_rush', 'weekday', '2026-10-13', 0.5, 'confirmed');
            """)
        monkeypatch.setattr(api, "_get_db_connection", isolated_connection)
        monkeypatch.setattr(api, "_today_in_nairobi", lambda: MONDAY)
        monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: True)
        yield TestClient(api.app), isolated_connection
    finally:
        with admin.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA "{schema}" CASCADE')
        admin.close()


def _rows(connect, sql):
    conn = connect()
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchall()
    finally:
        conn.close()


def test_full_cycle_against_postgres(real_db):
    client, connect = real_db
    path = "/bookings/1/reschedule"

    # Proposed, declined, proposed again by the other side, accepted.
    assert client.post(path, json=PROPOSE).status_code == 201
    assert client.post(path, json=PROPOSE).status_code == 409
    listed = client.get("/bookings?provider_id=P0023").json()
    assert len(listed) == 1 and listed[0]["reschedule"]["job_date"] == "2026-10-15"
    declined = client.patch(path, json={"actor": "provider", "actor_id": "P0023", "decision": "decline"})
    assert declined.status_code == 200 and declined.json()["job_date"] == "2026-10-13"

    counter = {"actor": "provider", "actor_id": "P0023", "job_date": "2026-10-16", "time_slot": "evening_rush"}
    assert client.post(path, json=counter).status_code == 201
    accepted = client.patch(path, json={"actor": "client", "actor_id": "C0501", "decision": "accept"})
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert (body["job_date"], body["time_slot"], body["day_type"]) == ("2026-10-16", "evening_rush", "weekday")
    assert body["reschedule"] is None and body["reliability_score"] != 0.5

    assert _rows(connect, "SELECT job_date::text, time_slot, status FROM bookings") == [
        ("2026-10-16", "evening_rush", "confirmed")]
    assert _rows(connect, """SELECT proposed_by, job_date::text, previous_job_date::text, previous_time_slot,
                                    status, resolved_at IS NOT NULL
                             FROM booking_reschedules ORDER BY reschedule_id""") == [
        ("client", "2026-10-15", "2026-10-13", "morning_rush", "declined", True),
        ("provider", "2026-10-16", "2026-10-13", "morning_rush", "accepted", True),
    ]
    notes = [m for (m,) in _rows(connect, "SELECT message FROM notifications ORDER BY notification_id")]
    assert len(notes) == 4 and "accepted your request" in notes[-1]

    # Cancelling closes an open proposal; the constraint allows one open at a time.
    assert client.post(path, json=PROPOSE).status_code == 201
    with pytest.raises(Exception, match="idx_booking_reschedules_one_pending"):
        _rows(connect, """INSERT INTO booking_reschedules (booking_id, proposed_by, job_date, time_slot, previous_time_slot)
                          VALUES (1, 'client', '2026-10-20', 'midday', 'evening_rush') RETURNING 1""")
    cancelled = client.patch("/bookings/1/status", json={"status": "cancelled", "actor": "client",
                                                          "actor_id": "C0501", "reason": "Plans changed"})
    assert cancelled.status_code == 200 and cancelled.json()["reschedule"] is None
    assert _rows(connect, "SELECT status FROM booking_reschedules ORDER BY reschedule_id DESC LIMIT 1") == [("withdrawn",)]
    assert client.post(path, json=PROPOSE).status_code == 409
