"""Tests for API key authentication."""

import pytest
from fastapi import HTTPException

from src.api import dependencies
from src.api.config import ApiSettings


@pytest.fixture(autouse=True)
def _patch_keys(monkeypatch):
    fake = ApiSettings(_env_file=None)
    fake.__dict__["_API_KEYS"] = '{"valid-key":"web","admin-key":"admin"}'
    # Ensure the property reads the new value.

    class FakeSettings:
        API_KEYS = '{"valid-key":"web","admin-key":"admin"}'

        @property
        def api_keys(self):
            import json
            return json.loads(self.API_KEYS)

    monkeypatch.setattr(dependencies, "settings", FakeSettings())


class _Headers:
    def __init__(self, value: str):
        self._value = value

    def get(self, key, default=None):
        return self._value if self._value is not None else default


def test_verify_valid_key():
    assert dependencies.verify_api_key("valid-key") == "web"


def test_verify_missing_key():
    with pytest.raises(HTTPException) as exc:
        dependencies.verify_api_key("")
    assert exc.value.status_code == 401
    assert "Missing API key" in exc.value.detail["message"]


def test_verify_invalid_key():
    with pytest.raises(HTTPException) as exc:
        dependencies.verify_api_key("wrong-key")
    assert exc.value.status_code == 401
    assert "Invalid API key" in exc.value.detail["message"]


def test_require_admin_success():
    assert dependencies.require_admin("admin") == "admin"


def test_require_admin_forbidden():
    with pytest.raises(HTTPException) as exc:
        dependencies.require_admin("web")
    assert exc.value.status_code == 403
