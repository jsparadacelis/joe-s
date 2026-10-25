"""Transactions with the study context set, so RLS applies."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from backend.app.study.domain.context import RequestContext


@contextmanager
def study_transaction(database_url: str, context: RequestContext) -> Iterator[psycopg.Connection]:
    """Open a transaction as `rgb_app` with `app.study_id` valid only inside it.

    Commits on a clean exit and rolls back on an exception.
    """
    with psycopg.connect(database_url) as conn:
        conn.execute("SET LOCAL ROLE rgb_app")
        conn.execute("SELECT set_config('app.study_id', %s, true)", (context.study_id,))
        yield conn


@contextmanager
def identity_transaction(database_url: str) -> Iterator[psycopg.Connection]:
    """Open a transaction as `rgb_app` before the study is known (sign-in).

    Every table stays invisible until `resolve_member` finds the study; the adapter then sets
    it on this same transaction so the activation can be audited atomically.
    """
    with psycopg.connect(database_url) as conn:
        conn.execute("SET LOCAL ROLE rgb_app")
        yield conn
