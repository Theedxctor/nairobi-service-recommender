"""Google sign-in and email verification (#95).

Most of this runs against real PostgreSQL in an isolated schema (RUN_DB_TESTS=1
plus DB_*), because the behaviour that matters is what ends up in `users`.
Google's token check is replaced by a stand-in: a real ID token can only come
from a person clicking Google's button.
"""
import io
import json
import os
import urllib.error
from datetime import date
from pathlib import Path
from uuid import uuid4

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import api

pytestmark = pytest.mark.real_verification

CLIENT = {"email": "Wanjiku@Example.com", "password": "supersecret", "role": "client",
          "name": "Wanjiku Kamau", "phone": "0712345678", "area_id": "A03"}
PROVIDER = {"email": "fundi@example.com", "password": "supersecret", "role": "provider",
            "name": "Fundi Otieno", "phone": "0798765432", "base_area_id": "A03",
            "service_type": "plumber", "hourly_rate_ksh": 900}
BOOKING = {"provider_id": "P0023", "client_area": "Kilimani", "time_slot": "midday", "job_date": "2026-10-13"}
GOOGLE = {"sub": "google-sub-123", "email": "wanjiku@example.com", "name": "Wanjiku Kamau"}


@pytest.fixture
def app_db(monkeypatch):
    if os.environ.get("RUN_DB_TESTS") != "1":
        pytest.skip("Set RUN_DB_TESTS=1 and DB_* to run isolated PostgreSQL verification tests")
    connect = api._get_db_connection
    schema = "verify_test_" + uuid4().hex
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
    sent = []  # (email, name, token) for every verification email "sent"
    try:
        with isolated_connection() as conn, conn.cursor() as cursor:
            cursor.execute((root / "database/schema.sql").read_text())
            migration = (root / "database/migrations/007_email_verification_google.sql").read_text()
            cursor.execute(migration)  # safe on a fresh schema and when repeated
            cursor.execute(migration)
            cursor.execute("""
                INSERT INTO nairobi_areas (area_id, area_name, geom)
                VALUES ('A03', 'Kilimani', ST_SetSRID(ST_MakePoint(36.78, -1.29), 4326));
                -- P0023 is a dataset provider with no login account. P9000 only
                -- moves the id counter so new providers do not reuse real ids.
                INSERT INTO service_providers (provider_id, name, service_type)
                VALUES ('P0023', 'Auma Cheruiyot', 'plumber'), ('P9000', 'Placeholder', 'none');
            """)
        monkeypatch.setattr(api, "_get_db_connection", isolated_connection)
        monkeypatch.setattr(api, "_today_in_nairobi", lambda: date(2026, 10, 12))
        monkeypatch.setattr(api, "_send_verification_email",
                            lambda email, name, token: sent.append((email, name, token)) or True)
        monkeypatch.setitem(api.ref, "providers", api.ref["providers"].copy())
        yield TestClient(api.app), isolated_connection, sent
    finally:
        with admin.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA "{schema}" CASCADE')
        admin.close()


def _sql(connect, sql, params=()):
    conn = connect()
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall() if cursor.description else None
        conn.commit()
        return rows
    finally:
        conn.close()


def _login(client, payload=CLIENT):
    return client.post("/auth/login", json={"email": payload["email"], "password": payload["password"]})


def _as_google(monkeypatch, identity=GOOGLE):
    monkeypatch.setattr(api, "_verify_google_credential", lambda credential: dict(identity))


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------
def test_password_account_must_verify_before_booking(app_db):
    client, connect, sent = app_db
    reg = client.post("/auth/register", json=CLIENT)
    assert reg.status_code == 200, reg.text
    assert reg.json() == {"user_id": "U0001", "role": "client", "email_verified": False,
                          "verification_email_sent": True}
    [(email, name, token)] = sent
    assert (email, name) == ("wanjiku@example.com", "Wanjiku Kamau")
    # Only the token's hash is stored.
    [(stored,)] = _sql(connect, "SELECT token_hash FROM email_verification_tokens")
    assert stored == api._hash_token(token) and token not in stored

    login = _login(client).json()
    assert login["email_verified"] is False
    assert client.get("/profile?user_id=U0001").json()["email_verified"] is False
    refused = client.post("/bookings", json={"client_id": login["client_id"], **BOOKING})
    assert refused.status_code == 403 and "Verify your email" in refused.json()["detail"]
    assert _sql(connect, "SELECT count(*) FROM bookings") == [(0,)]

    verified = client.post("/auth/verify-email", json={"token": token})
    assert verified.status_code == 200 and verified.json() == {"user_id": "U0001", "email_verified": True}
    assert _login(client).json()["email_verified"] is True
    assert client.get("/profile?user_id=U0001").json()["email_verified"] is True
    assert client.post("/bookings", json={"client_id": login["client_id"], **BOOKING}).status_code == 201
    notes = [m for (m,) in _sql(connect, "SELECT message FROM notifications WHERE user_id = 'U0001'")]
    assert any("email address is verified" in m for m in notes)

    # The link works once.
    again = client.post("/auth/verify-email", json={"token": token})
    assert again.status_code == 400 and "already been used" in again.json()["detail"]


