from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import api


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def fake_conn(monkeypatch):
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------
def test_profile_client(client, fake_conn, monkeypatch):
    monkeypatch.setattr(
        api,
        "_fetch_profile",
        lambda cursor, user_id: {
            "user_id": "U0001",
            "role": "client",
            "email": "wanjiku@example.com",
            "member_since": datetime(2026, 1, 1, 9, 0, 0),
            "name": "Wanjiku Kamau",
            "phone": "0712345678",
            "area_name": "Kilimani",
            "base_area_name": None,
            "service_type": None,
            "hourly_rate_ksh": None,
            "rating": None,
            "completion_rate": None,
            "experience_years": None,
            "is_verified": None,
        },
    )

    response = client.get("/profile", params={"user_id": "U0001"})

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Wanjiku Kamau"
    assert body["area_name"] == "Kilimani"
    assert "service_type" not in body  # excluded via response_model_exclude_none


def test_profile_provider(client, fake_conn, monkeypatch):
    monkeypatch.setattr(
        api,
        "_fetch_profile",
        lambda cursor, user_id: {
            "user_id": "U0002",
            "role": "provider",
            "email": "auma@example.com",
            "member_since": datetime(2026, 1, 2, 9, 0, 0),
            "name": "Auma Cheruiyot",
            "phone": "0798765432",
            "area_name": None,
            "base_area_name": "Kilimani",
            "service_type": "plumber",
            "hourly_rate_ksh": 900,
            "rating": 4.8,
            "completion_rate": 0.9,
            "experience_years": 5.0,
            "is_verified": True,
        },
    )

    response = client.get("/profile", params={"user_id": "U0002"})

    assert response.status_code == 200
    body = response.json()
    assert body["service_type"] == "plumber"
    assert body["is_verified"] is True
    assert "area_name" not in body


def test_profile_admin_has_null_name(client, fake_conn, monkeypatch):
    monkeypatch.setattr(
        api,
        "_fetch_profile",
        lambda cursor, user_id: {
            "user_id": "U0004",
            "role": "admin",
            "email": "admin@naiserve.test",
            "member_since": datetime(2026, 1, 3, 9, 0, 0),
            "name": None,
            "phone": None,
            "area_name": None,
            "base_area_name": None,
            "service_type": None,
            "hourly_rate_ksh": None,
            "rating": None,
            "completion_rate": None,
            "experience_years": None,
            "is_verified": None,
        },
    )

    response = client.get("/profile", params={"user_id": "U0004"})

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "admin"
    assert "name" not in body  # excluded since None -- frontend handles the fallback


def test_profile_unknown_user_returns_404(client, fake_conn, monkeypatch):
    monkeypatch.setattr(api, "_fetch_profile", lambda cursor, user_id: None)

    response = client.get("/profile", params={"user_id": "U9999"})

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /notifications
# ---------------------------------------------------------------------------
def test_list_notifications_newest_first(client, fake_conn, monkeypatch):
    monkeypatch.setattr(
        api,
        "_fetch_notifications",
        lambda cursor, user_id: [
            {
                "notification_id": 2,
                "user_id": "U0001",
                "message": "Second notification",
                "is_read": False,
                "created_at": datetime(2026, 1, 2, 9, 0, 0),
            },
            {
                "notification_id": 1,
                "user_id": "U0001",
                "message": "Welcome to NaiServe, Wanjiku Kamau! Ready to request your first service?",
                "is_read": True,
                "created_at": datetime(2026, 1, 1, 9, 0, 0),
            },
        ],
    )

    response = client.get("/notifications", params={"user_id": "U0001"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["notification_id"] == 2
    assert body[0]["is_read"] is False
    assert body[1]["is_read"] is True


def test_list_notifications_empty(client, fake_conn, monkeypatch):
    monkeypatch.setattr(api, "_fetch_notifications", lambda cursor, user_id: [])

    response = client.get("/notifications", params={"user_id": "U0003"})

    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# PATCH /notifications/{id}/read
# ---------------------------------------------------------------------------
def test_mark_notification_read_success(client, fake_conn, monkeypatch):
    monkeypatch.setattr(
        api,
        "_mark_notification_read",
        lambda cursor, notification_id: {
            "notification_id": notification_id,
            "user_id": "U0001",
            "message": "Welcome to NaiServe, Wanjiku Kamau! Ready to request your first service?",
            "is_read": True,
            "created_at": datetime(2026, 1, 1, 9, 0, 0),
        },
    )

    response = client.patch("/notifications/1/read")

    assert response.status_code == 200
    body = response.json()
    assert body["notification_id"] == 1
    assert body["is_read"] is True


def test_mark_notification_read_unknown_id_returns_404(client, fake_conn, monkeypatch):
    monkeypatch.setattr(api, "_mark_notification_read", lambda cursor, notification_id: None)

    response = client.patch("/notifications/999/read")

    assert response.status_code == 404
