"""DDD dependency rule: domain <- application <- api; infrastructure implements ports."""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"

FORBIDDEN = {
    "domain": ("application", "infrastructure", "api"),
    "application": ("infrastructure", "api"),
}
EXTERNAL = ("fastapi", "psycopg", "requests", "httpx", "pydantic_settings")


def _imports(path: Path) -> list[str]:
    names: list[str] = []
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            names += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.append(node.module)
    return names


def _layer_files(layer: str) -> list[Path]:
    return [p for p in APP.rglob("*.py") if layer in p.relative_to(APP).parts[:-1]]


@pytest.mark.parametrize("layer", ["domain", "application"])
def test_layers_do_not_import_outward(layer):
    violations = [
        f"{p.relative_to(APP)} importa {name}"
        for p in _layer_files(layer)
        for name in _imports(p)
        if any(f".{bad}" in f".{name}." for bad in FORBIDDEN[layer])
    ]

    assert violations == []


def test_domain_does_not_import_external_libraries():
    violations = [
        f"{p.relative_to(APP)} importa {name}"
        for p in _layer_files("domain")
        for name in _imports(p)
        if name.split(".")[0] in EXTERNAL
    ]

    assert violations == []


def test_ai_packages_never_import_the_promotion_service():
    """No AI action changes a project's state (PRD rule)."""
    violations = [
        f"{p.relative_to(APP)} importa {name}"
        for pkg in ("ai", "report")
        for p in APP.rglob("*.py")
        if pkg in p.relative_to(APP).parts
        for name in _imports(p)
        if "lifecycle" in name
    ]

    assert violations == []