def test_wrong_and_expired_links_are_refused(app_db):
    client, connect, sent = app_db
    client.post("/auth/register", json=CLIENT)
    token = sent[0][2]
    assert client.post("/auth/verify-email", json={"token": "not-a-real-token"}).status_code == 400

    _sql(connect, "UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 minute'")
    expired = client.post("/auth/verify-email", json={"token": token})
    assert expired.status_code == 410 and "expired" in expired.json()["detail"]
    assert _login(client).json()["email_verified"] is False
    assert _sql(connect, "SELECT count(*) FROM email_verification_tokens") == [(0,)]


def test_resend_replaces_the_link_and_is_rate_limited(app_db):
    client, connect, sent = app_db
    client.post("/auth/register", json=CLIENT)
    first = sent[0][2]

    too_soon = client.post("/auth/resend-verification", json={"user_id": "U0001"})
    assert too_soon.status_code == 429 and "wait" in too_soon.json()["detail"]
    assert len(sent) == 1

    _sql(connect, "UPDATE email_verification_tokens SET created_at = NOW() - INTERVAL '2 minutes'")
    resent = client.post("/auth/resend-verification", json={"user_id": "U0001"})
    assert resent.status_code == 200 and resent.json() == {"sent": True}
    second = sent[1][2]
    assert second != first
    assert client.post("/auth/verify-email", json={"token": first}).status_code == 400  # replaced
    assert client.post("/auth/verify-email", json={"token": second}).status_code == 200

    assert client.post("/auth/resend-verification", json={"user_id": "U0001"}).status_code == 409
    assert client.post("/auth/resend-verification", json={"user_id": "U9999"}).status_code == 404


def test_unverified_provider_is_not_recommended_or_bookable_and_cannot_accept(app_db, monkeypatch):
    client, connect, sent = app_db
    reg = client.post("/auth/register", json=PROVIDER)
    assert reg.status_code == 200, reg.text
    provider_id = _login(client, PROVIDER).json()["provider_id"]
    assert provider_id == "P9001"
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    hours = pd.DataFrame([{"provider_id": provider_id, "day_of_week": d, "start_time": "08:00",
                           "end_time": "17:00"} for d in days])
    monkeypatch.setitem(api.ref, "availability", pd.concat([api.ref["availability"], hours], ignore_index=True))
    search = {"client_area": "Kilimani", "service_type": "plumber", "time_slot": "midday",
              "job_date": "2026-10-13", "top_n": 1000}
    def offered():
        res = client.post("/recommend", json=search)
        assert res.status_code == 200, res.text
        return {p["provider_id"] for p in res.json()}

    assert api._unverified_provider_ids() == {provider_id}
    others = offered()
    assert provider_id not in others
    # P0023 (dataset provider, no login account) is still offered.
    assert "P0023" in others

    # A verified client cannot book them, and an old pending request cannot be accepted.
    _as_google(monkeypatch)
    client.post("/auth/register", json={**CLIENT, "google_credential": "token"})
    refused = client.post("/bookings", json={"client_id": "C0001", **BOOKING, "provider_id": provider_id})
    assert refused.status_code == 409 and "not taking bookings yet" in refused.json()["detail"]
    _sql(connect, """INSERT INTO bookings (client_id, provider_id, service_type, client_area, time_slot, day_type)
                     VALUES ('C0001', %s, 'plumber', 'Kilimani', 'midday', 'weekday')""", (provider_id,))
    accept = {"status": "confirmed", "actor": "provider", "actor_id": provider_id}
    blocked = client.patch("/bookings/1/status", json=accept)
    assert blocked.status_code == 403 and "Verify your email" in blocked.json()["detail"]
    # Declining is still allowed: the client should not be left waiting.
    _sql(connect, """INSERT INTO bookings (client_id, provider_id, service_type, client_area, time_slot, day_type)
                     VALUES ('C0001', %s, 'plumber', 'Kilimani', 'midday', 'weekday')""", (provider_id,))
    assert client.patch("/bookings/2/status", json={**accept, "status": "cancelled"}).status_code == 200

    token = next(t for e, _, t in sent if e == "fundi@example.com")
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    assert offered() == others | {provider_id}
    assert client.patch("/bookings/1/status", json=accept).status_code == 200
    assert client.post("/bookings", json={"client_id": "C0001", **BOOKING, "provider_id": provider_id}).status_code == 201


