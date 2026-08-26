"""Tests for ethical scraping compliance."""

import pytest

from src.ingestion.compliance import ComplianceGuard


class TestComplianceGuard:
    def test_user_agent_format(self):
        guard = ComplianceGuard()
        ua = guard.get_user_agent()
        assert ua.startswith("MoSPI-APIx-Research-Bot")
