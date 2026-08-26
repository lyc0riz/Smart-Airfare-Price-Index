"""Ethical scraping compliance module with async robots.txt parsing."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import aiohttp

from config.settings import get_settings

logger = logging.getLogger(__name__)


class ComplianceGuard:
    """Ethical scraping compliance guard with async robots.txt parsing.

    This class enforces ethical scraping rules including:
    - robots.txt compliance with research exemption
    - Rate limiting per domain
    - Custom User-Agent identification
    - Audit logging of all scraping decisions
    """

    def __init__(self) -> None:
        """Initialize compliance guard with settings."""
        self.settings = get_settings()
        self._robots_cache: dict[str, RobotFileParser] = {}
        self._crawl_delays: dict[str, float] = {}
        self._last_request_time: dict[str, datetime] = {}
        self._request_counts: dict[str, int] = {}

    def get_user_agent(self) -> str:
        """Get the custom User-Agent string.

        Returns:
            User-Agent string identifying MoSPI research bot.
        """
        return self.settings.USER_AGENT

    async def _fetch_robots_txt(self, domain: str) -> str:
        """Fetch robots.txt for a domain asynchronously.

        Args:
            domain: The domain to fetch robots.txt from.

        Returns:
            Content of robots.txt file, or empty string if not found.
        """
        robots_url = f"https://{domain}/robots.txt"

        try:
            async with aiohttp.ClientSession() as session:
                headers = {"User-Agent": self.get_user_agent()}
                async with session.get(
                    robots_url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(
                        total=self.settings.REQUEST_TIMEOUT
                    ),
                ) as response:
                    if response.status == 200:
                        content = await response.text()
                        logger.debug(f"Fetched robots.txt for {domain}")
                        return content
                    else:
                        logger.warning(
                            f"robots.txt not found for {domain} "
                            f"(status: {response.status})"
                        )
                        return ""
        except Exception as e:
            logger.error(f"Error fetching robots.txt for {domain}: {e}")
            return ""

    async def _parse_robots_txt(self, domain: str) -> RobotFileParser:
        """Parse robots.txt for a domain with caching.

        Args:
            domain: The domain to parse robots.txt for.

        Returns:
            Parsed RobotFileParser instance.
        """
        if domain in self._robots_cache:
            return self._robots_cache[domain]

        robots_content = await self._fetch_robots_txt(domain)

        rp = RobotFileParser()
        if robots_content:
            rp.parse(robots_content.splitlines())

            # Extract crawl-delay if present
            crawl_delay = rp.crawl_delay(self.get_user_agent())
            if crawl_delay:
                self._crawl_delays[domain] = float(crawl_delay)
                logger.info(
                    f"robots.txt crawl-delay for {domain}: {crawl_delay}s"
                )
        else:
            # No robots.txt found, allow with default rate limiting
            logger.info(
                f"No robots.txt for {domain}, using default rate limiting"
            )

        self._robots_cache[domain] = rp
        return rp

    def get_crawl_delay(self, domain: str) -> float:
        """Get crawl delay for a domain.

        Args:
            domain: The domain to get crawl delay for.

        Returns:
            Crawl delay in seconds, or default rate limit if not specified.
        """
        if domain in self._crawl_delays:
            return self._crawl_delays[domain]
        return 1.0 / self.settings.RATE_LIMIT_PER_SECOND

    async def can_fetch(self, url: str) -> bool:
        """Check if we can fetch a URL according to robots.txt.

        Implements research exemption: logs the decision but allows
        requests with rate limiting even when robots.txt blocks scraping.

        Args:
            url: The URL to check.

        Returns:
            True if fetch is allowed, False if blocked by robots.txt
            (unless research exemption applies).
        """
        parsed = urlparse(url)
        domain = parsed.netloc

        rp = await self._parse_robots_txt(domain)

        user_agent = self.get_user_agent()
        path = parsed.path or "/"

        # Check robots.txt rules
        is_allowed = rp.can_fetch(user_agent, url)

        # Log the decision
        timestamp = datetime.now(timezone.utc).isoformat()
        decision = "ALLOWED" if is_allowed else "BLOCKED_BY_ROBOTS_TXT"

        logger.info(
            f"[{timestamp}] robots.txt check: {decision} | "
            f"URL: {url} | Domain: {domain}"
        )

        # Research exemption: allow with rate limiting even if blocked
        if not is_allowed:
            logger.warning(
                f"Research exemption applied for {url} "
                f"(robots.txt blocks scraping, but allowing with rate limiting)"
            )
            return True

        return is_allowed

    async def wait_for_rate_limit(self, domain: str) -> None:
        """Wait if necessary to respect rate limits.

        Args:
            domain: The domain to rate limit for.
        """
        now = datetime.now(timezone.utc)

        if domain in self._last_request_time:
            elapsed = (now - self._last_request_time[domain]).total_seconds()
            crawl_delay = self.get_crawl_delay(domain)

            if elapsed < crawl_delay:
                wait_time = crawl_delay - elapsed
                logger.debug(
                    f"Rate limiting: waiting {wait_time:.2f}s for {domain}"
                )
                await asyncio.sleep(wait_time)

        self._last_request_time[domain] = datetime.now(timezone.utc)

        # Update request count
        self._request_counts[domain] = self._request_counts.get(domain, 0) + 1

    def log_request(
        self,
        url: str,
        status: int,
        response_time: float,
    ) -> None:
        """Log a scraping request for audit purposes.

        Args:
            url: The URL that was fetched.
            status: HTTP status code.
            response_time: Response time in seconds.
        """
        parsed = urlparse(url)
        domain = parsed.netloc
        timestamp = datetime.now(timezone.utc).isoformat()

        logger.info(
            f"[{timestamp}] REQUEST | Domain: {domain} | "
            f"URL: {url} | Status: {status} | "
            f"Response Time: {response_time:.3f}s | "
            f"Total Requests to Domain: {self._request_counts.get(domain, 0)}"
        )

    def get_stats(self) -> dict:
        """Get compliance statistics.

        Returns:
            Dictionary with request counts and other stats.
        """
        return {
            "request_counts": dict(self._request_counts),
            "crawl_delays": dict(self._crawl_delays),
            "cached_domains": list(self._robots_cache.keys()),
        }
