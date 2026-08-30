"""Health and admin endpoints."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.dependencies import get_httpx_client, require_admin, verify_api_key

router = APIRouter(tags=["system"])

VERSION = "1.0.0"


@router.get("/health")
async def health(
    client: httpx.AsyncClient = Depends(get_httpx_client),
) -> dict:
    """Health check that pings Supabase PostgREST."""
    try:
        resp = await client.get(
            "/view_apix_weekly",
            params={"select": "week_start", "limit": 1},
            timeout=10.0,
        )
        db_status = "ok" if resp.status_code < 400 else "error"
    except httpx.HTTPError:
        db_status = "error"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "version": VERSION,
    }


@router.get("/admin/coverage")
async def coverage(
    limit: int = Query(14, ge=1, le=90),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(require_admin),
) -> dict:
    """Scrape coverage and imputation stats per day/portal.

    Uses PostgREST aggregate: select count and imputed sum per day.
    """
    data = await _proxy_grouped(client, limit)
    return {"data": data, "meta": {"count": len(data), "generated_at": _now()}}


def _now() -> str:
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


async def _proxy_grouped(client: httpx.AsyncClient, limit: int) -> list[dict]:
    """Fetch coverage stats using PostgREST embedded aggregates.

    flight_quotes does not have a prebuilt aggregate view grouping by
    day+portal, so we pull recent rows and aggregate client-side for
    lightweight coverage metrics.
    """
    resp = await client.get(
        "/flight_quotes",
        params={
            "select": "journey_date,source_portal,is_imputed",
            "order": "scraping_date_time.desc",
            "limit": 5000,
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={"code": 502, "message": "Supabase upstream error", "type": "bad_gateway"},
        )
    rows = resp.json()
    from collections import defaultdict

    agg: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"quotes": 0, "imputed": 0}
    )
    for row in rows:
        key = (row.get("journey_date"), row.get("source_portal"))
        agg[key]["quotes"] += 1
        if row.get("is_imputed"):
            agg[key]["imputed"] += 1

    result = []
    for (journey_date, portal), counts in agg.items():
        result.append(
            {
                "journey_date": journey_date,
                "source_portal": portal,
                "quotes": counts["quotes"],
                "imputed": counts["imputed"],
                "imputed_pct": round(
                    counts["imputed"] / counts["quotes"] * 100, 2
                )
                if counts["quotes"]
                else 0.0,
            }
        )
    result.sort(key=lambda r: r["journey_date"], reverse=True)
    return result[:limit]
