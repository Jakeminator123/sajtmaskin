from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class BackofficeContext:
    repo_root: Path
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
    error_log_ndjson: Path
    llm_index_readme: Path
    autofix_hook_ts: Path


def ensure_utf8_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")


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
    config_dir = root / "config"
    variants_dir = config_dir / "scaffold-variants"
    scripts_dir = root / "scripts"
    scaffolds_dir = root / "src" / "lib" / "gen" / "scaffolds"
    # Enda Python-ägaren av sökvägen. TS-motsvarigheten är LEGACY_INDEX_DIR i
    # src/lib/logging/generation-log-writer/constants.ts — håll dem i synk.
    llm_index_dir = root / "logs" / "llm-segmentts-and-index"
    return BackofficeContext(
        repo_root=root,
        config_dir=config_dir,
        variants_dir=variants_dir,
        scripts_dir=scripts_dir,
        domain_map_json=config_dir / "backoffice" / "domain-map.json",
        manifest_json=config_dir / "ai_models" / "manifest.json",
        env_local=root / ".env.local",
        manage_env_script=scripts_dir / "env" / "manage_env.py",
        scaffolds_dir=scaffolds_dir,
        research_json=scaffolds_dir / "scaffold-research.generated.json",
        embeddings_json=scaffolds_dir / "scaffold-embeddings.json",
        eval_latest=root / "data" / "scaffold-eval" / "reports" / "scaffold-selection-latest.json",
        schema_md=root / "docs" / "contracts" / "scaffold-system.md",
        error_log_csv=llm_index_dir / "error-log.csv",
        error_log_ndjson=llm_index_dir / "error-log.ndjson",
        llm_index_readme=llm_index_dir / "readme.txt",
        autofix_hook_ts=root / "src" / "lib" / "hooks" / "chat" / "useAutoFix.ts",
    )
