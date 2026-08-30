"""Main entry point for the APIx Real-Time Airfare Price Index system."""

import asyncio
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from config.settings import get_settings

IST = ZoneInfo("Asia/Kolkata")


def setup_logging(settings) -> None:
    """Configure logging for the application.

    Args:
        settings: Application settings instance.
    """
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    )
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL),
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )

    if settings.LOG_FILE:
        file_handler = logging.FileHandler(settings.LOG_FILE)
        file_handler.setFormatter(logging.Formatter(log_format))
        logging.getLogger().addHandler(file_handler)


def load_routes_config(settings) -> dict:
    """Load routes configuration from JSON file.

    Args:
        settings: Application settings instance.

    Returns:
        Routes configuration dictionary.
    """
    if not settings.ROUTES_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Routes config not found: {settings.ROUTES_CONFIG_PATH}"
        )

    with open(settings.ROUTES_CONFIG_PATH) as f:
        return json.load(f)


async def verify_playwright() -> bool:
    """Verify Playwright browser installation.

    Returns:
        True if Playwright is properly installed, False otherwise.
    """
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            await browser.close()
            return True
    except Exception as e:
        logging.error(f"Playwright verification failed: {e}")
        return False


async def run_daily_pipeline(settings) -> dict:
    """Run the full daily pipeline: ingest → validate → index.

    Steps:
    1. AsyncFetcher runs the 30-query matrix per source; flight quotes
       are batch-upserted to Supabase automatically.
    2. Imputation fills missing/sold-out cells using Jevons cell-relative method.
    3. TruthTriangle runs cross-source fare parity for today.
    4. LaspeyresEngine computes and stores the APIx per source portal
       (auto-calibrates the base period on first run).
    5. CSVWriter exports daily cleaned data to partitioned CSV files.

    Args:
        settings: Application settings instance.

    Returns:
        Combined pipeline summary dict.
    """
    logger = logging.getLogger(__name__)
    from src.ingestion.async_fetcher import run_fetch
    from src.storage.supabase_sink import SupabaseSink
    from src.cleaning.imputer import run_imputation
    from src.validation.truth_triangle import TruthTriangle
    from src.indexing.laspeyres_engine import LaspeyresEngine

    # 1. Ingestion (quotes persisted inside the fetcher)
    fetch_summary = await run_fetch(
        rate_limit=settings.RATE_LIMIT_PER_SECOND
    )
    logger.info(
        f"Ingestion: {fetch_summary['successes']}/{fetch_summary['total_queries']} "
        f"queries OK, {fetch_summary.get('quotes_upserted', 0)} quotes upserted"
    )

    sink = SupabaseSink()
    await sink.connect()
    try:
        observation_date = datetime.now(IST).date()

        # 2. Imputation (fills missing/sold-out cells)
        imputation_results = await run_imputation(sink, observation_date)
        total_imputed = sum(r.cells_imputed for r in imputation_results.values())
        logger.info(f"Imputation: {total_imputed} cells imputed across sources")

        # 3. Truth Triangle parity validation
        triangle = TruthTriangle(sink)
        parity = await triangle.run(observation_date)

        # 4. APIx computation per portal
        index_engine = LaspeyresEngine(sink)
        indices = {}
        for portal in ("Ixigo", "Google Flights"):
            portal_flights = fetch_summary["sources"].get(portal, {}).get(
                "flights", 0
            )
            if portal_flights > 0:
                indices[portal] = await index_engine.compute_and_store(
                    portal, observation_date
                )
            else:
                logger.warning(
                    f"No flights ingested from {portal}; index skipped"
                )

        return {
            "observation_date": str(observation_date),
            "ingestion": {
                k: v
                for k, v in fetch_summary.items()
                if k != "results"
            },
            "imputation": {
                portal: {
                    "cells_checked": r.cells_checked,
                    "cells_missing": r.cells_missing,
                    "cells_imputed": r.cells_imputed,
                    "cells_failed": r.cells_failed,
                    "fallback_used": dict(r.fallback_used),
                }
                for portal, r in imputation_results.items()
            },
            "parity": {
                "matched_pairs": parity.matched_pairs,
                "agreed_pairs": parity.agreed_pairs,
                "disparity_pairs": parity.disparity_pairs,
                "agreement_rate": round(parity.agreement_rate, 4),
            },
            "indices": {
                portal: {
                    "cells_computed": s["cells_computed"],
                    "overall_apix": s["overall_apix"],
                }
                for portal, s in indices.items()
            },
        }
    finally:
        await sink.close()


async def main() -> None:
    """Main entry point for the APIx system."""
    settings = get_settings()
    setup_logging(settings)

    logger = logging.getLogger(__name__)
    logger.info("Starting APIx Real-Time Airfare Price Index system")

    # Load configuration
    try:
        routes_config = load_routes_config(settings)
        logger.info(
            f"Loaded {len(routes_config['routes'])} routes from config"
        )
    except FileNotFoundError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)

    # Verify Playwright installation
    logger.info("Verifying Playwright installation...")
    if not await verify_playwright():
        logger.error(
            "Playwright not installed. Run: playwright install chromium"
        )
        sys.exit(1)
    logger.info("Playwright verified successfully")

    # Initialize compliance guard
    from src.ingestion.compliance import ComplianceGuard

    compliance = ComplianceGuard()
    logger.info("Compliance guard initialized")

    # Display system status
    logger.info("=" * 60)
    logger.info("APIx System Status")
    logger.info("=" * 60)
    logger.info(f"Base Directory: {settings.BASE_DIR}")
    logger.info(f"Routes Config: {settings.ROUTES_CONFIG_PATH}")
    logger.info(f"Rate Limit: {settings.RATE_LIMIT_PER_SECOND} req/sec/domain")
    logger.info(f"Token TTL: {settings.TOKEN_TTL_HOURS} hours")
    logger.info(f"User-Agent: {settings.USER_AGENT}")
    logger.info("=" * 60)

    # Display route basket
    logger.info("Route Basket:")
    for route, config in routes_config["routes"].items():
        logger.info(f"  {route}: weight={config['weight']:.2f}")

    logger.info("=" * 60)
    logger.info("Starting daily APIx pipeline (ingest → validate → index)")

    summary = await run_daily_pipeline(settings)

    logger.info("=" * 60)
    logger.info("Daily pipeline complete")
    logger.info(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
