"""API layer configuration using pydantic-settings."""

import json
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    """Settings specific to the API wrapper layer."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Supabase project
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Authentication: JSON mapping of API key -> label
    # e.g. {"frontend-key": "web", "mobile-key": "mobile", "admin-key": "admin"}
    API_KEYS: str = "{}"

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 100

    # CORS
    CORS_ORIGINS_JSON: str = '["http://localhost:3000"]'

    # Logging
    LOG_LEVEL: str = "INFO"

    @property
    def api_keys(self) -> dict[str, str]:
        """Parsed API key mapping."""
        try:
            parsed = json.loads(self.API_KEYS)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}

    @property
    def cors_origins(self) -> list[str]:
        """Parsed CORS origins list."""
        try:
            parsed = json.loads(self.CORS_ORIGINS_JSON)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []


def get_api_settings() -> ApiSettings:
    """Get the API settings instance."""
    return ApiSettings()
