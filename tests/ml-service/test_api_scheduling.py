"""Job dates on /recommend and /predict (#82): the date picks the weekday that
availability is checked for and derives day_type; it is never a model feature."""
from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import api

BODY = {"client_area": "Kilimani", "service_type": "plumber", "time_slot": "midday", "top_n": 1000}
TUESDAY, THURSDAY, SATURDAY = "2026-10-13", "2026-10-15", "2026-10-17"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api, "_fetch_current_ratings", lambda provider_ids: {})
    monkeypatch.setattr(api, "_today_in_nairobi", lambda: date(2026, 10, 12))  # a Monday
    return TestClient(api.app)


def _recommend(client, **over):
    r = client.post("/recommend", json={**BODY, **over})
    assert r.status_code == 200, r.text
    return {p["provider_id"]: p for p in r.json()}


def _works_on(day):
    slots = api.ref["availability"]
    return set(slots.loc[slots.day_of_week.str.lower() == day, "provider_id"].astype(str))


def test_date_restricts_results_to_providers_working_that_weekday(client):
    any_weekday = _recommend(client, day_type="weekday")
    tuesday = _recommend(client, job_date=TUESDAY)
    assert tuesday and set(tuesday) <= set(any_weekday)
    assert set(tuesday) <= _works_on("tuesday")
    # Someone who works other weekdays but not Tuesdays is left out.
    assert set(any_weekday) - set(tuesday)


def test_scores_are_identical_with_and_without_a_date(client):
    any_weekday = _recommend(client, day_type="weekday")
    tuesday = _recommend(client, job_date=TUESDAY)
    thursday = _recommend(client, job_date=THURSDAY)
    for pid, provider in tuesday.items():
        assert provider == any_weekday[pid]
    shared = set(tuesday) & set(thursday)
    assert shared and all(tuesday[pid] == thursday[pid] for pid in shared)


def test_weekend_date_derives_weekend(client):
    saturday = _recommend(client, job_date=SATURDAY, time_slot="weekend_day")
    weekend = _recommend(client, day_type="weekend", time_slot="weekend_day")
    assert saturday and set(saturday) <= set(weekend)
    assert set(saturday) <= _works_on("saturday")
    assert all(saturday[pid] == weekend[pid] for pid in saturday)


def test_matching_day_type_is_accepted_and_a_conflict_rejected(client):
    assert _recommend(client, job_date=TUESDAY, day_type="weekday") == _recommend(client, job_date=TUESDAY)
    res = client.post("/recommend", json={**BODY, "job_date": TUESDAY, "day_type": "weekend"})
    assert res.status_code == 422
    assert "Tuesday" in str(res.json()["detail"])


@pytest.mark.parametrize("job_date", ["2026-10-11", "2026-12-12", "tomorrow", "2026-02-30"])
def test_bad_dates_are_rejected(client, job_date):
    assert client.post("/recommend", json={**BODY, "job_date": job_date}).status_code == 422


def test_neither_date_nor_day_type_is_rejected(client):
    assert client.post("/recommend", json=BODY).status_code == 422


def test_no_provider_working_that_day_is_a_404_naming_the_day(client, monkeypatch):
    slots = api.ref["availability"]
    monkeypatch.setitem(api.ref, "availability", slots.loc[slots.day_of_week.str.lower() != "tuesday"])
    res = client.post("/recommend", json={**BODY, "job_date": TUESDAY})
    assert res.status_code == 404 and "Tuesday" in res.json()["detail"]


def test_new_providers_section_and_predict_accept_a_date(client):
    res = client.post("/recommend/new-providers", json={**BODY, "job_date": TUESDAY, "limit": 2})
    assert res.status_code == 200
    dated = client.post("/predict", json={"client_area": "Kilimani", "provider_id": "P0023",
                                          "time_slot": "midday", "job_date": TUESDAY})
    undated = client.post("/predict", json={"client_area": "Kilimani", "provider_id": "P0023",
                                            "time_slot": "midday", "day_type": "weekday"})
    assert dated.status_code == 200 and dated.json() == undated.json()
