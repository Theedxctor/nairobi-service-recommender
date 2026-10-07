import pytest
from fastapi.testclient import TestClient

import api

RECOMMEND_BODY = {
    "client_area": "Kilimani",
    "service_type": "plumber",
    "time_slot": "morning_rush",
    "day_type": "weekday",
}


@pytest.fixture
def client():
    return TestClient(api.app)


def _top_ids(client, body):
    res = client.post("/recommend", json=body)
    assert res.status_code == 200, res.text
    return [p["provider_id"] for p in res.json()]


def test_display_labels_are_normalised_to_canonical_values(client):
    # "Morning Rush"/"Weekday" used to score as if there were no congestion.
    labelled = {**RECOMMEND_BODY, "time_slot": "Morning Rush", "day_type": "Weekday"}
    assert _top_ids(client, labelled) == _top_ids(client, RECOMMEND_BODY)


@pytest.mark.parametrize("field, value", [("time_slot", "dawn"), ("day_type", "holiday")])
def test_recommend_rejects_unknown_context_values(client, field, value):
    res = client.post("/recommend", json={**RECOMMEND_BODY, field: value})
    assert res.status_code == 422
    assert field in res.text


def test_predict_rejects_unknown_time_slot(client):
    body = {"client_area": "Kilimani", "provider_id": "P0023",
            "time_slot": "lunchtime", "day_type": "weekday"}
    res = client.post("/predict", json=body)
    assert res.status_code == 422


def test_lookup_endpoints_match_validation_constants(client):
    assert client.get("/time_slots").json() == api.TIME_SLOTS
    assert client.get("/day_types").json() == api.DAY_TYPES
