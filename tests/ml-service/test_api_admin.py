"""Administrator use cases from the use-case diagram."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import api


class AdminCursor:
    def __init__(self, role="admin"):
        self.role = role
        self.query = ""
        self.verified = False
        self.review_status = None
        self.note = None
        self.reviewer = None

    def execute(self, query, params=None):
        self.query = " ".join(query.split())
        if self.query.startswith("UPDATE service_providers"):
            self.verified = bool(params[0])
        elif self.query.startswith("INSERT INTO provider_identity_reviews"):
            self.review_status, self.reviewer, self.note = params[1], params[2], params[3]

    def fetchone(self):
        if self.query.startswith("SELECT role FROM users"):
            return (self.role,)
        if "SELECT COUNT(*) FROM bookings" in self.query:
            return (12, 3, 2, 5, 2, 20, 11, 7, 2, 4, 4.5)
        if self.query.startswith("SELECT user_id FROM users WHERE provider_id"):
            return None
        return None

    def fetchall(self):
        if self.query.startswith("SELECT u.user_id, u.role"):
            return [
                ("U0103", "provider", "New Provider", datetime(2026, 11, 24, 9, 30)),
                ("U0102", "client", "New Client", datetime(2026, 11, 23, 18, 5)),
            ]
        if "FROM service_providers sp" not in self.query:
            return []
        status = self.review_status or ("approved" if self.verified else "pending")
        return [(
            "P9000", "Test Provider", "plumber", "Kilimani", "0700000000",
            "provider@example.test", self.verified, status, self.note,
            datetime(2026, 10, 28, tzinfo=timezone.utc) if self.review_status else None,
            self.reviewer, datetime(2026, 10, 1),
        )]


@pytest.fixture
def admin_api(monkeypatch):
    cursor = AdminCursor()
    connection = MagicMock()
    connection.cursor.return_value = cursor
    monkeypatch.setattr(api, "_get_db_connection", lambda: connection)
    return TestClient(api.app), cursor, connection


def test_admin_overview_returns_platform_and_model_evidence(admin_api):
    client, _, _ = admin_api
    response = client.get("/admin/overview", params={"admin_user_id": "U0004"})
    assert response.status_code == 200
    body = response.json()
    assert body["platform"]["total_bookings"] == 12
    assert body["platform"]["pending_verifications"] == 7
    assert body["model"]["test"]["rmse"] == pytest.approx(0.141686, abs=1e-6)


def test_non_admin_is_forbidden(admin_api):
    client, cursor, _ = admin_api
    cursor.role = "client"
    assert client.get("/admin/providers", params={"admin_user_id": "U0007"}).status_code == 403


def test_admin_sees_registration_history_newest_first(admin_api):
    client, cursor, _ = admin_api
    response = client.get("/admin/registrations", params={"admin_user_id": "U0004", "limit": 10})
    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["user_id"] for row in body] == ["U0103", "U0102"]
    assert body[0] == {
        "user_id": "U0103", "role": "provider", "name": "New Provider",
        "registered_at": "2026-11-24T09:30:00",
    }
    assert "ORDER BY u.created_at DESC" in cursor.query


def test_registration_history_does_not_expose_email(admin_api):
    client, _, _ = admin_api
    body = client.get("/admin/registrations", params={"admin_user_id": "U0004"}).json()
    assert all("email" not in row and "password_hash" not in row for row in body)


def test_registration_history_is_admin_only(admin_api):
    client, cursor, _ = admin_api
    cursor.role = "provider"
    response = client.get("/admin/registrations", params={"admin_user_id": "U0007"})
    assert response.status_code == 403


def test_registration_history_rejects_out_of_range_limit(admin_api):
    client, _, _ = admin_api
    response = client.get("/admin/registrations", params={"admin_user_id": "U0004", "limit": 500})
    assert response.status_code == 422


def test_admin_can_review_provider_identity(admin_api):
    client, cursor, connection = admin_api
    response = client.patch("/admin/providers/P9000/verification", json={
        "admin_user_id": "U0004",
        "decision": "approve",
        "note": "Contact and profile evidence checked.",
    })
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "approved"
    assert response.json()["is_verified"] is True
    assert cursor.reviewer == "U0004"
    connection.commit.assert_called_once()


def test_retraining_trigger_is_single_flight(admin_api, monkeypatch):
    client, _, _ = admin_api
    state = {
        "status": "idle", "requested_by": None, "requested_at": None,
        "completed_at": None, "message": "idle",
    }
    monkeypatch.setattr(api, "_retrain_state", state)
    started = []

    class DeferredThread:
        def __init__(self, target, args, daemon):
            self.target, self.args, self.daemon = target, args, daemon

        def start(self):
            started.append((self.target, self.args, self.daemon))

    monkeypatch.setattr(api.threading, "Thread", DeferredThread)
    first = client.post("/admin/model/retrain", json={"admin_user_id": "U0004"})
    second = client.post("/admin/model/retrain", json={"admin_user_id": "U0004"})
    assert first.status_code == 202 and first.json()["status"] == "queued"
    assert second.status_code == 409
    assert len(started) == 1 and started[0][2] is True
