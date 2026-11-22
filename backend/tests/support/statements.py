"""Count the round trips the client makes to Postgres, from the libpq protocol trace.

Each simple `Query` message and each `Sync` (end of an extended-protocol statement) waits for
the server's answer, so their number is the number of round trips a request pays.
"""

from __future__ import annotations

import re
import tempfile

import psycopg
import pytest
from psycopg.pq import Trace


class StatementLog:
    def __init__(self) -> None:
        self._file = tempfile.TemporaryFile(mode="w+")
        self._start = 0

    def attach(self, conn: psycopg.Connection) -> None:
        conn.pgconn.trace(self._file.fileno())
        conn.pgconn.set_trace_flags(Trace.SUPPRESS_TIMESTAMPS | Trace.REGRESS_MODE)

    def reset(self) -> None:
        """Count from now on."""
        self._file.flush()
        self._start = self._file.seek(0, 2)

    def statements(self) -> list[str]:
        """The SQL of each round trip since the last `reset`, in order ("" for an empty query)."""
        self._file.flush()
        self._file.seek(self._start)
        statements, parsed = [], ""
        for line in self._file.read().splitlines():
            fields = line.split("\t", 3)
            if len(fields) < 3 or fields[0] != "F":
                continue
            message, detail = fields[2], fields[3] if len(fields) > 3 else ""
            if message == "Query":
                statements.append(detail.strip()[1:-1])
            elif message == "Parse":
                # ` "<statement name>" "<sql>" <number of params> [<type oid>...]`
                parsed = _PARSE.match(detail).group(1)
            elif message == "Sync":
                statements.append(parsed)
        return statements

    def close(self) -> None:
        self._file.close()


_PARSE = re.compile(r'\s*"[^"]*" "(.*)" \d+[ N]*$', re.S)


@pytest.fixture
def statement_log(monkeypatch):
    """Trace every connection opened from now on through `Connection.connect`, which is what
    the pool calls (the module-level `psycopg.connect` is a separate reference)."""
    log = StatementLog()
    connect = psycopg.Connection.connect.__func__

    def traced(cls, *args, **kwargs):
        conn = connect(cls, *args, **kwargs)
        log.attach(conn)
        return conn

    monkeypatch.setattr(psycopg.Connection, "connect", classmethod(traced))
    yield log
    log.close()
