"""Parametric query builder for Ixigo flight search.

Generates search parameters based on:
- Current date (D0)
- Routes from routes_weights.json
- Advance purchase windows [1, 7, 15, 30, 45] days
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class QueryBuilder:
    """Build parametric flight search queries for Ixigo.

    Generates the full matrix of (route × advance_window) queries
    needed for daily airfare collection.
    """

    def __init__(self, routes_config_path: Optional[Path] = None) -> None:
        """Initialize query builder with routes configuration.

        Args:
            routes_config_path: Path to routes_weights.json.
                If None, uses default config path.
        """
        if routes_config_path is None:
            routes_config_path = (
                Path(__file__).resolve().parent.parent.parent
                / "config"
                / "routes_weights.json"
            )

        with open(routes_config_path) as f:
            self.config = json.load(f)

        self.routes = self.config["routes"]
        self.advance_windows = self.config["advance_windows_days"]

        logger.info(
            f"QueryBuilder initialized: {len(self.routes)} routes, "
            f"windows={self.advance_windows}"
        )

    def get_departure_date(
        self, base_date: Optional[datetime] = None, advance_days: int = 0
    ) -> datetime:
        """Calculate departure date from base date and advance window.

        Args:
            base_date: Reference date (default: today).
            advance_days: Number of days in advance.

        Returns:
            Calculated departure date.
        """
        if base_date is None:
            base_date = datetime.now()
        return base_date + timedelta(days=advance_days)

    def build_ixigo_query(
        self,
        origin: str,
        destination: str,
        departure_date: datetime,
    ) -> dict[str, str]:
        """Build Ixigo search query parameters.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Departure date.

        Returns:
            Query parameters for Ixigo API.
        """
        return {
            "origin": origin,
            "destination": destination,
            "leave": departure_date.strftime("%d%m%Y"),
            "return": "",
            "adults": "1",
            "children": "0",
            "infants": "0",
            "class": "e",
            "airlineFareType": "REGULAR",
            "version": "2.0",
            "searchSrc": "Search Form",
        }

    def generate_search_matrix(
        self,
        base_date: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Generate the full search matrix for all routes and windows.

        Args:
            base_date: Reference date for calculations (default: today).

        Returns:
            List of search query dicts, each containing:
            - route: Route key (e.g., 'DEL-BOM')
            - origin: IATA origin
            - destination: IATA destination
            - advance_window: Days in advance
            - departure_date: Calculated departure date
            - params: Ixigo query parameters
        """
        if base_date is None:
            base_date = datetime.now()

        matrix: list[dict[str, Any]] = []

        for route_key, route_config in self.routes.items():
            origin = route_config["origin"]
            destination = route_config["destination"]

            for window in self.advance_windows:
                dep_date = self.get_departure_date(base_date, window)
                params = self.build_ixigo_query(origin, destination, dep_date)

                matrix.append(
                    {
                        "route": route_key,
                        "origin": origin,
                        "destination": destination,
                        "advance_window": window,
                        "departure_date": dep_date.strftime("%Y-%m-%d"),
                        "params": params,
                    }
                )

        logger.info(
            f"Generated search matrix: {len(matrix)} queries "
            f"({len(self.routes)} routes × {len(self.advance_windows)} windows)"
        )
        return matrix

    def get_route_summary(self) -> dict[str, Any]:
        """Get summary of configured routes.

        Returns:
            Dictionary with route count, total weight, and route details.
        """
        total_weight = sum(r["weight"] for r in self.routes.values())
        return {
            "route_count": len(self.routes),
            "total_weight": total_weight,
            "advance_windows": self.advance_windows,
            "routes": {
                k: {
                    "origin": v["origin"],
                    "destination": v["destination"],
                    "weight": v["weight"],
                }
                for k, v in self.routes.items()
            },
        }
