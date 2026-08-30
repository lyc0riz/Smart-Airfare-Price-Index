"""APEx index endpoints proxying Supabase PostgREST."""

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.dependencies import get_httpx_client, verify_api_key

router = APIRouter(prefix="/apix", tags=["apix"])

PORTALS = ["Ixigo", "Google Flights"]


def _now_iso() -> str:
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _meta(portal: str, data: list) -> dict:
    return {"portal": portal, "count": len(data), "generated_at": _now_iso()}


async def _proxy_get(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch rows from Supabase PostgREST, raising on error."""
    resp = await client.get(f"/{table}", params=params)
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": 502, "message": "Supabase upstream error", "type": "bad_gateway"},
        )
    return resp.json()


@router.get("/latest")
async def latest(
    portal: str = Query("Ixigo"),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Today's overall APIx plus recent history for sparkline."""
    data = await _proxy_get(
        client,
        "airfare_price_index",
        {
            "select": "date,index_value,route_weight,advance_window_weight",
            "source_portal": f"eq.{portal}",
            "order": "date.desc",
            "limit": 8,
        },
    )
    if not data:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "No data for portal", "type": "not_found"})
    current = sum(
        row["index_value"] * row["route_weight"] * row["advance_window_weight"]
        for row in data
        if row["index_value"] is not None and row["route_weight"] is not None and row["advance_window_weight"] is not None
    )
    dates = [row["date"] for row in data]
    return {
        "data": data,
        "meta": _meta(portal, data),
        "current_index": round(current, 2),
        "observation_date": dates[0],
    }


@router.get("/weekly")
async def weekly(
    portal: str = Query("Ixigo"),
    limit: int = Query(52, ge=1, le=104),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Weekly aggregated index from view_apix_weekly."""
    data = await _proxy_get(
        client,
        "view_apix_weekly",
        {
            "select": "*",
            "source_portal": f"eq.{portal}",
            "order": "week_start.desc",
            "limit": limit,
        },
    )
    return {"data": data, "meta": _meta(portal, data)}


@router.get("/monthly")
async def monthly(
    portal: str = Query("Ixigo"),
    limit: int = Query(24, ge=1, le=120),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Monthly aggregated index from view_apix_monthly."""
    data = await _proxy_get(
        client,
        "view_apix_monthly",
        {
            "select": "*",
            "source_portal": f"eq.{portal}",
            "order": "month_start.desc",
            "limit": limit,
        },
    )
    return {"data": data, "meta": _meta(portal, data)}


@router.get("/by-route")
async def by_route(
    date: str = Query(..., description="YYYY-MM-DD"),
    portal: str = Query("Ixigo"),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Index contribution per route for a given date."""
    data = await _proxy_get(
        client,
        "airfare_price_index",
        {
            "select": "origin,destination,index_value,route_weight,fare,base_period_fare",
            "date": f"eq.{date}",
            "source_portal": f"eq.{portal}",
            "order": "route_weight.desc",
        },
    )
    return {"data": data, "meta": _meta(portal, data)}


@router.get("/heatmap")
async def heatmap(
    date: str = Query(..., description="YYYY-MM-DD"),
    portal: str = Query("Ixigo"),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Index matrix of route x advance window for a date."""
    data = await _proxy_get(
        client,
        "airfare_price_index",
        {
            "select": "origin,destination,advance_windows,index_value",
            "date": f"eq.{date}",
            "source_portal": f"eq.{portal}",
        },
    )
    return {"data": data, "meta": _meta(portal, data)}


@router.get("/elasticity")
async def elasticity(
    route: str = Query(..., pattern=r"^[A-Z]{3}-[A-Z]{3}$"),
    window: int = Query(..., ge=1, le=45),
    portal: str = Query("Ixigo"),
    limit: int = Query(30, ge=1, le=90),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Day-over-day percentage change for a route/window."""
    origin, destination = route.split("-")
    data = await _proxy_get(
        client,
        "view_route_leadtime_elasticity",
        {
            "select": "*",
            "origin": f"eq.{origin}",
            "destination": f"eq.{destination}",
            "advance_windows": f"eq.{window}",
            "order": "date.desc",
            "limit": limit,
        },
    )
    return {"data": data, "meta": _meta(portal, data)}


@router.get("/airlines")
async def airlines(
    route: str = Query(..., pattern=r"^[A-Z]{3}-[A-Z]{3}$"),
    date: str = Query(..., description="YYYY-MM-DD journey date"),
    portal: str = Query("Ixigo"),
    client: httpx.AsyncClient = Depends(get_httpx_client),
    _label: str = Depends(verify_api_key),
) -> dict:
    """Average fare per airline on a route/date."""
    data = await _proxy_get(
        client,
        "flight_quotes",
        {
            "select": "carrier,carrier_code,total_fare",
            "route": f"eq.{route}",
            "journey_date": f"eq.{date}",
            "source_portal": f"eq.{portal}",
            "order": "total_fare.asc",
        },
    )
    return {"data": data, "meta": _meta(portal, data)}
