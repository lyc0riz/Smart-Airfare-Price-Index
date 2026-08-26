"""Portal analysis script using Playwright to discover API endpoints."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from playwright.async_api import async_playwright, Page, Request, Response

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# Portal configurations
PORTALS = {
    "easemytrip": {
        "name": "EaseMyTrip",
        "search_url": (
            "https://flight.easemytrip.com/FlightList/Index"
            "?seg1={origin}|{dest}|{date}"
            "&ttype=1&ad=1&ch=0&inf=0&cbn=E&nonstop=false"
        ),
        "date_format": "%Y-%m-%d",
        "intercept_domains": [
            "flightservice.easemytrip.com",
            "flightservice-web.easemytrip.com",
            "flight.easemytrip.com",
        ],
    },
    "ixigo": {
        "name": "Ixigo",
        "search_url": (
            "https://www.ixigo.com/search/result/flight"
            "/{origin}/{dest}/{date}//1/0/0/e"
        ),
        "date_format": "%d%m%Y",
        "intercept_domains": [
            "www.ixigo.com",
            "api.ixigo.com",
        ],
    },
}

# Test route: Delhi to Mumbai, 7 days from now
TEST_ROUTE = {"origin": "DEL", "dest": "BOM"}
TEST_DAYS_AHEAD = 7


class PortalAnalyzer:
    """Analyzes portal network requests to discover API endpoints."""

    def __init__(self, portal_key: str, portal_config: dict) -> None:
        self.portal_key = portal_key
        self.config = portal_config
        self.captured_requests: list[dict] = []
        self.captured_responses: list[dict] = []
        self.tokens_found: dict = {}

    def get_search_url(self, origin: str, dest: str, date_str: str) -> str:
        """Build the search URL for the portal."""
        return self.config["search_url"].format(
            origin=origin, dest=dest, date=date_str
        )

    def should_intercept(self, url: str) -> bool:
        """Check if the request URL matches target domains."""
        parsed = urlparse(url)
        domain = parsed.netloc
        return any(d in domain for d in self.config["intercept_domains"])

    async def on_request(self, request: Request) -> None:
        """Handle captured requests."""
        url = request.url
        if not self.should_intercept(url):
            return

        parsed = urlparse(url)
        headers = dict(request.headers)

        # Extract potential auth headers
        auth_headers = {}
        for key, value in headers.items():
            lower_key = key.lower()
            if any(
                kw in lower_key
                for kw in ["auth", "token", "api-key", "x-api", "cookie"]
            ):
                auth_headers[key] = value

        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "url": url,
            "method": request.method,
            "domain": parsed.netloc,
            "path": parsed.path,
            "headers": headers,
            "auth_headers": auth_headers,
            "post_data": request.post_data,
        }

        self.captured_requests.append(entry)

        if auth_headers:
            logger.info(f"[{self.portal_key}] Auth headers found: {list(auth_headers.keys())}")

    async def on_response(self, response: Response) -> None:
        """Handle captured responses."""
        url = response.url
        if not self.should_intercept(url):
            return

        parsed = urlparse(url)
        headers = dict(response.headers)

        # Try to get response body preview
        body_preview = ""
        try:
            body = await response.text()
            body_preview = body[:500] if body else ""
        except Exception:
            body_preview = "(could not read body)"

        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "url": url,
            "status": response.status,
            "domain": parsed.netloc,
            "path": parsed.path,
            "headers": headers,
            "body_preview": body_preview,
        }

        self.captured_responses.append(entry)

    async def analyze(self, origin: str, dest: str, date_str: str) -> dict:
        """Run analysis for the portal."""
        search_url = self.get_search_url(origin, dest, date_str)
        logger.info(f"[{self.portal_key}] Analyzing: {search_url}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = await context.new_page()

            # Set up request/response listeners
            page.on("request", self.on_request)
            page.on("response", self.on_response)

            try:
                # Navigate to search URL
                logger.info(f"[{self.portal_key}] Navigating to search URL...")
                await page.goto(search_url, wait_until="networkidle", timeout=60000)

                # Wait for additional network activity
                logger.info(f"[{self.portal_key}] Waiting for page to load...")
                await page.wait_for_timeout(10000)

                # Take a screenshot for reference
                screenshot_path = f"docs/portal-analysis/{self.portal_key}-screenshot.png"
                await page.screenshot(path=screenshot_path, full_page=False)
                logger.info(f"[{self.portal_key}] Screenshot saved: {screenshot_path}")

            except Exception as e:
                logger.error(f"[{self.portal_key}] Error during analysis: {e}")
            finally:
                await browser.close()

        # Compile results
        results = {
            "portal": self.portal_key,
            "portal_name": self.config["name"],
            "search_url": search_url,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "captured_requests": self.captured_requests,
            "captured_responses": self.captured_responses,
            "summary": {
                "total_requests": len(self.captured_requests),
                "auth_headers_found": list(
                    set(
                        key
                        for req in self.captured_requests
                        for key in req.get("auth_headers", {}).keys()
                    )
                ),
                "unique_domains": list(
                    set(req["domain"] for req in self.captured_requests)
                ),
                "api_endpoints": list(
                    set(
                        f"{req['method']} {req['domain']}{req['path']}"
                        for req in self.captured_requests
                    )
                ),
            },
        }

        return results


async def main() -> None:
    """Main entry point for portal analysis."""
    from datetime import timedelta

    # Calculate test date (7 days from now)
    test_date = datetime.now() + timedelta(days=TEST_DAYS_AHEAD)
    test_date_str = test_date.strftime("%Y-%m-%d")

    logger.info("=" * 60)
    logger.info("Portal Analysis Script")
    logger.info(f"Test Route: {TEST_ROUTE['origin']} → {TEST_ROUTE['dest']}")
    logger.info(f"Test Date: {test_date_str}")
    logger.info("=" * 60)

    results = {}

    for portal_key, portal_config in PORTALS.items():
        logger.info(f"\n{'='*60}")
        logger.info(f"Analyzing: {portal_config['name']}")
        logger.info(f"{'='*60}")

        analyzer = PortalAnalyzer(portal_key, portal_config)

        # Format date according to portal's expected format
        date_formatted = test_date.strftime(portal_config["date_format"])

        result = await analyzer.analyze(
            origin=TEST_ROUTE["origin"],
            dest=TEST_ROUTE["dest"],
            date_str=date_formatted,
        )

        results[portal_key] = result

        # Save individual portal results
        output_path = f"docs/portal-analysis/{portal_key}-analysis.json"
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        logger.info(f"[{portal_key}] Results saved to: {output_path}")

        # Print summary
        logger.info(f"\n[{portal_key}] Summary:")
        logger.info(f"  Total requests captured: {result['summary']['total_requests']}")
        logger.info(f"  Auth headers found: {result['summary']['auth_headers_found']}")
        logger.info(f"  Unique domains: {result['summary']['unique_domains']}")
        logger.info(f"  API endpoints: {result['summary']['api_endpoints']}")

    # Save combined results
    combined_path = "docs/portal-analysis/combined-analysis.json"
    with open(combined_path, "w") as f:
        json.dump(results, f, indent=2)
    logger.info(f"\nCombined results saved to: {combined_path}")

    # Generate summary markdown
    generate_summary_markdown(results)


def generate_summary_markdown(results: dict) -> None:
    """Generate a summary markdown file from analysis results."""
    lines = [
        "# Portal Analysis Summary",
        "",
        f"**Analysis Date:** {datetime.now(timezone.utc).isoformat()}",
        f"**Test Route:** {TEST_ROUTE['origin']} → {TEST_ROUTE['dest']}",
        f"**Test Date:** {(datetime.now() + __import__('datetime').timedelta(days=TEST_DAYS_AHEAD)).strftime('%Y-%m-%d')}",
        "",
        "---",
        "",
    ]

    for portal_key, result in results.items():
        summary = result["summary"]
        lines.extend([
            f"## {result['portal_name']}",
            "",
            f"**Search URL:** `{result['search_url']}`",
            "",
            "### Captured Endpoints",
            "",
            "| Endpoint | Count |",
            "|----------|-------|",
        ])

        # Count requests per endpoint
        endpoint_counts: dict[str, int] = {}
        for req in result["captured_requests"]:
            endpoint = f"{req['method']} {req['domain']}{req['path']}"
            endpoint_counts[endpoint] = endpoint_counts.get(endpoint, 0) + 1

        for endpoint, count in sorted(endpoint_counts.items(), key=lambda x: -x[1]):
            lines.append(f"| `{endpoint}` | {count} |")

        lines.extend([
            "",
            "### Auth Headers Found",
            "",
        ])

        if summary["auth_headers_found"]:
            for header in summary["auth_headers_found"]:
                lines.append(f"- `{header}`")
        else:
            lines.append("- None detected")

        lines.extend([
            "",
            "### Unique Domains",
            "",
        ])

        for domain in summary["unique_domains"]:
            lines.append(f"- `{domain}`")

        lines.extend(["", "---", ""])

    summary_path = "docs/portal-analysis/summary.md"
    with open(summary_path, "w") as f:
        f.write("\n".join(lines))
    logger.info(f"Summary markdown saved to: {summary_path}")


if __name__ == "__main__":
    asyncio.run(main())
