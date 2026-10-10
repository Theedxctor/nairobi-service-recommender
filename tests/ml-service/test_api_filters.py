"""Result filters on /recommend: price limit, minimum rating, verified-only (#79)."""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import api

BODY = {"client_area": "Kilimani", "service_type": "plumber", "time_slot": "midday", "day_type": "weekday"}


@pytest.fixture
def client(monkeypatch):
    # Ratings come from the loaded reference data unless a test overrides them.
    monkeypatch.setattr(api, "_fetch_current_ratings", lambda provider_ids: {})
    return TestClient(api.app)


def _recommend(client, **over):
    r = client.post("/recommend", json={**BODY, "top_n": 10, **over})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def everyone(client):
    """Every available plumber, unfiltered, in reliability order."""
    ranked = _recommend(client, top_n=1000)
    assert len(ranked) > 10
    return ranked


def _ids(providers):
    return [p["provider_id"] for p in providers]


def _add_provider(monkeypatch, template_id, new_id, **over):
    """Add a copy of a real provider (with its availability) under a new id."""
    row = api.ref["providers"].loc[api.ref["providers"].provider_id == template_id].iloc[0].copy()
    row["provider_id"] = new_id
    for key, value in over.items():
        row[key] = value
    monkeypatch.setitem(api.ref, "providers",
                        pd.concat([api.ref["providers"], row.to_frame().T], ignore_index=True))
    slots = api.ref["availability"].loc[api.ref["availability"].provider_id == template_id].copy()
    slots["provider_id"] = new_id
    monkeypatch.setitem(api.ref, "availability",
                        pd.concat([api.ref["availability"], slots], ignore_index=True))


def test_no_filters_leaves_the_response_unchanged(client, everyone):
    explicit = _recommend(client, max_hourly_rate_ksh=None, min_rating=None, verified_only=False)
    assert explicit == everyone[:10]


def test_is_verified_matches_reference_data(everyone):
    # Earlier tests in a full run may leave a registered duplicate id in the
    # in-memory reference data, so compare ids that appear exactly once.
    providers = api.ref["providers"].drop_duplicates("provider_id", keep=False)
    verified = dict(zip(providers.provider_id, providers.is_verified))
    checked = [p for p in everyone if p["provider_id"] in verified]
    assert len(checked) > 10
    assert all(p["is_verified"] == bool(verified[p["provider_id"]]) for p in checked)
    assert {p["is_verified"] for p in everyone} == {True, False}


def test_price_limit_keeps_order_and_reaches_past_the_top_10(client, everyone):
    limit = sorted(p["hourly_rate_ksh"] for p in everyone)[len(everyone) // 3]
    expected = [p for p in everyone if p["hourly_rate_ksh"] <= limit][:10]
    got = _recommend(client, max_hourly_rate_ksh=limit)
    assert got == expected
    assert all(p["hourly_rate_ksh"] <= limit for p in got)
    # Filtering only the 10 cards already on screen would have missed these.
    assert set(_ids(got)) - set(_ids(everyone[:10]))


def test_verified_only(client, everyone):
    got = _recommend(client, verified_only=True)
    assert got == [p for p in everyone if p["is_verified"]][:10]
    assert got and all(p["is_verified"] for p in got)


def test_min_rating_excludes_lower_and_unrated(client, everyone, monkeypatch):
    _add_provider(monkeypatch, everyone[0]["provider_id"], "PNORATING", rating=None)
    assert "PNORATING" in _ids(_recommend(client, top_n=1000))

    got = _recommend(client, min_rating=4.5, top_n=1000)
    assert got == [p for p in everyone if p["rating"] is not None and p["rating"] >= 4.5]
    assert got and "PNORATING" not in _ids(got)


def test_min_rating_uses_current_ratings_not_the_startup_cache(client, everyone, monkeypatch):
    rated = [p for p in everyone if p["rating"] is not None]
    top = next(p for p in rated if p["rating"] >= 4)
    low = min(rated, key=lambda p: p["rating"])
    assert low["rating"] < 4
    live = {top["provider_id"]: {"rating": 1.0, "review_count": 3},
            low["provider_id"]: {"rating": 5.0, "review_count": 2}}
    monkeypatch.setattr(api, "_fetch_current_ratings",
                        lambda provider_ids: {k: v for k, v in live.items() if k in provider_ids})
    got = {p["provider_id"]: p for p in _recommend(client, min_rating=4, top_n=1000)}
    assert top["provider_id"] not in got
    assert got[low["provider_id"]]["rating"] == 5.0
    assert got[low["provider_id"]]["review_count"] == 2


def test_filters_combine(client, everyone):
    limit = sorted(p["hourly_rate_ksh"] for p in everyone)[len(everyone) // 2]
    got = _recommend(client, max_hourly_rate_ksh=limit, min_rating=4, verified_only=True, top_n=1000)
    assert got == [p for p in everyone
                   if p["hourly_rate_ksh"] <= limit and p["is_verified"] and (p["rating"] or 0) >= 4]


def test_nothing_matching_is_an_empty_list_not_a_404(client):
    assert _recommend(client, max_hourly_rate_ksh=1) == []


@pytest.mark.parametrize("bad", [{"max_hourly_rate_ksh": 0}, {"min_rating": 0.5}, {"min_rating": 5.1},
                                 {"verified_only": "sometimes"}])
def test_invalid_filter_values_are_rejected(client, bad):
    assert client.post("/recommend", json={**BODY, **bad}).status_code == 422


def test_new_providers_section_honours_filters(client, everyone, monkeypatch):
    _add_provider(monkeypatch, everyone[0]["provider_id"], "PNEW1", completion_rate=None, rating=None,
                  hourly_rate_ksh=900, is_verified=False)

    def section(**over):
        r = client.post("/recommend/new-providers", json={**BODY, "limit": 5, **over})
        assert r.status_code == 200, r.text
        return _ids(r.json())

    assert "PNEW1" in section()
    # A filter can shrink the main list enough that a new provider is ranked in
    # it; the section then must not repeat them. Either way they stay reachable.
    in_main = "PNEW1" in _ids(_recommend(client, max_hourly_rate_ksh=900))
    assert ("PNEW1" in section(max_hourly_rate_ksh=900)) != in_main
    assert "PNEW1" not in section(max_hourly_rate_ksh=899)
    assert "PNEW1" not in _ids(_recommend(client, max_hourly_rate_ksh=899, top_n=1000))
    assert "PNEW1" not in section(verified_only=True)
    assert "PNEW1" not in section(min_rating=1)  # no rating yet
