"""Token and session cache store with TTL-based expiration.

Persists intercepted tokens, headers, and session data to JSON files
with configurable time-to-live (default: 4 hours).
"""

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class SessionEntry:
    """A cached session entry with metadata."""

    portal: str
    headers: dict[str, str] = field(default_factory=dict)
    cookies: dict[str, str] = field(default_factory=dict)
    device_id: str = ""
    created_at: float = field(default_factory=time.time)
    ttl_hours: float = 4.0
    last_used: float = field(default_factory=time.time)
    request_count: int = 0

    @property
    def is_expired(self) -> bool:
        """Check if this session entry has expired."""
        return time.time() - self.created_at > (self.ttl_hours * 3600)

    @property
    def age_hours(self) -> float:
        """Age of this entry in hours."""
        return (time.time() - self.created_at) / 3600

    def touch(self) -> None:
        """Update last used timestamp and request count."""
        self.last_used = time.time()
        self.request_count += 1


class SessionStore:
    """JSON file-based session store with TTL expiration.

    Stores intercepted tokens and session data for each portal.
    Entries automatically expire after the configured TTL.
    """

    def __init__(
        self,
        storage_dir: Optional[Path] = None,
        ttl_hours: float = 4.0,
    ) -> None:
        """Initialize session store.

        Args:
            storage_dir: Directory for JSON storage files.
                Defaults to {project_root}/storage/
            ttl_hours: Default time-to-live for entries in hours.
        """
        if storage_dir is None:
            storage_dir = Path(__file__).resolve().parent.parent.parent / "storage"

        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.ttl_hours = ttl_hours
        self._store_file = self.storage_dir / "tokens.json"
        self._entries: dict[str, SessionEntry] = {}

        self._load()
        logger.info(
            f"SessionStore initialized: {len(self._entries)} entries, "
            f"TTL={ttl_hours}h, dir={self.storage_dir}"
        )

    def _load(self) -> None:
        """Load entries from JSON file."""
        if not self._store_file.exists():
            return

        try:
            with open(self._store_file) as f:
                data = json.load(f)

            for key, entry_data in data.items():
                self._entries[key] = SessionEntry(**entry_data)

            # Purge expired entries on load
            expired = [k for k, v in self._entries.items() if v.is_expired]
            for k in expired:
                del self._entries[k]
                logger.debug(f"Purged expired entry: {k}")

            if expired:
                self._save()

        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to load session store: {e}")
            self._entries = {}

    def _save(self) -> None:
        """Persist entries to JSON file."""
        try:
            data = {key: asdict(entry) for key, entry in self._entries.items()}
            with open(self._store_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save session store: {e}")

    def get(self, portal: str) -> Optional[SessionEntry]:
        """Get a session entry for a portal.

        Args:
            portal: Portal name (e.g., 'Ixigo', 'EaseMyTrip').

        Returns:
            SessionEntry if found and not expired, None otherwise.
        """
        entry = self._entries.get(portal)
        if entry is None:
            logger.debug(f"No session entry for {portal}")
            return None

        if entry.is_expired:
            logger.info(f"Session entry for {portal} expired (age={entry.age_hours:.1f}h)")
            del self._entries[portal]
            self._save()
            return None

        entry.touch()
        self._save()
        return entry

    def put(
        self,
        portal: str,
        headers: dict[str, str],
        cookies: Optional[dict[str, str]] = None,
        device_id: str = "",
    ) -> SessionEntry:
        """Store a session entry for a portal.

        Args:
            portal: Portal name.
            headers: Request headers to cache.
            cookies: Optional cookies to cache.
            device_id: Device identifier used.

        Returns:
            The created SessionEntry.
        """
        entry = SessionEntry(
            portal=portal,
            headers=headers,
            cookies=cookies or {},
            device_id=device_id,
            ttl_hours=self.ttl_hours,
        )

        self._entries[portal] = entry
        self._save()

        logger.info(f"Cached session for {portal} (TTL={self.ttl_hours}h)")
        return entry

    def invalidate(self, portal: str) -> bool:
        """Invalidate (remove) a session entry.

        Args:
            portal: Portal name to invalidate.

        Returns:
            True if entry was found and removed, False otherwise.
        """
        if portal in self._entries:
            del self._entries[portal]
            self._save()
            logger.info(f"Invalidated session for {portal}")
            return True
        return False

    def clear(self) -> None:
        """Clear all session entries."""
        self._entries.clear()
        self._save()
        logger.info("Session store cleared")

    def status(self) -> dict[str, Any]:
        """Get status of all cached sessions.

        Returns:
            Dictionary with portal names and their entry status.
        """
        return {
            portal: {
                "age_hours": round(entry.age_hours, 2),
                "is_expired": entry.is_expired,
                "request_count": entry.request_count,
                "has_headers": bool(entry.headers),
                "has_cookies": bool(entry.cookies),
            }
            for portal, entry in self._entries.items()
        }

    def __len__(self) -> int:
        """Return number of active (non-expired) entries."""
        return len([e for e in self._entries.values() if not e.is_expired])

    def __repr__(self) -> str:
        """String representation."""
        return f"SessionStore(portals={len(self._entries)}, dir={self.storage_dir})"
