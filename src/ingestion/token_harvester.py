"""Playwright-based token harvester for Ixigo session extraction.

Opens Ixigo in a headless browser, intercepts network requests to
discover API endpoints and capture authentication tokens/headers.
Uses playwright-stealth for fingerprint spoofing.
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class TokenHarvester:
    """Playwright-based token harvester for Ixigo.

    Launches a stealth Chromium browser, navigates to Ixigo search,
    intercepts XHR requests to discover API endpoints and capture
    the required headers (apikey, deviceid, etc.).
    """

    def __init__(
        self,
        headless: bool = True,
        storage_dir: Optional[Path] = None,
    ) -> None:
        """Initialize token harvester.

        Args:
            headless: Run browser in headless mode.
            storage_dir: Directory for captured data.
        """
        self.headless = headless
        self.storage_dir = storage_dir or (
            Path(__file__).resolve().parent.parent.parent / "storage"
        )
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self._browser = None
        self._context = None
        self._captured_data: list[dict[str, Any]] = []

    async def start(self) -> None:
        """Launch the browser with stealth settings."""
        try:
            from playwright.async_api import async_playwright
            from playwright_stealth import stealth_async
        except ImportError as e:
            logger.error(f"Missing dependencies: {e}")
            raise

        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=self.headless)
        self._context = await self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
        )

        logger.info("Browser launched with stealth settings")

    async def stop(self) -> None:
        """Close the browser."""
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        logger.info("Browser closed")

    async def harvest_ixigo(
        self,
        origin: str = "DEL",
        destination: str = "BOM",
        departure_date: str = "01092026",
    ) -> dict[str, Any]:
        """Harvest tokens and headers from Ixigo.

        Navigates to the Ixigo search results page and intercepts
        XHR requests to discover the flight search API endpoint.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in DDMMYYYY format.

        Returns:
            Dictionary with captured headers and endpoint info.
        """
        from playwright_stealth import stealth_async

        if not self._context:
            await self.start()

        page = await self._context.new_page()
        await stealth_async(page)

        captured: dict[str, Any] = {
            "portal": "Ixigo",
            "requests": [],
            "headers": {},
            "search_url": "",
        }

        # Intercept requests
        async def on_request(request):
            url = request.url
            if "flight" in url.lower() or "search" in url.lower():
                captured["requests"].append({
                    "url": url,
                    "method": request.method,
                    "headers": dict(request.headers),
                    "timestamp": time.time(),
                })

                # Capture API headers from flight-related requests
                if "/flights/" in url or "/search/" in url:
                    captured["headers"] = dict(request.headers)
                    captured["search_url"] = url

        page.on("request", on_request)

        # Navigate to search page
        search_url = (
            f"https://www.ixigo.com/search/result/flight/"
            f"{origin}/{destination}/{departure_date}//1/0/0/e"
        )

        try:
            logger.info(f"Navigating to Ixigo: {search_url}")
            await page.goto(search_url, wait_until="networkidle", timeout=30000)

            # Wait for API calls to complete
            await asyncio.sleep(5)

        except Exception as e:
            logger.error(f"Ixigo harvest failed: {e}")
        finally:
            await page.close()

        # Save captured data
        self._captured_data = captured["requests"]
        self._save_capture(captured)

        logger.info(
            f"Ixigo harvest: {len(captured['requests'])} requests captured"
        )
        return captured

    def _save_capture(self, data: dict[str, Any]) -> None:
        """Save captured data to JSON file.

        Args:
            data: Captured data to save.
        """
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"ixigo_capture_{timestamp}.json"
        filepath = self.storage_dir / filename

        try:
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2, default=str)
            logger.info(f"Saved capture to {filepath}")
        except Exception as e:
            logger.error(f"Failed to save capture: {e}")
