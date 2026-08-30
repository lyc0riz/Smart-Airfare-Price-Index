"""FastAPI application entry point for the APIx thin-wrapper API."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from src.api.config import ApiSettings, get_api_settings
from src.api.dependencies import get_httpx_client
from src.api.routes import apix, health

settings: ApiSettings = get_api_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("apix-api")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
)

# Shared httpx client used across requests for connection reuse.
_shared_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage the shared httpx client lifecycle."""
    global _shared_client
    _shared_client = httpx.AsyncClient(
        base_url=f"{settings.SUPABASE_URL}/rest/v1",
        headers={
            "apikey": settings.SUPABASE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )
    logger.info("APIx API started")
    try:
        yield
    finally:
        if _shared_client is not None:
            await _shared_client.aclose()
            _shared_client = None
        logger.info("APIx API stopped")


app = FastAPI(
    title="APIx - Real-Time Airfare Price Index",
    description=(
        "Thin wrapper over Supabase PostgREST exposing the APIx airfare "
        "price index, route breakdowns, lead-time elasticity, and data coverage."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


async def _shared_httpx_client() -> AsyncIterator[httpx.AsyncClient]:
    """Yield the shared client for the get_httpx_client dependency."""
    yield _shared_client


app.dependency_overrides[get_httpx_client] = _shared_httpx_client

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["X-API-Key", "Authorization"],
)

app.include_router(apix.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
