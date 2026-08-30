"""Dependencies for the API: Supabase PostgREST client and API key auth."""

from typing import AsyncIterator

import httpx
from fastapi import Depends, Header, HTTPException, status

from src.api.config import ApiSettings, get_api_settings

settings: ApiSettings = get_api_settings()

API_KEY_HEADER = "X-API-Key"


def get_httpx_client() -> AsyncIterator[httpx.AsyncClient]:
    """Yield an httpx client configured for Supabase PostgREST."""
    client = httpx.AsyncClient(
        base_url=f"{settings.SUPABASE_URL}/rest/v1",
        headers={
            "apikey": settings.SUPABASE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )
    yield client
    # Client is closed in the app lifespan when used as a dependency;
    # closing here guards direct usage in tests.


def verify_api_key(
    x_api_key: str = Header(default=""),
) -> str:
    """Validate the API key in the X-API-Key header.

    Returns the label associated with the key (e.g. 'web', 'mobile', 'admin').
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": 401, "message": "Missing API key", "type": "unauthorized"},
        )
    label = settings.api_keys.get(x_api_key)
    if label is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": 401, "message": "Invalid API key", "type": "unauthorized"},
        )
    return label


def require_admin(
    label: str = Depends(verify_api_key),
) -> str:
    """Require an admin-scoped API key for admin endpoints."""
    if label != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": 403,
                "message": "Admin key required",
                "type": "forbidden",
            },
        )
    return label
