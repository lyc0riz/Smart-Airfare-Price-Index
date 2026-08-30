"""Tests for API endpoints using a mocked Supabase PostgREST client."""

import httpx
import pytest
from fastapi.testclient import TestClient

from src.api import dependencies
from src.api.main import app
from src.api.dependencies import get_httpx_client


def _make_transport(handler):
    return httpx.MockTransport(handler)


@pytest.fixture
def client(monkeypatch):
    """Build a TestClient with a mocked Supabase PostgREST backend."""
    routes = [
        ("/view_apix_weekly", [{"week_start": "2026-08-24", "source_portal": "Ixigo", "apix_weekly": 105.5}]),
        ("/view_apix_monthly", [{"month_start": "2026-08-01", "source_portal": "Ixigo", "apix_monthly": 103.2}]),
        ("/airfare_price_index", [
            {"date": "2026-08-30", "index_value": 10.5, "route_weight": 0.28, "advance_window_weight": 0.2},
            {"date": "2026-08-29", "index_value": 10.2, "route_weight": 0.28, "advance_window_weight": 0.2},
        ]),
        ("/view_route_leadtime_elasticity", [{"date": "2026-08-30", "origin": "DEL", "destination": "BOM", "advance_windows": 7, "current_index": 105.0, "previous_index": 103.0, "percentage_change": 1.94}]),
        ("/flight_quotes", [
            {"journey_date": "2026-08-30", "source_portal": "Ixigo", "is_imputed": False},
            {"journey_date": "2026-08-30", "source_portal": "Ixigo", "is_imputed": True},
        ]),
    ]

    def route_match(path: str) -> list:
        path = path.split("?")[0].rstrip("/")
        path = path.replace("/rest/v1", "")
        for route, payload in routes:
            if path == route:
                return payload
        return []

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=route_match(request.url.path))

    transport = _make_transport(handler)
    mock_client = httpx.AsyncClient(transport=transport, base_url="https://fake.supabase.co/rest/v1")

    async def override_get_httpx_client():
        yield mock_client

    class FakeSettings:
        API_KEYS = '{"web-key":"web","admin-key":"admin"}'

        @property
        def api_keys(self):
            import json
            return json.loads(self.API_KEYS)

    monkeypatch.setattr(dependencies, "settings", FakeSettings())

    app.dependency_overrides[get_httpx_client] = override_get_httpx_client
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


API_KEY_HEADER = {"X-API-Key": "web-key"}


def test_health(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"


def test_latest_requires_key(client):
    resp = client.get("/api/v1/apix/latest")
    assert resp.status_code == 401


def test_latest(client):
    resp = client.get("/api/v1/apix/latest", headers=API_KEY_HEADER)
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["portal"] == "Ixigo"
    assert "current_index" in body
    assert body["observation_date"] == "2026-08-30"


def test_weekly(client):
    resp = client.get("/api/v1/apix/weekly", headers=API_KEY_HEADER)
    assert resp.status_code == 200
    assert resp.json()["data"][0]["week_start"] == "2026-08-24"


def test_monthly(client):
    resp = client.get("/api/v1/apix/monthly", headers=API_KEY_HEADER)
    assert resp.status_code == 200
    assert resp.json()["data"][0]["month_start"] == "2026-08-01"


def test_by_route(client):
    resp = client.get(
        "/api/v1/apix/by-route",
        params={"date": "2026-08-30"},
        headers=API_KEY_HEADER,
    )
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 2


def test_heatmap(client):
    resp = client.get(
        "/api/v1/apix/heatmap",
        params={"date": "2026-08-30"},
        headers=API_KEY_HEADER,
    )
    assert resp.status_code == 200


def test_elasticity(client):
    resp = client.get(
        "/api/v1/apix/elasticity",
        params={"route": "DEL-BOM", "window": 7},
        headers=API_KEY_HEADER,
    )
    assert resp.status_code == 200
    assert resp.json()["data"][0]["origin"] == "DEL"


def test_elasticity_bad_route(client):
    resp = client.get(
        "/api/v1/apix/elasticity",
        params={"route": "DEL", "window": 7},
        headers=API_KEY_HEADER,
    )
    assert resp.status_code == 422


def test_airlines(client):
    resp = client.get(
        "/api/v1/apix/airlines",
        params={"route": "DEL-BOM", "date": "2026-08-30"},
        headers=API_KEY_HEADER,
    )
    assert resp.status_code == 200


def test_admin_coverage_requires_admin(client):
    resp = client.get("/api/v1/admin/coverage", headers=API_KEY_HEADER)
    assert resp.status_code == 403


def test_admin_coverage_with_admin_key(client):
    resp = client.get(
        "/api/v1/admin/coverage",
        headers={"X-API-Key": "admin-key"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"][0]["quotes"] == 2
    assert resp.json()["data"][0]["imputed"] == 1
    assert resp.json()["data"][0]["imputed_pct"] == 50.0
