import pytest
from fastapi.testclient import TestClient

import api

BASE = {"client_area": "Kilimani", "time_slot": "midday", "day_type": "weekday"}


@pytest.fixture
def client():
    return TestClient(api.app)


def _provider_id():
    return str(api.ref["providers"].iloc[0]["provider_id"])


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["providers_loaded"] > 0


@pytest.mark.parametrize("path,expected", [
    ("/areas", "Kilimani"),
    ("/service_types", "plumber"),
    ("/time_slots", "morning_rush"),
    ("/day_types", "weekday"),
])
def test_lookup_lists(client, path, expected):
    r = client.get(path)
    assert r.status_code == 200
    assert r.json()
    assert expected in r.json()


def test_predict_happy_path(client):
    pid = _provider_id()
    r = client.post("/predict", json={**BASE, "provider_id": pid})
    assert r.status_code == 200
    body = r.json()
    for field in ("provider_id", "reliability_score", "estimated_travel_min",
                  "distance_km", "primary_corridor", "explanation"):
        assert field in body
    assert body["provider_id"] == pid
    assert 0.0 <= body["reliability_score"] <= 1.0


def test_predict_unknown_provider_404(client):
    r = client.post("/predict", json={**BASE, "provider_id": "P_DOES_NOT_EXIST"})
    assert r.status_code == 404


def _recommend(client, **over):
    return client.post("/recommend", json={
        "client_area": "Kilimani", "service_type": "plumber",
        "time_slot": "morning_rush", "day_type": "weekday", **over,
    })


def test_recommend_sorted_and_bounded(client):
    r = _recommend(client, top_n=5)
    assert r.status_code == 200
    body = r.json()
    assert 0 < len(body) <= 5
    scores = [p["reliability_score"] for p in body]
    assert scores == sorted(scores, reverse=True)


def test_recommend_top_n_respected(client):
    r = _recommend(client, top_n=2)
    assert r.status_code == 200
    assert len(r.json()) <= 2


def test_recommend_unknown_service_type_404(client):
    assert _recommend(client, service_type="astronaut").status_code == 404
