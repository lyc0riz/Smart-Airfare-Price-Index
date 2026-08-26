"""Raw response storage for auditable data lineage.

Saves raw API responses to data/raw/YYYY-MM-DD/ organized by
source, route, and advance window for debugging and reproducibility.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class RawSink:
    """Save raw flight search responses to dated directories.

    Directory structure:
        data/raw/YYYY-MM-DD/
            ixigo_DEL-BOM_T+1.json
            ixigo_DEL-BOM_T+7.json
            ...
    """

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        """Initialize raw sink.

        Args:
            base_dir: Base data directory. Defaults to {project_root}/data/raw/
        """
        if base_dir is None:
            base_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw"

        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"RawSink initialized: {self.base_dir}")

    def save(
        self,
        source: str,
        route: str,
        advance_window: int,
        data: Any,
        date: Optional[datetime] = None,
    ) -> Path:
        """Save raw response data to a JSON file.

        Args:
            source: Data source name (e.g., 'ixigo').
            route: Route string (e.g., 'DEL-BOM').
            advance_window: Advance purchase window in days.
            data: Raw response data (will be JSON-serialized).
            date: Date for directory naming (default: today).

        Returns:
            Path to the saved file.
        """
        if date is None:
            date = datetime.now()

        # Create dated directory
        day_dir = self.base_dir / date.strftime("%Y-%m-%d")
        day_dir.mkdir(parents=True, exist_ok=True)

        # Build filename: ixigo_DEL-BOM_T+7.json
        filename = f"{source}_{route}_T+{advance_window}.json"
        filepath = day_dir / filename

        try:
            with open(filepath, "w") as f:
                json.dump(
                    {
                        "source": source,
                        "route": route,
                        "advance_window": advance_window,
                        "capture_timestamp": datetime.now().isoformat(),
                        "data": data,
                    },
                    f,
                    indent=2,
                    default=str,
                )
            logger.debug(f"Saved raw response to {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to save raw response: {e}")
            raise

    def save_batch(
        self,
        records: list[dict[str, Any]],
        date: Optional[datetime] = None,
    ) -> list[Path]:
        """Save a batch of raw responses.

        Args:
            records: List of dicts with keys: source, route, advance_window, data.
            date: Date for directory naming (default: today).

        Returns:
            List of paths to saved files.
        """
        paths: list[Path] = []

        for record in records:
            try:
                path = self.save(
                    source=record["source"],
                    route=record["route"],
                    advance_window=record["advance_window"],
                    data=record["data"],
                    date=date,
                )
                paths.append(path)
            except Exception as e:
                logger.error(
                    f"Failed to save record for {record['route']} "
                    f"T+{record['advance_window']}: {e}"
                )

        logger.info(f"Saved {len(paths)}/{len(records)} raw responses")
        return paths

    def list_dates(self) -> list[str]:
        """List all dates with stored data.

        Returns:
            Sorted list of date strings (YYYY-MM-DD).
        """
        if not self.base_dir.exists():
            return []

        dates = sorted(
            d.name for d in self.base_dir.iterdir()
            if d.is_dir() and len(d.name) == 10
        )
        return dates

    def list_files(self, date_str: str) -> list[Path]:
        """List all raw files for a specific date.

        Args:
            date_str: Date string (YYYY-MM-DD).

        Returns:
            List of file paths.
        """
        day_dir = self.base_dir / date_str
        if not day_dir.exists():
            return []

        return sorted(day_dir.glob("*.json"))

    def get_stats(self) -> dict[str, Any]:
        """Get storage statistics.

        Returns:
            Dictionary with date count, file count, total size.
        """
        dates = self.list_dates()
        total_files = 0
        total_size = 0

        for date_str in dates:
            files = self.list_files(date_str)
            total_files += len(files)
            total_size += sum(f.stat().st_size for f in files)

        return {
            "dates": len(dates),
            "files": total_files,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
        }
