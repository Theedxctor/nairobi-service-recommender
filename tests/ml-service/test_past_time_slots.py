"""Same-day booking windows cannot be used after they end in Nairobi."""
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import api


TODAY = date(2026, 10, 27)


def _at(hour: int, minute: int = 0):
    return datetime(2026, 10, 27, hour, minute, tzinfo=api.NAIROBI_TZ)


@pytest.mark.parametrize("hour,minute", [(9, 0), (12, 0), (23, 59)])
def test_morning_rush_is_rejected_after_it_ends(monkeypatch, hour, minute):
    monkeypatch.setattr(api, "_now_in_nairobi", lambda: _at(hour, minute))
    with pytest.raises(ValidationError, match="already ended today at 09:00 Nairobi time"):
        api.ContextFields(time_slot="morning_rush", job_date=TODAY)


def test_current_and_future_windows_remain_valid(monkeypatch):
    monkeypatch.setattr(api, "_now_in_nairobi", lambda: _at(12, 0))
    assert api.ContextFields(time_slot="midday", job_date=TODAY).time_slot == "midday"
    assert api.ContextFields(time_slot="morning_rush", job_date=date(2026, 10, 28)).time_slot == "morning_rush"


def test_recommend_endpoint_rejects_an_ended_slot(monkeypatch):
    monkeypatch.setattr(api, "_now_in_nairobi", lambda: _at(12, 0))
    response = TestClient(api.app).post("/recommend", json={
        "client_area": "Kilimani",
        "service_type": "plumber",
        "time_slot": "morning_rush",
        "job_date": TODAY.isoformat(),
    })
    assert response.status_code == 422
    assert "already ended today" in response.text
