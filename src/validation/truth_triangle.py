"""Cross-source fare parity validation ("Truth Triangle").

Compares fares for the same flight observed on Ixigo (primary) and
Google Flights (secondary) for a given scrape date. Flights are matched
on the composite key:

    (journey_date, origin, destination, carrier_code,
     departure time-of-day, arrival time-of-day)

`flight_number` is deliberately excluded: Google Flights uses synthetic
flight numbers (`GF-...`, see spec rule N10) that cannot be matched to
Ixigo's real flight numbers.

Parity rule: sources agreeing within 1% are accepted; larger disparities
are flagged in the audit log and the primary source value is preferred.
"""

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from src.storage.supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)

PRIMARY_SOURCE = "Ixigo"
SECONDARY_SOURCE = "Google Flights"

MatchKey = tuple[str, str, str, Optional[str], str, str]


@dataclass
class ParityResult:
    """Summary of a truth-triangle parity run."""

    observation_date: Optional[date] = None
    matched_pairs: int = 0
    agreed_pairs: int = 0
    disparity_pairs: int = 0
    unmatched_primary: int = 0
    unmatched_secondary: int = 0
    disparities: list[dict[str, Any]] = field(default_factory=list)

    @property
    def agreement_rate(self) -> float:
        """Fraction of matched pairs within tolerance (0.0 if no matches)."""
        if self.matched_pairs == 0:
            return 0.0
        return self.agreed_pairs / self.matched_pairs


def build_match_key(
    journey_date: Any,
    origin: str,
    destination: str,
    carrier_code: Optional[str],
    departure_time_of_day: Any,
    arrival_time_of_day: Any,
) -> MatchKey:
    """Build the cross-source match key from raw DB values.

    Normalizes types so keys compare equal across sources: dates and
    times become strings, carrier codes are upper-cased.

    Args:
        journey_date: Scheduled departure date (date or ISO string).
        origin: IATA origin code.
        destination: IATA destination code.
        carrier_code: IATA carrier code (None rows never match).
        departure_time_of_day: Departure time (time or string).
        arrival_time_of_day: Arrival time (time or string).

    Returns:
        Tuple key usable for dict-based matching.
    """
    dep = (
        departure_time_of_day.strftime("%H:%M")
        if hasattr(departure_time_of_day, "strftime")
        else str(departure_time_of_day)
    )
    arr = (
        arrival_time_of_day.strftime("%H:%M")
        if hasattr(arrival_time_of_day, "strftime")
        else str(arrival_time_of_day)
    )
    return (
        str(journey_date),
        origin.upper(),
        destination.upper(),
        carrier_code.upper() if carrier_code else None,
        dep,
        arr,
    )


def compare_sources(
    primary: dict[MatchKey, float],
    secondary: dict[MatchKey, float],
    tolerance: float = 0.01,
) -> ParityResult:
    """Compare primary vs secondary fare maps (pure function).

    Args:
        primary: Match key → total_fare for the primary source.
        secondary: Match key → total_fare for the secondary source.
        tolerance: Relative disparity threshold (0.01 = 1%).

    Returns:
        ParityResult with matched/agreed/disparity counts and an audit
        list of disparities (primary value is the preferred one).
    """
    result = ParityResult()
    result.unmatched_primary = len(primary) - len(set(primary) & set(secondary))
    result.unmatched_secondary = len(secondary) - len(set(primary) & set(secondary))

    for key in sorted(set(primary) & set(secondary)):
        p_fare = primary[key]
        s_fare = secondary[key]
        result.matched_pairs += 1

        base = min(p_fare, s_fare)
        delta_pct = abs(p_fare - s_fare) / base if base > 0 else float("inf")

        if delta_pct <= tolerance:
            result.agreed_pairs += 1
        else:
            result.disparity_pairs += 1
            result.disparities.append({
                "journey_date": key[0],
                "origin": key[1],
                "destination": key[2],
                "carrier_code": key[3],
                "departure": key[4],
                "arrival": key[5],
                "primary_fare": round(p_fare, 2),
                "secondary_fare": round(s_fare, 2),
                "delta_pct": round(delta_pct * 100, 2),
                "preferred_source": PRIMARY_SOURCE,
            })

    return result


class TruthTriangle:
    """Runs cross-source parity checks against stored flight quotes."""

    def __init__(
        self,
        sink: SupabaseSink,
        tolerance: float = 0.01,
    ) -> None:
        """Initialize with a connected sink.

        Args:
            sink: Async PostgreSQL sink with an open connection pool.
            tolerance: Relative fare disparity threshold (default 1%).
        """
        self.sink = sink
        self.tolerance = tolerance

    async def _load_fares_by_key(
        self,
        source_portal: str,
        observation_date: date,
    ) -> dict[MatchKey, float]:
        """Load the cheapest quote per match key for one source.

        Multiple fare buckets may exist per flight; the minimum
        `total_fare` is used as the representative price.

        Args:
            source_portal: Portal identifier.
            observation_date: Scrape date (matches `booking_date`).

        Returns:
            Mapping of match key to minimum total_fare.
        """
        rows = await self.sink.query(
            """
            SELECT journey_date, origin, destination, carrier_code,
                   departure::time AS departure_time,
                   arrival::time AS arrival_time,
                   MIN(total_fare::float8) AS min_fare
            FROM flight_quotes
            WHERE source_portal = $1
              AND booking_date = $2
              AND NOT is_imputed
              AND NOT is_sold_out
              AND total_fare > 0
            GROUP BY journey_date, origin, destination, carrier_code,
                     departure::time, arrival::time
            """,
            source_portal,
            observation_date,
        )
        return {
            build_match_key(
                r["journey_date"],
                r["origin"],
                r["destination"],
                r["carrier_code"],
                r["departure_time"],
                r["arrival_time"],
            ): r["min_fare"]
            for r in rows
        }

    async def run(self, observation_date: date) -> ParityResult:
        """Run the parity check for a scrape date.

        Logs every >1% disparity as a warning (audit trail); the primary
        source value is preferred downstream by construction of the
        index pipeline (per-portal indices; Ixigo is authoritative).

        Args:
            observation_date: Scrape date to validate.

        Returns:
            ParityResult summary.
        """
        primary = await self._load_fares_by_key(
            PRIMARY_SOURCE, observation_date
        )
        secondary = await self._load_fares_by_key(
            SECONDARY_SOURCE, observation_date
        )

        result = compare_sources(primary, secondary, self.tolerance)
        result.observation_date = observation_date

        logger.info(
            f"Truth Triangle {observation_date}: "
            f"{result.matched_pairs} matched, {result.agreed_pairs} agreed, "
            f"{result.disparity_pairs} disparities "
            f"({result.agreement_rate:.1%} agreement), "
            f"{result.unmatched_primary} unmatched {PRIMARY_SOURCE}, "
            f"{result.unmatched_secondary} unmatched {SECONDARY_SOURCE}"
        )
        for d in result.disparities:
            logger.warning(
                "Fare disparity %.2f%% for %s %s->%s %s %s-%s: "
                "%s=%.2f vs %s=%.2f — preferring %s",
                d["delta_pct"],
                d["journey_date"],
                d["origin"],
                d["destination"],
                d["carrier_code"],
                d["departure"],
                d["arrival"],
                PRIMARY_SOURCE,
                d["primary_fare"],
                SECONDARY_SOURCE,
                d["secondary_fare"],
                d["preferred_source"],
            )

        return result
