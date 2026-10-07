"""Cold-start handling for providers with no job history (#52)."""
from unittest.mock import MagicMock

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import api
from feature_engineering import build_feature_row, completion_rate_prior

PREDICT_BODY = {"client_area": "Kilimani", "time_slot": "midday", "day_type": "weekday"}


@pytest.fixture
def client():
    return TestClient(api.app)


def _new_provider(template_id="P0023", **over):
    """A copy of a real provider with its history wiped, as /auth/register creates."""
    row = api.ref["providers"].loc[api.ref["providers"].provider_id == template_id].iloc[0].copy()
    row["provider_id"] = "PNEW1"
    row["completion_rate"] = None
    row["rating"] = None
    for key, value in over.items():
        row[key] = value
    return row


@pytest.fixture
def with_new_provider(monkeypatch):
    providers = pd.concat([api.ref["providers"], _new_provider().to_frame().T], ignore_index=True)
    monkeypatch.setitem(api.ref, "providers", providers)


def test_prior_is_median_of_providers_with_history():
    df = pd.DataFrame({"completion_rate": [0.7, 0.8, 0.9, None, 0.95]})
    assert completion_rate_prior(df) == pytest.approx(0.85)


def test_loaded_reference_data_has_a_prior():
    known = pd.to_numeric(api.ref["providers"]["completion_rate"], errors="coerce").dropna()
    assert api.ref["completion_rate_prior"] == pytest.approx(known.median())


def test_feature_row_uses_prior_instead_of_nan():
    features = build_feature_row("Kilimani", _new_provider(), "midday", "weekday", api.ref)
    assert features["provider_completion_rate"] == api.ref["completion_rate_prior"]
    assert features["provider_has_history"] is False


def test_feature_row_keeps_real_history():
    real = api.ref["providers"].loc[api.ref["providers"].provider_id == "P0023"].iloc[0]
    features = build_feature_row("Kilimani", real, "midday", "weekday", api.ref)
    assert features["provider_completion_rate"] == pytest.approx(float(real["completion_rate"]))
    assert features["provider_has_history"] is True


def test_new_provider_scored_as_median_provider_and_explained(client, with_new_provider):
    new = client.post("/predict", json={**PREDICT_BODY, "provider_id": "PNEW1"}).json()

    # Same provider, but explicitly given the median completion rate.
    median_twin = _new_provider(completion_rate=api.ref["completion_rate_prior"])
    expected, _ = api._score_provider("Kilimani", median_twin, "midday", "weekday")

    assert new["reliability_score"] == pytest.approx(round(expected, 4))
    assert "new provider with no job history" in new["explanation"]
    assert "strong historical completion rate" not in new["explanation"]


def test_recommend_returns_null_rating_for_new_provider(client, with_new_provider, monkeypatch):
    monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: True)
    res = client.post("/recommend", json={**PREDICT_BODY, "service_type": "plumber", "top_n": 500})
    assert res.status_code == 200
    new = next(p for p in res.json() if p["provider_id"] == "PNEW1")
    assert new["rating"] is None


def test_registered_provider_is_scorable_without_restart(client, monkeypatch):
    monkeypatch.setitem(api.ref, "providers", api.ref["providers"].copy())
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_email_exists", lambda *a: False)
    monkeypatch.setattr(api, "_next_id", lambda cursor, table, col, prefix: f"{prefix}9999")
    for helper in ("_insert_provider", "_insert_user", "_insert_notification"):
        monkeypatch.setattr(api, helper, lambda *a, **k: None)

    res = client.post("/auth/register", json={
        "email": "new.plumber@example.com", "password": "supersecret", "role": "provider",
        "name": "New Plumber", "phone": "0700000009", "base_area_id": "A03",
        "service_type": "plumber", "hourly_rate_ksh": 800,
    })
    assert res.status_code == 200

    predicted = client.post("/predict", json={**PREDICT_BODY, "provider_id": "P9999"})
    assert predicted.status_code == 200
    assert "new provider" in predicted.json()["explanation"]
