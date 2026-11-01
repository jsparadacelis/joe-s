"""A cache session factory that records when sessions open and close."""

from contextlib import contextmanager


class Sessions:
    def __init__(self, cache):
        self.cache = cache
        self.events: list[str] = []
        self.open_count = 0

    @contextmanager
    def __call__(self):
        self.open_count += 1
        self.events.append("open")
        try:
            yield self.cache
        finally:
            self.events.append("close")