# ---------------------------------------------------------------------------
# Sign in with Google
# ---------------------------------------------------------------------------
def test_new_google_user_registers_verified_and_without_a_password(app_db, monkeypatch):
    client, connect, sent = app_db
    _as_google(monkeypatch)

    first = client.post("/auth/google", json={"credential": "token"})
    assert first.status_code == 200
    assert first.json() == {"registered": False, "email": "wanjiku@example.com", "name": "Wanjiku Kamau"}
    assert _sql(connect, "SELECT count(*) FROM users") == [(0,)]

    # The form's email is ignored: the address is the one Google vouched for.
    reg = client.post("/auth/register", json={**CLIENT, "email": "someone.else@example.com",
                                              "password": None, "google_credential": "token"})
    assert reg.status_code == 200, reg.text
    assert reg.json() == {"user_id": "U0001", "role": "client", "email_verified": True,
                          "verification_email_sent": False}
    assert sent == []
    assert _sql(connect, "SELECT email, password_hash, google_sub, email_verified_at IS NOT NULL FROM users") == [
        ("wanjiku@example.com", None, "google-sub-123", True)]

    signed_in = client.post("/auth/google", json={"credential": "token"}).json()
    assert signed_in == {"registered": True, "email": "wanjiku@example.com", "name": "Wanjiku Kamau",
                         "user_id": "U0001", "role": "client", "client_id": "C0001", "email_verified": True}
    # Verified from the start, so booking works at once; there is no password to log in with.
    assert client.post("/bookings", json={"client_id": "C0001", **BOOKING}).status_code == 201
    assert _login(client).status_code == 401
    assert client.post("/auth/register", json={**CLIENT, "google_credential": "token"}).status_code == 409


def test_google_sign_in_takes_over_an_unverified_password_account(app_db, monkeypatch):
    """Someone registered this address with a password but never proved they
    own it. When the real owner arrives through Google, that password must stop
    working, or whoever set it keeps a way into the account."""
    client, connect, sent = app_db
    client.post("/auth/register", json=CLIENT)
    assert _login(client).status_code == 200
    _as_google(monkeypatch)

    linked = client.post("/auth/google", json={"credential": "token"}).json()
    assert linked["registered"] is True and linked["user_id"] == "U0001" and linked["email_verified"] is True
    assert _sql(connect, "SELECT password_hash, google_sub, email_verified_at IS NOT NULL FROM users") == [
        (None, "google-sub-123", True)]
    assert _login(client).status_code == 401
    # The emailed link from the earlier registration is dead too.
    assert client.post("/auth/verify-email", json={"token": sent[0][2]}).status_code == 400


def test_google_sign_in_links_a_verified_account_and_keeps_its_password(app_db, monkeypatch):
    client, connect, sent = app_db
    client.post("/auth/register", json=CLIENT)
    client.post("/auth/verify-email", json={"token": sent[0][2]})
    _as_google(monkeypatch)

    assert client.post("/auth/google", json={"credential": "token"}).json()["user_id"] == "U0001"
    assert _login(client).status_code == 200
    # Found by Google's account id from now on, even if the Google address changes.
    _as_google(monkeypatch, {**GOOGLE, "email": "renamed@example.com"})
    assert client.post("/auth/google", json={"credential": "token"}).json()["user_id"] == "U0001"
    assert _sql(connect, "SELECT count(*) FROM users") == [(1,)]


def test_an_account_needs_a_password_or_a_google_identity(app_db):
    _, connect, _ = app_db
    with pytest.raises(Exception, match="chk_users_has_credential"):
        _sql(connect, """INSERT INTO users (user_id, email, password_hash, role) VALUES ('U9', 'x@example.com', NULL, 'admin')""")


