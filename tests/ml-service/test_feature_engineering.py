import pandas as pd
import pytest

from feature_engineering import build_feature_row, haversine_km


@pytest.fixture
def areas_df():
    return pd.DataFrame(
        [
            {"area_id": "A01", "area_name": "CBD", "lat": -1.2833, "lng": 36.8172, "road_quality": "moderate"},
            {"area_id": "A03", "area_name": "Kilimani", "lat": -1.2921, "lng": 36.7801, "road_quality": "good"},
        ]
    )


@pytest.fixture
def traffic_df():
    # already "exploded" to one row per area_id, matching load_reference_data()'s output shape
    return pd.DataFrame(
        [
            {
                "area_id": "A03",
                "time_slot": "morning_rush",
                "day_type": "weekday",
                "corridor_name": "Ngong Road",
                "congestion_multiplier": 2.5,
                "avg_speed_kmh": 20.0,
            }
        ]
    )


@pytest.fixture
def ref(areas_df, traffic_df):
    return {"areas": areas_df, "traffic": traffic_df}


@pytest.fixture
def provider_row():
    return pd.Series(
        {
            "base_area_name": "Kilimani",
            "lat": -1.2921,
            "lng": 36.7801,
            "completion_rate": 0.85,
        }
    )


def test_build_feature_row_returns_the_five_model_features(provider_row, ref):
    row = build_feature_row("CBD", provider_row, "morning_rush", "weekday", ref)

    assert row["distance_km"] == 4.24
    assert row["congestion_multiplier"] == 2.5
    assert row["time_slot"] == "morning_rush"
    assert row["provider_area_road_quality"] == "good"
    assert row["provider_completion_rate"] == 0.85


def test_build_feature_row_includes_explanation_context_fields(provider_row, ref):
    row = build_feature_row("CBD", provider_row, "morning_rush", "weekday", ref)

    assert row["primary_corridor"] == "Ngong Road"
    assert row["avg_speed_kmh"] == 20.0
    assert row["client_area_road_quality"] == "moderate"
    assert row["estimated_travel_min"] > 0


def test_build_feature_row_falls_back_to_area_centroid_when_provider_has_no_gps(ref):
    provider_row_no_gps = pd.Series(
        {"base_area_name": "Kilimani", "lat": None, "lng": None, "completion_rate": 0.7}
    )

    row = build_feature_row("CBD", provider_row_no_gps, "morning_rush", "weekday", ref)

    # falls back to Kilimani's own centroid, which is the same as the provider fixture above
    assert row["distance_km"] == 4.24


def test_build_feature_row_floors_distance_at_0_8_km_for_same_area_trips(areas_df, traffic_df):
    ref_same_area = {"areas": areas_df, "traffic": traffic_df}
    provider_same_area = pd.Series(
        {"base_area_name": "Kilimani", "lat": -1.2921, "lng": 36.7801, "completion_rate": 0.9}
    )

    row = build_feature_row("Kilimani", provider_same_area, "morning_rush", "weekday", ref_same_area)

    assert row["distance_km"] == 0.8


def test_haversine_km_matches_expected_distance():
    assert haversine_km(-1.2833, 36.8172, -1.2921, 36.7801) == pytest.approx(4.24, abs=0.01)
    assert haversine_km(-1.0, 36.0, -1.0, 36.0) == 0.0
