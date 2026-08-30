"""Pipeline orchestrator for APIx index computation.

Chains: Base calibration → Jevons aggregates → Laspeyres index → upsert.
Provides a clean async interface for scheduled runs.
"""

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

from src.indexing.base_calibrator import BaseCalibrator
from src.indexing.jevons import compute_cell_indices, compute_overall_apix
from src.indexing.laspeyres_engine import LaspeyresEngine
from src.storage.supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Summary of a full pipeline run."""
    observation_date: date
    source_portal: str
    calibration: dict[str, Any]
    aggregates: dict[str, Any]
    index: dict[str, Any]
    overall_apix: float
    cells_computed: int
    upserted: int


class IndexPipeline:
    """Orchestrates the full APIx index computation pipeline."""

    def __init__(
        self,
        sink: SupabaseSink,
        calibrator: Optional[BaseCalibrator] = None,
        laspeyres: Optional[LaspeyresEngine] = None,
    ) -> None:
        """Initialize pipeline with shared components.

        Args:
            sink: Connected SupabaseSink.
            calibrator: Optional pre-configured BaseCalibrator.
            laspeyres: Optional pre-configured LaspeyresEngine.
        """
        self.sink = sink
        self.calibrator = calibrator or BaseCalibrator(sink)
        self.laspeyres = laspeyres or LaspeyresEngine(sink, self.calibrator)

    async def run_portal(
        self,
        source_portal: str,
        observation_date: date,
    ) -> PipelineResult:
        """Run full pipeline for a single portal.

        Steps:
        1. Ensure base period exists (calibrate if first run)
        2. Compute Jevons daily aggregates
        3. Load base prices and weights
        4. Compute Laspeyres cell indices
        5. Upsert to airfare_price_index

        Args:
            source_portal: Portal identifier ('Ixigo', 'Google Flights').
            observation_date: Scrape date to compute index for.

        Returns:
            PipelineResult with all intermediate results.
        """
        logger.info(
            f"Starting pipeline for {source_portal} on {observation_date}"
        )

        # 1. Ensure base period
        calibration_result = await self.calibrator.ensure_base_period(
            source_portal, observation_date
        )
        calibrated = not calibration_result  # True if newly calibrated

        # 2. Jevons aggregates
        aggregates = await self.calibrator.compute_daily_aggregates(
            source_portal, observation_date
        )
        current = {
            cell: agg["jevons"] for cell, agg in aggregates.items()
        }

        # 3. Load base prices and weights
        base_prices = await self.calibrator.load_base_prices(source_portal)
        route_weights, window_weights = await self.calibrator.load_weights(
            source_portal
        )

        # 4. Compute Laspeyres indices
        cell_rows, overall_apix = self._compute_laspeyres(
            current, base_prices, route_weights, window_weights
        )

        # 5. Build records for upsert
        records = self._build_records(
            cell_rows, current, base_prices, aggregates,
            source_portal, observation_date
        )

        # 6. Upsert
        upserted = 0
        if records:
            upserted = await self.sink.upsert_airfare_price_index(records)

        result = PipelineResult(
            observation_date=observation_date,
            source_portal=source_portal,
            calibration={
                "has_base_period": calibration_result,
                "newly_calibrated": calibrated,
            },
            aggregates={
                "cells": len(aggregates),
                "quotes": sum(len(v) for v in aggregates.values())
                if isinstance(aggregates, dict) else 0,
            },
            index={
                "cells_computed": len(records),
                "overall_apix": round(overall_apix, 4),
                "upserted": upserted,
            },
            overall_apix=round(overall_apix, 4),
            cells_computed=len(records),
            upserted=upserted,
        )

        logger.info(
            f"Pipeline {source_portal} {observation_date}: "
            f"cells={len(records)}, apix={overall_apix:.2f}, upserted={upserted}"
        )
        return result

    def _compute_laspeyres(
        self,
        current: dict[tuple[str, str, int], float],
        base: dict[tuple[str, str, int], float],
        route_weights: dict[tuple[str, str], float],
        window_weights: dict[int, float],
    ) -> tuple[list[dict[str, Any]], float]:
        """Compute Laspeyres indices using pure Jevons functions."""
        from src.indexing.jevons import compute_cell_indices
        return compute_cell_indices(
            current, base, route_weights, window_weights
        )

    def _build_records(
        self,
        cell_rows: list[dict[str, Any]],
        current: dict[tuple[str, str, int], float],
        base_prices: dict[tuple[str, str, int], float],
        aggregates: dict,
        source_portal: str,
        observation_date: date,
    ) -> list[dict[str, Any]]:
        """Build database records for airfare_price_index upsert."""
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
        return records

    async def run_all_portals(
        self,
        observation_date: date,
        portals: Optional[list[str]] = None,
    ) -> dict[str, PipelineResult]:
        """Run pipeline for all configured portals.

        Args:
            observation_date: Scrape date.
            portals: List of portals (default: ['Ixigo', 'Google Flights']).

        Returns:
            Dict mapping portal to PipelineResult.
        """
        portals = portals or ["Ixigo", "Google Flights"]
        results = {}
        for portal in portals:
            try:
                results[portal] = await self.run_portal(portal, observation_date)
            except Exception as e:
                logger.error(f"Pipeline failed for {portal}: {e}")
                results[portal] = None
        return results


async def run_index_pipeline(
    sink: SupabaseSink,
    observation_date: date,
    portals: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Convenience function to run full index pipeline for all portals.

    Args:
        sink: Connected SupabaseSink.
        observation_date: Scrape date.
        portals: Optional list of portals.

    Returns:
        Dict with portal results and overall summary.
    """
    pipeline = IndexPipeline(sink)
    results = await pipeline.run_all_portals(observation_date, portals)

    successful = {p: r for p, r in results.items() if r is not None}
    failed = [p for p, r in results.items() if r is None]

    return {
        "observation_date": str(observation_date),
        "portals": {
            p: {
                "overall_apix": r.overall_apix,
                "cells_computed": r.cells_computed,
                "upserted": r.upserted,
            }
            for p, r in successful.items()
        },
        "failed_portals": failed,
        "total_cells": sum(r.cells_computed for r in successful.values()),
    }