def test_test_only_token_endpoint_needs_the_configured_secret(app_db, monkeypatch):
    client, connect, sent = app_db
    client.post("/auth/register", json=CLIENT)
    path = "/auth/test/verification-token"
    assert client.post(path, json={"user_id": "U0001", "secret": "anything"}).status_code == 404  # switched off

    monkeypatch.setattr(api, "E2E_VERIFY_SECRET", "s3cret")
    assert client.post(path, json={"user_id": "U0001", "secret": "wrong"}).status_code == 404
    issued = client.post(path, json={"user_id": "U0001", "secret": "s3cret"})
    assert issued.status_code == 200
    # It goes through the real verification endpoint, and replaces the emailed link.
    assert client.post("/auth/verify-email", json={"token": sent[0][2]}).status_code == 400
    assert client.post("/auth/verify-email", json={"token": issued.json()["token"]}).status_code == 200


# ---------------------------------------------------------------------------
# No database needed
# ---------------------------------------------------------------------------
@pytest.fixture
def client():
    return TestClient(api.app)


def test_auth_config_reports_whether_google_is_set_up(client, monkeypatch):
    monkeypatch.setattr(api, "GOOGLE_CLIENT_ID", None)
    assert client.get("/auth/config").json() == {"google_client_id": None}
    monkeypatch.setattr(api, "GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    assert client.get("/auth/config").json() == {"google_client_id": "abc.apps.googleusercontent.com"}


def test_google_credential_checks(client, monkeypatch):
    from google.oauth2 import id_token

    monkeypatch.setattr(api, "GOOGLE_CLIENT_ID", None)
    assert client.post("/auth/google", json={"credential": "x"}).status_code == 503  # not configured

    monkeypatch.setattr(api, "GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    seen = {}

    def verify(token, request, audience):
        seen["audience"] = audience
        if token == "forged":
            raise ValueError("Wrong signature")
        return {"sub": 42, "email": " Wanjiku@Example.com ", "name": "Wanjiku",
                "email_verified": token != "unverified-address"}

    monkeypatch.setattr(id_token, "verify_oauth2_token", verify)
    assert client.post("/auth/google", json={"credential": "forged"}).status_code == 401
    assert client.post("/auth/google", json={"credential": "unverified-address"}).status_code == 403
    assert api._verify_google_credential("good") == {"sub": "42", "email": "wanjiku@example.com", "name": "Wanjiku"}
    # The token must have been issued for this app, not for some other site.
    assert seen["audience"] == "abc.apps.googleusercontent.com"


def test_emails_go_to_brevo_and_failures_do_not_raise(monkeypatch):
    monkeypatch.setattr(api, "BREVO_API_KEY", None)
    monkeypatch.setattr(api, "EMAIL_FROM", None)
    monkeypatch.setattr(api.urllib.request, "urlopen", lambda *a, **k: pytest.fail("must not call out"))
    assert api._send_verification_email("a@example.com", "A", "tok") is False  # logged instead

    monkeypatch.setattr(api, "BREVO_API_KEY", "key-123")
    monkeypatch.setattr(api, "EMAIL_FROM", "hello@example.com")
    monkeypatch.setattr(api, "FRONTEND_URL", "https://app.example")
    calls = []

    class Accepted:
        status = 201
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def urlopen(request, timeout):
        calls.append(request)
        return Accepted()

    monkeypatch.setattr(api.urllib.request, "urlopen", urlopen)
    assert api._send_verification_email("a@example.com", "Achieng", "tok-1") is True
    [request] = calls
    assert request.full_url == "https://api.brevo.com/v3/smtp/email"
    assert request.get_header("Api-key") == "key-123"
    body = json.loads(request.data)
    assert body["sender"] == {"name": "NaiServe", "email": "hello@example.com"}
    assert body["to"] == [{"email": "a@example.com", "name": "Achieng"}]
    link = "https://app.example/verify-email?token=tok-1"
    assert link in body["textContent"] and link in body["htmlContent"]

    def rejected(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, io.BytesIO(b'{"message":"bad key"}'))

    monkeypatch.setattr(api.urllib.request, "urlopen", rejected)
    assert api._send_verification_email("a@example.com", "Achieng", "tok-2") is False
