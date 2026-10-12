import sys
from pathlib import Path

# make ml-service importable as top-level modules (feature_engineering, api, ...)
ML_SERVICE_DIR = Path(__file__).resolve().parents[2] / "ml-service"
sys.path.insert(0, str(ML_SERVICE_DIR))


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _email_verification_defaults(monkeypatch, request):
    """Most tests fake the database with MagicMock, whose cursor answers every
    query with a truthy object. Without this, the email-verification checks
    (#95) would read that as "unverified account" and block every booking.
    Tests of verification itself opt out with @pytest.mark.real_verification."""
    if request.node.get_closest_marker("real_verification"):
        return
    import api
    monkeypatch.setattr(api, "_account_unverified", lambda cursor, column, value: False)
    monkeypatch.setattr(api, "_unverified_provider_ids", lambda: set())
    monkeypatch.setattr(api, "_issue_email_token", lambda cursor, user_id: "test-token")
    monkeypatch.setattr(api, "_send_verification_email", lambda email, name, token: False)


def pytest_configure(config):
    config.addinivalue_line("markers", "real_verification: use the real email-verification helpers")
