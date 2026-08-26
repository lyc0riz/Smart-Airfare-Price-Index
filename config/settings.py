"""Application settings using pydantic-settings."""

from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    CONFIG_DIR: Path = Path(__file__).resolve().parent
    ROUTES_CONFIG_PATH: Path = CONFIG_DIR / "routes_weights.json"
    RAW_DATA_DIR: Path = BASE_DIR / "data" / "raw"
    PROCESSED_DATA_DIR: Path = BASE_DIR / "data" / "processed"
    INDICES_DIR: Path = BASE_DIR / "data" / "indices"
    STORAGE_DIR: Path = BASE_DIR / "storage"

    # Rate limiting
    RATE_LIMIT_PER_SECOND: int = 1
    MAX_RETRIES: int = 5
    RETRY_BACKOFF_BASE: int = 2

    # Token management
    TOKEN_TTL_HOURS: int = 4

    # Scraping
    USER_AGENT: str = (
        "MoSPI-APIx-Research-Bot/1.0 "
        "(+https://mospi.gov.in/cpi; rate-limited; research-use)"
    )
    REQUEST_TIMEOUT: int = 30

    # Ixigo portal config
    IXIGO_API_KEY: str = "ixiweb!2$"
    IXIGO_CLIENT_ID: str = "ixiweb"
    IXIGO_SEARCH_URL: str = "https://www.ixigo.com/flights/v2/search/stream"
    IXIGO_OUTLOOK_URL: str = "https://www.ixigo.com/outlook/v1/onward/ranged"

    # Google Flights config
    GOOGLE_FLIGHTS_URL: str = "https://www.google.com/travel/flights"
    GOOGLE_FLIGHTS_RENDER_WAIT: int = 15  # Seconds to wait for JS rendering

    # Supabase PostgreSQL
    SUPABASE_DB_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # DuckDB (legacy — kept for local dev/testing)
    DB_PATH: Optional[str] = None

    # Proxy configuration (for production)
    PROXY_URL: Optional[str] = None

    # CAPTCHA solving service (Tier 3 - future)
    TWOCAPTCHA_API_KEY: Optional[str] = None

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: Optional[str] = None


def get_settings() -> Settings:
    """Get application settings instance."""
    return Settings()
