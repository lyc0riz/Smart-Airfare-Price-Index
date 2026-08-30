"""Pydantic response models for the API."""

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


class Meta(BaseModel):
    """Standard response metadata."""

    portal: str
    count: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ApixResponse(BaseModel):
    """Standard envelope for data-returning endpoints."""

    data: list[dict[str, Any]] = Field(default_factory=list)
    meta: Meta


class ErrorDetail(BaseModel):
    """Error detail object (RFC 7807-inspired)."""

    code: int
    message: str
    type: str


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    error: ErrorDetail


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    db: str
    version: str
