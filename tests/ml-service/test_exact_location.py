"""Exact client/provider coordinates (#72)."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import api
from feature_engineering import build_feature_row, haversine_km, nearest_area

KILIMANI_POINT = (-1.2900, 36.7850)   # inside Kilimani, not its centroid
FAR_AWAY = (-0.0917, 34.7680)         # Kisumu: far outside coverage
BASE = {"service_type": "plumber", "time_slot": "midday", "day_type": "weekday"}


@pytest.fixture
def client():
    return TestClient(api.app)


def _provider(pid="P0023"):
    return api.ref["providers"].loc[api.ref["providers"].provider_id == pid].iloc[0]


def test_seeded_providers_have_exact_coordinates_loaded():
    p = _provider()
    assert p["lat"] == pytest.approx(-1.32, abs=0.2) and p["lng"] == pytest.approx(36.8, abs=0.2)


def test_distance_uses_exact_points_when_given():
    p = _provider()
    exact = build_feature_row("Kilimani", p, "midday", "weekday", api.ref, client_latlng=KILIMANI_POINT)
    expected = max(round(haversine_km(*KILIMANI_POINT, float(p["lat"]), float(p["lng"])), 2), 0.8)
    assert exact["distance_km"] == pytest.approx(expected, abs=0.01)


def test_distance_falls_back_to_area_centroid_without_coordinates():
    p = _provider()
    area = api.ref["areas"].loc[api.ref["areas"].area_name == "Kilimani"].iloc[0]
    centroid = build_feature_row("Kilimani", p, "midday", "weekday", api.ref)
    expected = max(round(haversine_km(float(area.lat), float(area.lng), float(p["lat"]), float(p["lng"])), 2), 0.8)
    assert centroid["distance_km"] == pytest.approx(expected, abs=0.01)


def test_nearest_area_labels_a_point():
    row, km = nearest_area(*KILIMANI_POINT, api.ref["areas"])
    assert row.area_name == "Kilimani" and km < 2


def test_locate_endpoint(client):
    inside = client.get("/locate", params={"lat": KILIMANI_POINT[0], "lng": KILIMANI_POINT[1]}).json()
    assert inside["area_name"] == "Kilimani" and inside["covered"] is True
    outside = client.get("/locate", params={"lat": FAR_AWAY[0], "lng": FAR_AWAY[1]}).json()
    assert outside["covered"] is False


def test_recommend_accepts_coordinates_without_area(client):
    res = client.post("/recommend", json={**BASE, "client_lat": KILIMANI_POINT[0], "client_lng": KILIMANI_POINT[1]})
    assert res.status_code == 200 and len(res.json()) > 0


def test_coordinates_change_distances_versus_centroid(client):
    with_point = client.post("/recommend", json={**BASE, "top_n": 500,
                                                 "client_lat": KILIMANI_POINT[0], "client_lng": KILIMANI_POINT[1]}).json()
    with_area = client.post("/recommend", json={**BASE, "top_n": 500, "client_area": "Kilimani"}).json()
    d_point = {p["provider_id"]: p["distance_km"] for p in with_point}
    d_area = {p["provider_id"]: p["distance_km"] for p in with_area}
    assert d_point.keys() == d_area.keys()
    assert any(abs(d_point[k] - d_area[k]) > 0.05 for k in d_point)


@pytest.mark.parametrize("body, field", [
    ({"client_lat": -1.29}, "client_lng"),            # only one coordinate
    ({}, "client_area"),                                # neither area nor coordinates
])
def test_location_validation(client, body, field):
    res = client.post("/recommend", json={**BASE, **body})
    assert res.status_code == 422 and field in res.text


def test_outside_coverage_rejected(client):
    res = client.post("/recommend", json={**BASE, "client_lat": FAR_AWAY[0], "client_lng": FAR_AWAY[1]})
    assert res.status_code == 422 and "outside the area NaiServe covers" in res.text


def test_booking_stores_exact_point_and_derived_area(client, monkeypatch):
    inserted = {}
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_client_exists", lambda *a: True)
    monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: True)
    monkeypatch.setattr(api, "_insert_booking", lambda cursor, *args: inserted.setdefault("args", args) and 1)
    monkeypatch.setattr(api, "_fetch_booking", lambda *a: {
        "booking_id": 1, "client_id": "C0001", "provider_id": "P0023", "service_type": "plumber",
        "client_area": "Kilimani", "time_slot": "midday", "day_type": "weekday", "reliability_score": 0.9,
        "status": "pending", "created_at": "2026-10-09T09:00:00Z", "client_name": "X", "provider_name": "Y",
    })
    monkeypatch.setattr(api, "_user_id_for", lambda *a: None)
    res = client.post("/bookings", json={**BASE, "client_id": "C0001", "provider_id": "P0023",
                                         "client_lat": KILIMANI_POINT[0], "client_lng": KILIMANI_POINT[1]})
    assert res.status_code == 201, res.text
    _, _, _, area, _, _, _, lat, lng = inserted["args"]
    assert area == "Kilimani" and (lat, lng) == KILIMANI_POINT


def test_register_with_location_derives_area_and_is_scorable(client, monkeypatch):
    calls = {}
    monkeypatch.setitem(api.ref, "providers", api.ref["providers"].copy())
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_email_exists", lambda *a: False)
    monkeypatch.setattr(api, "_next_id", lambda cursor, table, col, prefix: f"{prefix}9998")
    monkeypatch.setattr(api, "_insert_provider", lambda cursor, *args: calls.setdefault("provider", args))
    for helper in ("_insert_user", "_insert_notification"):
        monkeypatch.setattr(api, helper, lambda *a, **k: None)
    res = client.post("/auth/register", json={
        "email": "geo.plumber@example.com", "password": "supersecret", "role": "provider", "name": "Geo Plumber",
        "phone": "0700000010", "service_type": "plumber", "hourly_rate_ksh": 800,
        "lat": KILIMANI_POINT[0], "lng": KILIMANI_POINT[1],
    })
    assert res.status_code == 200, res.text
    _, _, base_area_id, *_, lat, lng = calls["provider"]
    assert base_area_id == "A03" and (lat, lng) == KILIMANI_POINT
    cached = api.ref["providers"].loc[api.ref["providers"].provider_id == "P9998"].iloc[0]
    assert (cached["lat"], cached["lng"]) == KILIMANI_POINT


def test_update_saved_location(client, monkeypatch):
    saved = {}
    monkeypatch.setattr(api, "_get_db_connection", lambda: MagicMock())
    monkeypatch.setattr(api, "_user_entity", lambda cursor, uid: ("client", "C0001", None))
    monkeypatch.setattr(api, "_set_saved_location", lambda cursor, *args: saved.setdefault("args", args))
    monkeypatch.setattr(api, "_fetch_profile", lambda cursor, uid: {
        "user_id": uid, "role": "client", "email": "a@b.c", "lat": KILIMANI_POINT[0], "lng": KILIMANI_POINT[1]})
    res = client.put("/profile/location", params={"user_id": "U0001"},
                     json={"lat": KILIMANI_POINT[0], "lng": KILIMANI_POINT[1]})
    assert res.status_code == 200 and res.json()["lat"] == KILIMANI_POINT[0]
    assert saved["args"] == ("client", "C0001", "A03", KILIMANI_POINT[0], KILIMANI_POINT[1])
