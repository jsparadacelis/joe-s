"""Transactions with the study context set, so RLS applies."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

from backend.app.study.domain.context import RequestContext

_pools: dict[str, ConnectionPool] = {}


def open_pool(database_url: str, *, min_size: int = 1, max_size: int = 4) -> None:
    """Reuse connections to this database from now on (a no-op if it already has a pool).

    Opening a connection costs several round trips (TCP, TLS, authentication), which is most
    of the latency of a request when the database is far from the API. Transactions keep their
    guarantees on a reused connection because the role and the study are `SET LOCAL`.
    """
    if database_url in _pools:
        return
    pool = ConnectionPool(
        database_url,
        min_size=min_size,
        max_size=max_size,
        max_idle=60,
        max_lifetime=600,
        check=ConnectionPool.check_connection,
        open=False,
    )
    pool.open(wait=False)  # an unreachable database must not keep /api/health from answering
    _pools[database_url] = pool


def close_pools() -> None:
    while _pools:
        _, pool = _pools.popitem()
        pool.close()


@contextmanager
def _connection(database_url: str) -> Iterator[psycopg.Connection]:
    """A transaction: commits on a clean exit, rolls back on an exception."""
    pool = _pools.get(database_url)
    if pool is None:
        with psycopg.connect(database_url) as conn:
            yield conn
    else:
        with pool.connection() as conn:
            yield conn


@contextmanager
def study_transaction(database_url: str, context: RequestContext) -> Iterator[psycopg.Connection]:
    """Open a transaction as `rgb_app` with `app.study_id` valid only inside it.

    Commits on a clean exit and rolls back on an exception.
    """
    with _connection(database_url) as conn:
        conn.execute("SET LOCAL ROLE rgb_app")
        conn.execute("SELECT set_config('app.study_id', %s, true)", (context.study_id,))
        yield conn


@contextmanager
def identity_transaction(database_url: str) -> Iterator[psycopg.Connection]:
    """Open a transaction as `rgb_app` before the study is known (sign-in).

    Every table stays invisible until `resolve_member` finds the study; the adapter then sets
    it on this same transaction so the activation can be audited atomically.
    """
    with _connection(database_url) as conn:
        conn.execute("SET LOCAL ROLE rgb_app")
        yield conn
