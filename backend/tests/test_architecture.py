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


def test_only_the_composition_root_wires_the_project_plans_adapter():
    """RGB-16: the Postgres adapter of the plans is imported by `api/dependencies` alone (and
    the port lives in the domain, the use case in application)."""
    assert (APP / "opportunity/domain/ports.py").read_text().count("class ProjectPlans") == 1
    assert (APP / "opportunity/application/start_project.py").exists()
    violations = [
        f"{p.relative_to(APP)} importa {name}"
        for p in APP.rglob("*.py")
        for name in _imports(p)
        if name.endswith("postgres_project_plans")
        and p.relative_to(APP).as_posix() != "api/dependencies.py"
    ]

    assert violations == []


def test_project_sheet_domain_is_pure_and_the_adapter_is_wired_by_the_composition_root_only():
    """RGB-17a: the sheet rules live in the domain without framework or driver imports; the
    port is in the domain, the use case in application, and the Postgres adapter is imported
    by `api/dependencies` alone."""
    sheet_domain = APP / "opportunity/domain/project_sheet.py"
    assert sheet_domain.exists()
    assert (APP / "opportunity/application/get_project_sheet.py").exists()
    assert (APP / "opportunity/domain/ports.py").read_text().count("class ProjectSheets") == 1
    forbidden = (*EXTERNAL, "backend.app.api", "psycopg")
    domain_violations = [
        name
        for name in _imports(sheet_domain)
        if name.split(".")[0] in EXTERNAL or any(name.startswith(bad) for bad in forbidden)
    ]
    wiring_violations = [
        f"{p.relative_to(APP)} importa {name}"
        for p in APP.rglob("*.py")
        for name in _imports(p)
        if name.endswith("postgres_project_sheets")
        and p.relative_to(APP).as_posix() != "api/dependencies.py"
    ]

    assert domain_violations == []
    assert wiring_violations == []
