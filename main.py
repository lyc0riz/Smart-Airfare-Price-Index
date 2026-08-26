"""Main entry point for the APIx Real-Time Airfare Price Index system."""

import asyncio
import json
import logging
import sys
from pathlib import Path

from config.settings import get_settings


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
    logger.info("System ready. Phases 2-6 implementation pending.")


if __name__ == "__main__":
    asyncio.run(main())
