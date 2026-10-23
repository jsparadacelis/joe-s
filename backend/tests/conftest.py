import os
import uuid

import psycopg
import pytest


@pytest.fixture
def database_url():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL no definida: se omiten los tests de integración")
    return url


@pytest.fixture
def schema_url(database_url):
    """URL con un esquema propio y efímero para no pisar otros tests."""
    schema = f"t_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(f"CREATE SCHEMA {schema}")
    separator = "&" if "?" in database_url else "?"
    yield f"{database_url}{separator}options=-csearch_path%3D{schema}", schema
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA {schema} CASCADE")
