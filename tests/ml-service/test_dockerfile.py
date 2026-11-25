"""The API image must contain every local module the API imports (#109).

The Dockerfile copies Python files by name. explain.py (#104) was missing,
so the deployed container failed on startup while every test passed,
because the tests run from the source tree, not the image.
"""
import ast
import re
from pathlib import Path

ML_SERVICE = Path(__file__).resolve().parents[2] / "ml-service"


def _local_imports(module_path, seen=None):
    """Local modules imported by module_path, followed transitively."""
    seen = set() if seen is None else seen
    tree = ast.parse(module_path.read_text())
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [alias.name.split(".")[0] for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names = [node.module.split(".")[0]]
        for name in names:
            local = ML_SERVICE / f"{name}.py"
            if local.exists() and name not in seen:
                seen.add(name)
                _local_imports(local, seen)
    return seen


def _copied_files():
    dockerfile = (ML_SERVICE / "Dockerfile").read_text()
    return set(re.findall(r"ml-service/(\w+\.py)", dockerfile))


def test_dockerfile_copies_every_module_the_api_imports():
    needed = {f"{name}.py" for name in _local_imports(ML_SERVICE / "api.py")} | {"api.py"}
    missing = needed - _copied_files()
    assert not missing, f"ml-service/Dockerfile does not copy: {sorted(missing)}"


def test_dockerfile_copies_the_training_script_it_runs():
    assert "finalize_model.py" in _copied_files()
    assert {f"{n}.py" for n in _local_imports(ML_SERVICE / "finalize_model.py")} <= _copied_files()
