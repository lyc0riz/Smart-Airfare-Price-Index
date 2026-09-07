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


AJR = {
    "6E": "IndiGo",
    "AI": "Air India",
    "IX": "Air India Express",
    "SG": "SpiceJet",
    "QP": "Akasa Air",
}
"""Curated carrier registry used to keep airline metadata stable.

Unknown/rare carriers harvested from flight_quotes are excluded from the
metadata the dashboard exposes so the UI does not show test/noise carriers.
"""


@router.get("/admin/metadata")
async def metadata(
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Dashboard metadata: route basket, airlines, portals, lead windows.

    Public (any valid key) so the web dashboard can stay in sync with the
    backend without hard-coded constants.
    """
    routes = await _fetch(client, "/route_weights", {"select": "origin,destination,route,weight", "order": "weight.desc"})
    windows_rows = await _fetch(client, "/advance_window_weights", {"select": "advance_window,weight"})
    index_rows = await _fetch(client, "/airfare_price_index", {"select": "date", "order": "date.desc", "limit": 500})
    quote_rows = await _fetch(
        client,
        "/flight_quotes",
        {"select": "carrier_code,carrier", "order": "scraping_date_time.desc", "limit": 4000},
    )

    lead_windows = sorted({r["advance_window"] for r in windows_rows if r.get("advance_window") is not None})
    dates = [r.get("date") for r in index_rows if r.get("date") is not None]
    latest_date = max(dates) if dates else None
    first_date = min(dates) if dates else None
    history_days = len({d for d in dates})

    carriers: dict[str, str] = {}
    for r in quote_rows:
        code = r.get("carrier_code")
        name = r.get("carrier")
        if code and code in AJR and name:
            carriers[code] = name

    return {
        "data": {
            "routes": [
                {
                    "code": r["route"],
                    "origin": r["origin"],
                    "destination": r["destination"],
                    "label": f"{r['origin']}–{r['destination']}",
                    "weight_pct": round(float(r["weight"]) * 100, 2),
                }
                for r in routes
                if r.get("route")
            ],
            "airlines": [{"code": c, "label": n} for c, n in carriers.items()],
            "portals": _PORTALS,
            "lead_windows": lead_windows,
            "latest_date": latest_date,
            "first_date": first_date,
            "base_period_label": _fmt_base_period(first_date),
            "history_days": history_days,
        },
        "meta": {"count": 1, "generated_at": _now()},
    }


_PORTALS = ["Ixigo", "Google Flights"]

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _fmt_base_period(first_date: str | None) -> str:
    """Render a 'YYYY-MM-DD' string as e.g. '30 Aug 2026 (first scrape date)'."""
    if not first_date:
        return "Not available"
    try:
        year, month, day = first_date.split("-")
        return f"{int(day)} {_MONTHS[int(month) - 1]} {year} (first scrape date)"
    except Exception:
        return str(first_date)


async def _fetch(client: httpx.AsyncClient, table: str, params: dict) -> list[dict]:
    resp = await client.get(table, params=params, timeout=30.0)
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={"code": 502, "message": "Supabase upstream error", "type": "bad_gateway"},
        )
    return resp.json()


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
