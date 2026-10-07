from unittest.mock import MagicMock

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import api

SLOTS = [
    {"day_of_week": "Tuesday", "start_time": "09:00", "end_time": "17:00"},
    {"day_of_week": "Monday", "start_time": "08:00", "end_time": "12:00"},
]


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def db(monkeypatch):
    state = MagicMock()
    state.rows = [dict(s) for s in SLOTS]
    state.replaced = None
    state.conn = MagicMock()

    def replace(cursor, pid, slots):
        state.replaced = (pid, slots)

    monkeypatch.setattr(api, "_get_db_connection", lambda: state.conn)
    monkeypatch.setattr(api, "_provider_exists", lambda cursor, pid: pid == "P0201")
    monkeypatch.setattr(api, "_fetch_availability",
                        lambda cursor, pid: sorted(state.rows, key=lambda r: api.DAYS_OF_WEEK.index(r["day_of_week"])))
    monkeypatch.setattr(api, "_replace_availability", replace)
    monkeypatch.setitem(api.ref, "availability",
                        pd.DataFrame(columns=["provider_id", "day_of_week", "start_time", "end_time"]))
    return state


def test_get_returns_slots_in_week_order(client, db):
    r = client.get("/providers/P0201/availability")
    assert r.status_code == 200
    assert [s["day_of_week"] for s in r.json()] == ["Monday", "Tuesday"]
    assert r.json()[0]["start_time"] == "08:00"


def test_get_unknown_provider_404(client, db):
    assert client.get("/providers/P9999/availability").status_code == 404


def test_put_replaces_and_commits(client, db):
    body = {"slots": [{"day_of_week": "monday", "start_time": "08:00", "end_time": "17:00"}]}
    r = client.put("/providers/P0201/availability", json=body)
    assert r.status_code == 200
    assert r.json() == [{"day_of_week": "Monday", "start_time": "08:00", "end_time": "17:00"}]
    assert db.replaced[0] == "P0201"
    db.conn.commit.assert_called_once()


def test_put_refreshes_in_memory_availability(client, db):
    assert not api.is_provider_available("P0201", "weekday", "midday", api.ref["availability"])
    body = {"slots": [{"day_of_week": d, "start_time": "08:00", "end_time": "17:00"}
                      for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]]}
    assert client.put("/providers/P0201/availability", json=body).status_code == 200
    assert api.is_provider_available("P0201", "weekday", "midday", api.ref["availability"])
    # replacing with an empty list removes access again
    assert client.put("/providers/P0201/availability", json={"slots": []}).status_code == 200
    assert not api.is_provider_available("P0201", "weekday", "midday", api.ref["availability"])


def test_put_unknown_provider_404(client, db):
    assert client.put("/providers/P9999/availability", json={"slots": []}).status_code == 404


@pytest.mark.parametrize("slots", [
    [{"day_of_week": "Funday", "start_time": "08:00", "end_time": "17:00"}],
    [{"day_of_week": "Monday", "start_time": "8am", "end_time": "17:00"}],
    [{"day_of_week": "Monday", "start_time": "08:00", "end_time": "25:00"}],
    [{"day_of_week": "Monday", "start_time": "17:00", "end_time": "08:00"}],
    [{"day_of_week": "Monday", "start_time": "08:00", "end_time": "08:00"}],
    [{"day_of_week": "Monday", "start_time": "08:00", "end_time": "10:00"},
     {"day_of_week": "monday", "start_time": "11:00", "end_time": "12:00"}],
])
def test_put_validation_422(client, db, slots):
    r = client.put("/providers/P0201/availability", json={"slots": slots})
    assert r.status_code == 422
    assert db.replaced is None


def test_put_missing_slots_422(client, db):
    assert client.put("/providers/P0201/availability", json={}).status_code == 422
