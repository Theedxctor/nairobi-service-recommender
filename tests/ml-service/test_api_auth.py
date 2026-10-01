from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import api

CLIENT_PAYLOAD = {
    "email": "wanjiku@example.com",
    "password": "supersecret",
    "role": "client",
    "name": "Wanjiku Kamau",
    "phone": "0712345678",
    "area_id": "A03",
}

PROVIDER_PAYLOAD = {
    "email": "auma@example.com",
    "password": "supersecret",
    "role": "provider",
    "name": "Auma Cheruiyot",
    "phone": "0798765432",
    "base_area_id": "A03",
    "service_type": "plumber",
    "hourly_rate_ksh": 900,
}


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def fake_db(monkeypatch):
    """Replaces the real Postgres connection + insert helpers with no-ops."""
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_insert_client", lambda *a, **k: None)
    monkeypatch.setattr(api, "_insert_provider", lambda *a, **k: None)
    monkeypatch.setattr(api, "_insert_user", lambda *a, **k: None)
    mock_insert_notification = MagicMock()
    monkeypatch.setattr(api, "_insert_notification", mock_insert_notification)
    return mock_insert_notification


# ---------------------------------------------------------------------------
# /auth/register
# ---------------------------------------------------------------------------
def test_register_success(client, fake_db, monkeypatch):
    monkeypatch.setattr(api, "_email_exists", lambda cursor, email: False)
    monkeypatch.setattr(api, "_next_id", lambda cursor, table, id_column, prefix: f"{prefix}0001")

    response = client.post("/auth/register", json=CLIENT_PAYLOAD)

    assert response.status_code == 200
    assert response.json() == {"user_id": "U0001", "role": "client"}

    fake_db.assert_called_once()
    notified_user_id, message = fake_db.call_args.args[1], fake_db.call_args.args[2]
    assert notified_user_id == "U0001"
    assert "Welcome to NaiServe, Wanjiku Kamau" in message


def test_register_provider_success(client, fake_db, monkeypatch):
    monkeypatch.setattr(api, "_email_exists", lambda cursor, email: False)
    monkeypatch.setattr(api, "_next_id", lambda cursor, table, id_column, prefix: f"{prefix}0001")

    response = client.post("/auth/register", json=PROVIDER_PAYLOAD)

    assert response.status_code == 200
    assert response.json() == {"user_id": "U0001", "role": "provider"}

    fake_db.assert_called_once()
    message = fake_db.call_args.args[2]
    assert "Welcome to NaiServe, Auma Cheruiyot" in message


def test_register_duplicate_email_returns_409(client, fake_db, monkeypatch):
    monkeypatch.setattr(api, "_email_exists", lambda cursor, email: True)

    response = client.post("/auth/register", json=CLIENT_PAYLOAD)

    assert response.status_code == 409


def test_register_missing_role_specific_fields_returns_400(client, fake_db):
    incomplete_provider = {k: v for k, v in PROVIDER_PAYLOAD.items() if k != "hourly_rate_ksh"}

    response = client.post("/auth/register", json=incomplete_provider)

    assert response.status_code == 400


def test_register_invalid_role_returns_400(client, fake_db):
    response = client.post("/auth/register", json={**CLIENT_PAYLOAD, "role": "admin"})

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# /auth/login
# ---------------------------------------------------------------------------
def test_login_success(client, fake_db, monkeypatch):
    password_hash = api._hash_password("correcthorse")
    monkeypatch.setattr(
        api,
        "_fetch_user_by_email",
        lambda cursor, email: {
            "user_id": "U0001",
            "password_hash": password_hash,
            "role": "client",
            "client_id": "C0001",
            "provider_id": None,
            "name": "Wanjiku Kamau",
        },
    )

    response = client.post(
        "/auth/login", json={"email": "wanjiku@example.com", "password": "correcthorse"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "U0001",
        "role": "client",
        "name": "Wanjiku Kamau",
        "client_id": "C0001",
    }


def test_login_wrong_password_returns_401(client, fake_db, monkeypatch):
    password_hash = api._hash_password("correcthorse")
    monkeypatch.setattr(
        api,
        "_fetch_user_by_email",
        lambda cursor, email: {
            "user_id": "U0001",
            "password_hash": password_hash,
            "role": "client",
            "client_id": "C0001",
            "provider_id": None,
            "name": "Wanjiku Kamau",
        },
    )

    response = client.post(
        "/auth/login", json={"email": "wanjiku@example.com", "password": "wrongpassword"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_login_unknown_email_returns_401(client, fake_db, monkeypatch):
    monkeypatch.setattr(api, "_fetch_user_by_email", lambda cursor, email: None)

    response = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "whatever"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
