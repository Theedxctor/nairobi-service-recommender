"""Model-based explanations (#103): the card text must come from the model's
own per-feature contributions, and those contributions must add up to the
score the client sees."""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import api
from explain import FACTOR_COLUMNS, behind_top, describe, feature_contributions
from feature_engineering import MODEL_FEATURES, build_feature_row

BASE = {"client_area": "Kilimani", "time_slot": "midday", "day_type": "weekday"}


@pytest.fixture
def client():
    return TestClient(api.app)


def _rows():
    return pd.DataFrame([
        {"distance_km": 3.0, "congestion_multiplier": 1.87, "time_slot": "midday",
         "provider_area_road_quality": "good", "provider_completion_rate": 0.97},
        {"distance_km": 12.0, "congestion_multiplier": 2.9, "time_slot": "evening_rush",
         "provider_area_road_quality": "poor", "provider_completion_rate": 0.62},
        {"distance_km": 0.8, "congestion_multiplier": 1.2, "time_slot": "morning_rush",
         "provider_area_road_quality": "moderate", "provider_completion_rate": 0.85},
    ])[MODEL_FEATURES]


def test_contributions_add_up_to_the_score():
    X = _rows()
    factor_rows, base_pts = feature_contributions(api.pipeline, X)
    scores = api.pipeline.predict(X)
    for factors, score in zip(factor_rows, scores):
        # each factor is rounded to 0.1 pt, so allow 0.1 pt per factor plus the base
        assert base_pts + sum(factors.values()) == pytest.approx(score * 100, abs=0.6)


def test_contributions_are_grouped_into_the_five_features():
    factor_rows, base_pts = feature_contributions(api.pipeline, _rows())
    assert all(set(f) == set(FACTOR_COLUMNS) for f in factor_rows)
    assert 70 < base_pts < 80  # the model's average prediction, about 0.76


def test_worse_inputs_lower_the_matching_factors():
    good, bad, _ = feature_contributions(api.pipeline, _rows())[0]
    assert bad["congestion"] < good["congestion"]
    assert bad["completion"] < good["completion"]


def test_describe_names_the_biggest_effects_with_their_sign():
    text = describe({"distance": 4.4, "congestion": -6.1, "time_slot": 0.0, "road": 0.2, "completion": 9.1})
    assert text.startswith("Main factors vs a typical booking: above-average completion record (+9.1 pts), "
                           "heavier traffic than average on this route (-6.1 pts), shorter distance than average (+4.4 pts)")
    assert "road" not in text  # 0.2 pts is below the threshold


def test_describe_when_nothing_moved_the_score_much():
    assert describe(dict.fromkeys(FACTOR_COLUMNS, 0.5)) == "Close to a typical booking on every factor"


def test_describe_new_provider_does_not_credit_assumed_history():
    text = describe({"distance": 3.0, "congestion": 5.0, "time_slot": 0.0, "road": 0.0, "completion": 8.0},
                    has_history=False)
    assert "completion record" not in text
    assert "New provider with no job history yet" in text


def test_describe_discloses_fallback_traffic():
    text = describe(dict.fromkeys(FACTOR_COLUMNS, 3.0), default_traffic=True)
    assert text.endswith("No traffic data for this provider's area, so a fallback congestion figure was used")


def test_behind_top_lists_the_largest_losses_first():
    top = {"distance": 4.4, "congestion": 6.1, "time_slot": 0.0, "road": 0.2, "completion": 9.1}
    lower = {"distance": 4.2, "congestion": 1.6, "time_slot": 0.0, "road": 0.2, "completion": 6.5}
    assert behind_top(lower, top) == "Behind #1 mainly on: traffic on their route (-4.5 pts), completion record (-2.6 pts)"


def test_behind_top_is_none_when_no_factor_differs_by_a_point():
    top = dict.fromkeys(FACTOR_COLUMNS, 5.0)
    assert behind_top({**top, "distance": 4.5}, top) is None


def test_area_without_a_corridor_is_flagged_as_fallback_traffic():
    providers = api.ref["providers"]
    in_kileleshwa = providers.loc[providers.base_area_name == "Kileleshwa"].iloc[0]
    in_hurlingham = providers.loc[providers.base_area_name == "Hurlingham"].iloc[0]
    assert build_feature_row("Kilimani", in_kileleshwa, "midday", "weekday", api.ref)["traffic_is_default"] is True
    assert build_feature_row("Kilimani", in_hurlingham, "midday", "weekday", api.ref)["traffic_is_default"] is False


def test_predict_returns_model_factors(client):
    pid = str(api.ref["providers"].iloc[0]["provider_id"])
    body = client.post("/predict", json={**BASE, "provider_id": pid}).json()
    assert set(body["factors"]) == set(FACTOR_COLUMNS)
    assert body["explanation"].startswith(("Main factors", "Close to a typical booking"))


def test_recommend_compares_lower_ranks_with_the_first(client, monkeypatch):
    monkeypatch.setattr(api, "is_provider_available", lambda *a, **k: True)
    monkeypatch.setattr(api, "_fetch_current_ratings", lambda ids: {})
    ranked = client.post("/recommend", json={**BASE, "service_type": "cleaner", "top_n": 10}).json()
    assert len(ranked) > 1
    assert "Behind #1" not in ranked[0]["explanation"]
    assert any("Behind #1 mainly on:" in p["explanation"] for p in ranked[1:])
    scores = [p["reliability_score"] for p in ranked]
    assert scores == sorted(scores, reverse=True)  # explanations never change the order
