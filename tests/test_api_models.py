"""Tests for the API response models."""

from src.api.models import ApixResponse, ErrorDetail, ErrorResponse, HealthResponse, Meta


def test_meta_defaults():
    meta = Meta(portal="Ixigo", count=3)
    assert meta.portal == "Ixigo"
    assert meta.count == 3
    assert meta.generated_at is not None


def test_apix_response_defaults():
    resp = ApixResponse(data=[], meta=Meta(portal="Ixigo", count=0))
    assert resp.data == []
    assert resp.meta.portal == "Ixigo"
    assert resp.meta.count == 0


def test_apix_response_with_data():
    resp = ApixResponse(data=[{"a": 1}], meta=Meta(portal="Ixigo", count=1))
    assert resp.data == [{"a": 1}]
    assert resp.meta.count == 1


def test_error_response():
    err = ErrorResponse(error=ErrorDetail(code=404, message="nf", type="not_found"))
    assert err.error.code == 404
    assert err.error.type == "not_found"


def test_health_response():
    h = HealthResponse(status="ok", db="ok", version="1.0.0")
    assert h.status == "ok"
    assert h.db == "ok"
    assert h.version == "1.0.0"
