from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class BackofficeContext:
    repo_root: Path
    dashboard_dir: Path
    config_dir: Path
    variants_dir: Path
    scripts_dir: Path
    domain_map_json: Path
    manifest_json: Path
    env_local: Path
    manage_env_script: Path
    scaffolds_dir: Path
    research_json: Path
    embeddings_json: Path
    eval_latest: Path
    schema_md: Path
    error_log_csv: Path
    autofix_hook_ts: Path


def ensure_utf8_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def running_under_streamlit() -> bool:
    try:
        from streamlit.runtime.scriptrunner_utils.script_run_context import (
            get_script_run_ctx,
        )

        return get_script_run_ctx() is not None
    except Exception:
        return False


def launch_streamlit_if_needed(app_path: Path, argv: list[str] | None = None) -> None:
    if running_under_streamlit():
        return
    raise SystemExit(
        subprocess.call(
            [sys.executable, "-m", "streamlit", "run", str(app_path), *((argv or []))],
        )
    )
def find_repo_root(start: Path | None = None) -> Path:
    here = (start or Path(__file__).resolve()).resolve()
    candidates = [here.parent] if here.is_file() else [here]
    base = candidates[0]
    for p in [base, *base.parents]:
        marker = p / "config" / "codegen-core-manifest.json"
        if marker.is_file():
            return p
    raise FileNotFoundError(
        "Hittade inte repo-root (saknar config/codegen-core-manifest.json). "
        "Kör appen från sajtmaskin-repot."
    )


def build_backoffice_context(repo_root: Path | None = None) -> BackofficeContext:
    root = (repo_root or find_repo_root()).resolve()
    dashboard_dir = root / "config" / "dashboard"
    config_dir = root / "config"
    variants_dir = config_dir / "scaffold-variants"
    scripts_dir = root / "scripts"
    scaffolds_dir = root / "src" / "lib" / "gen" / "scaffolds"
    return BackofficeContext(
        repo_root=root,
        dashboard_dir=dashboard_dir,
        config_dir=config_dir,
        variants_dir=variants_dir,
        scripts_dir=scripts_dir,
        domain_map_json=dashboard_dir / "domain-map.json",
        manifest_json=config_dir / "ai_models" / "manifest.json",
        env_local=root / ".env.local",
        manage_env_script=scripts_dir / "env" / "manage_env.py",
        scaffolds_dir=scaffolds_dir,
        research_json=scaffolds_dir / "scaffold-research.generated.json",
        embeddings_json=scaffolds_dir / "scaffold-embeddings.json",
        eval_latest=root / "data" / "scaffold-eval" / "reports" / "scaffold-selection-latest.json",
        schema_md=root / "docs" / "contracts" / "scaffold-system.md",
        error_log_csv=root / "logs" / "llm-segmentts-and-index" / "error-log.csv",
        autofix_hook_ts=root / "src" / "lib" / "hooks" / "chat" / "useAutoFix.ts",
    )
