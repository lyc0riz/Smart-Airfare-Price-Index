"""Tests for parametric query matrix generator."""

from datetime import date

from src.ingestion.query_builder import QueryBuilder


class TestQueryBuilder:
    def test_default_advance_windows(self):
        qb = QueryBuilder()
        matrix = qb.generate_search_matrix(date(2026, 9, 1))
        windows = sorted(set(q["advance_window"] for q in matrix))
        assert windows == [1, 7, 15, 30, 45]

    def test_routes_loaded(self):
        qb = QueryBuilder()
        matrix = qb.generate_search_matrix(date(2026, 9, 1))
        routes = sorted(set(q["route"] for q in matrix))
        assert len(routes) > 0
        assert "DEL-BOM" in routes

    def test_flight_dates_computed(self):
        qb = QueryBuilder()
        matrix = qb.generate_search_matrix(date(2026, 9, 1))
        dep_dates = sorted(set(q["departure_date"] for q in matrix))
        expected = [
            "2026-09-02",   # T+1
            "2026-09-08",   # T+7
            "2026-09-16",   # T+15
            "2026-10-01",   # T+30
            "2026-10-16",   # T+45
        ]
        assert dep_dates == expected

    def test_matrix_size(self):
        qb = QueryBuilder()
        matrix = qb.generate_search_matrix(date(2026, 9, 1))
        n_routes = len(qb.routes)
        n_windows = 5
        assert len(matrix) == n_routes * n_windows

    def test_params_structure(self):
        qb = QueryBuilder()
        matrix = qb.generate_search_matrix(date(2026, 9, 1))
        for q in matrix:
            assert "origin" in q["params"]
            assert "destination" in q["params"]
            assert "leave" in q["params"]
