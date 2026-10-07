from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import api

CREATE_BODY = {
    "client_id": "C0501",
    "provider_id": "P0023",
    "client_area": "Kilimani",
    "time_slot": "morning_rush",
    "day_type": "weekday",
}


def _booking(status="pending", **over):
    return {
        "booking_id": 7,
        "client_id": "C0501",
        "client_name": "Grace Wanjiru",
        "provider_id": "P0023",
        "provider_name": "Auma Cheruiyot",
        "provider_hourly_rate_ksh": 894,
        "service_type": "plumber",
        "client_area": "Kilimani",
        "time_slot": "morning_rush",
        "day_type": "weekday",
        "reliability_score": 0.84,
        "status": status,
        "created_at": datetime(2026, 10, 7, 9, 0, 0),
        **over,
    }


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def db(monkeypatch):
    """Fake DB layer: one stored booking, every user has an account, and
    every notification sent is recorded in db.notifications."""
    state = MagicMock()
    state.booking = _booking()
    state.notifications = []
    state.inserted = None

    def insert_booking(cursor, *args):
        state.inserted = args
        return 7

    def update_status(cursor, booking_id, status):
        state.booking = {**state.booking, "status": status}

    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_client_exists", lambda cursor, cid: cid == "C0501")
    monkeypatch.setattr(api, "_insert_booking", insert_booking)
    monkeypatch.setattr(api, "_fetch_booking", lambda cursor, bid: state.booking if bid == 7 else None)
    monkeypatch.setattr(api, "_fetch_bookings", lambda cursor, column, value: [state.booking])
    monkeypatch.setattr(api, "_update_booking_status", update_status)
    monkeypatch.setattr(api, "_user_id_for", lambda cursor, column, value: f"U-{value}")
    monkeypatch.setattr(api, "_insert_notification",
                        lambda cursor, user_id, message: state.notifications.append((user_id, message)))
    return state


# ---------------------------------------------------------------------------
# POST /bookings
# ---------------------------------------------------------------------------
def test_create_booking_recomputes_score_and_notifies_both_sides(client, db):
    res = client.post("/bookings", json={**CREATE_BODY, "reliability_score": 0.99})

    assert res.status_code == 201
    # (client_id, provider_id, service_type, area, slot, day, score)
    client_id, provider_id, service_type, _, _, _, score = db.inserted
    assert (client_id, provider_id, service_type) == ("C0501", "P0023", "plumber")
    assert score != 0.99 and 0.0 <= score <= 1.0  # browser-sent score ignored
    recipients = {user for user, _ in db.notifications}
    assert recipients == {"U-P0023", "U-C0501"}


def test_create_booking_normalises_labels(client, db):
    res = client.post("/bookings", json={**CREATE_BODY, "time_slot": "Morning Rush"})
    assert res.status_code == 201
    assert db.inserted[4] == "morning_rush"


@pytest.mark.parametrize("override, status", [
    ({"provider_id": "P9999"}, 404),
    ({"client_id": "C9999"}, 404),
    ({"client_area": "Atlantis"}, 422),
    ({"time_slot": "night"}, 409),  # no provider in the dataset works nights
])
def test_create_booking_rejections(client, db, override, status):
    res = client.post("/bookings", json={**CREATE_BODY, **override})
    assert res.status_code == status
    assert db.inserted is None
    assert db.notifications == []


# ---------------------------------------------------------------------------
# GET /bookings
# ---------------------------------------------------------------------------
def test_list_bookings_for_client(client, db):
    res = client.get("/bookings", params={"client_id": "C0501"})
    assert res.status_code == 200
    assert res.json()[0]["provider_name"] == "Auma Cheruiyot"


@pytest.mark.parametrize("params", [{}, {"client_id": "C0501", "provider_id": "P0023"}])
def test_list_bookings_requires_exactly_one_filter(client, db, params):
    assert client.get("/bookings", params=params).status_code == 400


# ---------------------------------------------------------------------------
# PATCH /bookings/{id}/status
# ---------------------------------------------------------------------------
def _patch(client, status, actor, actor_id, booking_id=7):
    return client.patch(f"/bookings/{booking_id}/status",
                        json={"status": status, "actor": actor, "actor_id": actor_id})


@pytest.mark.parametrize("start, status, actor, actor_id, notified, phrase", [
    ("pending", "confirmed", "provider", "P0023", "U-C0501", "confirmed your booking #7"),
    ("pending", "cancelled", "provider", "P0023", "U-C0501", "declined your booking #7"),
    ("confirmed", "completed", "provider", "P0023", "U-C0501", "as completed"),
    ("confirmed", "cancelled", "provider", "P0023", "U-C0501", "cancelled your booking #7"),
    ("pending", "cancelled", "client", "C0501", "U-P0023", "Grace Wanjiru cancelled booking #7"),
])
def test_allowed_transitions_update_and_notify_other_party(
        client, db, start, status, actor, actor_id, notified, phrase):
    db.booking = _booking(status=start)
    res = _patch(client, status, actor, actor_id)

    assert res.status_code == 200
    assert res.json()["status"] == status
    assert len(db.notifications) == 1
    user, message = db.notifications[0]
    assert user == notified and phrase in message


@pytest.mark.parametrize("start, status, actor, actor_id", [
    ("pending", "confirmed", "client", "C0501"),     # client can't confirm
    ("pending", "completed", "provider", "P0023"),   # must confirm first
    ("completed", "cancelled", "client", "C0501"),   # completed is final
    ("cancelled", "confirmed", "provider", "P0023"),  # cancelled is final
])
def test_disallowed_transitions_return_409(client, db, start, status, actor, actor_id):
    db.booking = _booking(status=start)
    res = _patch(client, status, actor, actor_id)
    assert res.status_code == 409
    assert db.booking["status"] == start
    assert db.notifications == []


def test_wrong_owner_returns_403(client, db):
    assert _patch(client, "confirmed", "provider", "P0040").status_code == 403


def test_unknown_booking_returns_404(client, db):
    assert _patch(client, "confirmed", "provider", "P0023", booking_id=999).status_code == 404


def test_unknown_actor_returns_422(client, db):
    assert _patch(client, "confirmed", "admin", "U0004").status_code == 422
