"""Weighted Laspeyres APIx index engine.

Combines Jevons elementary aggregates (from `BaseCalibrator`) with base
period prices and DGCA route/window weights to produce the weighted
Laspeyres-style airfare price index, stored per cell in
`airfare_price_index`:

    index_cell = route_weight × window_weight × (P_c,t / P_c,0) × 100

The overall APIx is the weight-normalized sum of cell contributions:

    APIx = Σ(w_r × w_t × I_rel) / Σ(w_r × w_t)
"""

import logging
from datetime import date
from typing import Any, Optional

from src.indexing.base_calibrator import BaseCalibrator, CellKey
from src.indexing.jevons import compute_cell_indices
from src.storage.supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)


class LaspeyresEngine:
    """Computes and stores the weighted Laspeyres airfare price index."""

    def __init__(
        self,
        sink: SupabaseSink,
        calibrator: Optional[BaseCalibrator] = None,
    ) -> None:
        """Initialize the index engine.

        Args:
            sink: Async PostgreSQL sink with an open connection pool.
            calibrator: Optional pre-configured BaseCalibrator.
        """
        self.sink = sink
        self.calibrator = calibrator or BaseCalibrator(sink)

    async def compute_and_store(
        self,
        source_portal: str,
        observation_date: date,
    ) -> dict[str, Any]:
        """Compute the APIx for an observation date and upsert to Supabase.

        Calibrates the base period from the observation date if none
        exists yet (first run → index 100 by construction).

        Args:
            source_portal: Portal identifier ('Ixigo', 'Google Flights').
            observation_date: Scrape date to compute the index for.

        Returns:
            Summary dict with cells_computed, overall_apix, upserted count,
            and whether the base period was newly calibrated.
        """
        await self.calibrator.ensure_base_period(
            source_portal, observation_date
        )

        aggregates = await self.calibrator.compute_daily_aggregates(
            source_portal, observation_date
        )
        current = {cell: agg["jevons"] for cell, agg in aggregates.items()}
        if not current:
            logger.warning(
                f"No quotes for {source_portal} on {observation_date}; "
                f"index not computed"
            )
            return {
                "source_portal": source_portal,
                "date": observation_date,
                "cells_computed": 0,
                "overall_apix": 0.0,
                "upserted": 0,
            }

        base_prices = await self.calibrator.load_base_prices(source_portal)
        route_weights, window_weights = await self.calibrator.load_weights(
            source_portal
        )

        cell_rows, overall_apix = compute_cell_indices(
            current, base_prices, route_weights, window_weights
        )

        records = []
        for row in cell_rows:
            cell = (
                row["origin"],
                row["destination"],
                row["advance_windows"],
            )
            records.append({
                "date": observation_date,
                "journey_date": aggregates.get(cell, {}).get(
                    "journey_date", observation_date
                ),
                "origin": row["origin"],
                "destination": row["destination"],
                "advance_windows": row["advance_windows"],
                "source_portal": source_portal,
                "index_value": round(row["relative_index"], 2),
                "route_weight": row["route_weight"],
                "advance_window_weight": row["advance_window_weight"],
                "fare": round(current[cell], 2),
                "base_fare": round(current[cell], 2),
                "base_period_fare": round(base_prices[cell], 2),
            })

        upserted = 0
        if records:
            upserted = await self.sink.upsert_airfare_price_index(records)

        logger.info(
            f"APIx {source_portal} {observation_date}: "
            f"{len(records)} cells, overall={overall_apix:.2f}, "
            f"upserted={upserted}"
        )
        return {
            "source_portal": source_portal,
            "date": observation_date,
            "cells_computed": len(records),
            "overall_apix": round(overall_apix, 4),
            "upserted": upserted,
        }
