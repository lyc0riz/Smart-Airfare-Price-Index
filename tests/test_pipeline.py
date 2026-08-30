"""Tests for pipeline.py orchestrator."""

import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from src.indexing.pipeline import IndexPipeline, PipelineResult, run_index_pipeline


class TestPipelineResult:
    def test_dataclass_creation(self):
        result = PipelineResult(
            observation_date=date(2026, 8, 30),
            source_portal="Ixigo",
            calibration={"has_base_period": True, "newly_calibrated": False},
            aggregates={"cells": 5, "quotes": 50},
            index={"cells_computed": 5, "overall_apix": 100.0, "upserted": 5},
            overall_apix=100.0,
            cells_computed=5,
            upserted=5,
        )
        assert result.observation_date == date(2026, 8, 30)
        assert result.source_portal == "Ixigo"
        assert result.overall_apix == 100.0


class TestIndexPipeline:
    @pytest.fixture
    def mock_sink(self):
        sink = AsyncMock()
        sink.upsert_airfare_price_index = AsyncMock(return_value=5)
        return sink

    @pytest.fixture
    def mock_calibrator(self):
        cal = AsyncMock()
        cal.ensure_base_period = AsyncMock(return_value=True)
        cal.compute_daily_aggregates = AsyncMock(return_value={
            ("DEL", "BOM", 7): {"jevons": 5000.0, "journey_date": date(2026, 9, 2)},
            ("DEL", "BLR", 15): {"jevons": 8000.0, "journey_date": date(2026, 9, 2)},
        })
        cal.load_base_prices = AsyncMock(return_value={
            ("DEL", "BOM", 7): 5000.0,
            ("DEL", "BLR", 15): 8000.0,
        })
        cal.load_weights = AsyncMock(return_value=(
            {("DEL", "BOM"): 0.28, ("DEL", "BLR"): 0.20},
            {7: 0.20, 15: 0.20},
        ))
        return cal

    @pytest.fixture
    def mock_laspeyres(self):
        las = AsyncMock()
        las.compute_and_store = AsyncMock(return_value={
            "source_portal": "Ixigo",
            "date": date(2026, 8, 30),
            "cells_computed": 2,
            "overall_apix": 100.0,
            "upserted": 5,
        })
        return las

    @pytest.fixture
    def pipeline(self, mock_sink, mock_calibrator, mock_laspeyres):
        return IndexPipeline(mock_sink, mock_calibrator, mock_laspeyres)

    @pytest.mark.asyncio
    async def test_run_portal_success(self, pipeline, mock_calibrator):
        result = await pipeline.run_portal("Ixigo", date(2026, 8, 30))

        assert isinstance(result, PipelineResult)
        assert result.source_portal == "Ixigo"
        assert result.observation_date == date(2026, 8, 30)
        assert result.cells_computed == 2
        assert result.upserted == 5  # mock_sink returns 5
        assert result.overall_apix == 100.0

        # Verify calibrator was called
        mock_calibrator.ensure_base_period.assert_called_once()
        mock_calibrator.compute_daily_aggregates.assert_called_once()
        mock_calibrator.load_base_prices.assert_called_once()
        mock_calibrator.load_weights.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_all_portals(self, pipeline):
        results = await pipeline.run_all_portals(date(2026, 8, 30))

        assert "Ixigo" in results
        assert "Google Flights" in results
        for portal, result in results.items():
            assert result is not None
            assert result.source_portal == portal

    @pytest.mark.asyncio
    async def test_run_all_portals_custom_list(self, pipeline):
        results = await pipeline.run_all_portals(
            date(2026, 8, 30), portals=["Ixigo"]
        )

        assert "Ixigo" in results
        assert "Google Flights" not in results

    @pytest.mark.asyncio
    async def test_run_all_portals_handles_failure(self, pipeline, mock_calibrator):
        # Make one portal fail
        async def failing_run(portal, date_):
            if portal == "Google Flights":
                raise Exception("Pipeline failed")
            return PipelineResult(
                observation_date=date(2026, 8, 30),
                source_portal=portal,
                calibration={}, aggregates={}, index={},
                overall_apix=100.0, cells_computed=1, upserted=1,
            )

        pipeline.run_portal = failing_run

        results = await pipeline.run_all_portals(date(2026, 8, 30))

        assert results["Ixigo"] is not None
        assert results["Google Flights"] is None


class TestRunIndexPipeline:
    @pytest.fixture
    def mock_sink(self):
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_run_index_pipeline_success(self, mock_sink):
        with patch("src.indexing.pipeline.IndexPipeline") as mock_pipeline_class:
            mock_pipeline = AsyncMock()
            mock_pipeline.run_all_portals = AsyncMock(return_value={
                "Ixigo": PipelineResult(
                    observation_date=date(2026, 8, 30),
                    source_portal="Ixigo",
                    calibration={}, aggregates={}, index={},
                    overall_apix=100.0, cells_computed=2, upserted=2,
                ),
                "Google Flights": PipelineResult(
                    observation_date=date(2026, 8, 30),
                    source_portal="Google Flights",
                    calibration={}, aggregates={}, index={},
                    overall_apix=102.0, cells_computed=1, upserted=1,
                ),
            })
            mock_pipeline_class.return_value = mock_pipeline

            result = await run_index_pipeline(mock_sink, date(2026, 8, 30))

            assert result["observation_date"] == "2026-08-30"
            assert "Ixigo" in result["portals"]
            assert "Google Flights" in result["portals"]
            assert result["total_cells"] == 3
            assert result["failed_portals"] == []

    @pytest.mark.asyncio
    async def test_run_index_pipeline_partial_failure(self, mock_sink):
        with patch("src.indexing.pipeline.IndexPipeline") as mock_pipeline_class:
            mock_pipeline = AsyncMock()
            mock_pipeline.run_all_portals = AsyncMock(return_value={
                "Ixigo": PipelineResult(
                    observation_date=date(2026, 8, 30),
                    source_portal="Ixigo",
                    calibration={}, aggregates={}, index={},
                    overall_apix=100.0, cells_computed=2, upserted=2,
                ),
                "Google Flights": None,  # Failed
            })
            mock_pipeline_class.return_value = mock_pipeline

            result = await run_index_pipeline(mock_sink, date(2026, 8, 30))

            assert result["failed_portals"] == ["Google Flights"]
            assert result["total_cells"] == 2