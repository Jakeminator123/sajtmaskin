#!/usr/bin/env python3
"""
Discover GitHub repos listed on shadcn.io template category pages and optionally
shallow-clone them into a local mirror directory (Zone 1 / raw — not for committing).

Default category URLs match GRUND/KALLOR_shadcn_io.md:
  nextjs, react, tailwind, radix-ui
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Set, Tuple

BASE = "https://www.shadcn.io/template/category"
DEFAULT_SLUGS = ("nextjs", "react", "tailwind", "radix-ui")

# Site chrome (nav / footer) — not a template card
DEFAULT_EXCLUDE = frozenset(
    {
        "https://github.com/shadcnio/react-shadcn-components",
    }
)

GITHUB_REPO_RE = re.compile(
    r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
)


@dataclass
class RepoRecord:
    github_url: str
    slug: str
    page: int
    folder_name: str


def fetch_html(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; SajtmaskinShadcnMirror/1.0; +https://github.com/)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def extract_github_urls(html: str) -> Set[str]:
    return set(GITHUB_REPO_RE.findall(html))


def normalize_repo(url: str) -> str:
    u = url.rstrip("/").lower()
    if u.endswith(".git"):
        u = u[:-4]
    return u


def to_folder_name(repo_url: str) -> str:
    """owner__repo — safe on Windows."""
    parts = repo_url.replace("https://github.com/", "").rstrip("/").split("/")
    if len(parts) < 2:
        return "invalid__repo"
    owner, repo = parts[0], parts[1]
    return f"{owner}__{repo}"


def discover_category(
    slug: str,
    max_pages: int,
    pause_s: float,
) -> Tuple[List[RepoRecord], Set[str]]:
    """Paginate ?page= until a page adds no new (normalized) GitHub repos."""
    seen_norm: Set[str] = set()
    records: List[RepoRecord] = []
    for page in range(1, max_pages + 1):
        url = f"{BASE}/{slug}" + (f"?page={page}" if page > 1 else "")
        try:
            html = fetch_html(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                break
            raise
        found = extract_github_urls(html)
        new_on_page: List[RepoRecord] = []
        for u in sorted(found):
            key = normalize_repo(u)
            if key in seen_norm:
                continue
            if u in DEFAULT_EXCLUDE or key in {
                normalize_repo(x) for x in DEFAULT_EXCLUDE
            }:
                continue
            seen_norm.add(key)
            new_on_page.append(
                RepoRecord(
                    github_url=u,
                    slug=slug,
                    page=page,
                    folder_name=to_folder_name(u),
                )
            )
        if not new_on_page and page > 1:
            break
        records.extend(new_on_page)
        time.sleep(pause_s)
    return records, seen_norm


def default_out_root(repo_root: Path) -> Path:
    env = __import__("os").environ.get("SHADCN_IO_MIRROR_DIR", "").strip()
    if env:
        return Path(env).expanduser()
    return repo_root / "_template_refs" / "shadcn-io-mirror"


def run_git_clone(
    repo_url: str, dest: Path, shallow: bool, timeout: int
) -> Tuple[bool, str]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["git", "clone"]
    if shallow:
        cmd += ["--depth", "1"]
    cmd += [repo_url, str(dest)]
    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return True, ""
    except FileExistsError:
        return False, "destination exists"
    except subprocess.CalledProcessError as e:
        return False, (e.stderr or e.stdout or str(e))[:2000]
    except subprocess.TimeoutExpired:
        return False, f"timeout after {timeout}s"


def interactive_args(repo_root: Path) -> argparse.Namespace:
    default_out = str(default_out_root(repo_root))
    print("\n=== shadcn.io template mirror — interaktiv körning ===\n")
    out = input(f"Speglingsrot (manifest + repos/) [{default_out}]: ").strip() or default_out
    print("\nKategorier (komma-separerade) eller Enter för alla fyra:")
    print(f"  {','.join(DEFAULT_SLUGS)}")
    cats = input("Kategorier: ").strip()
    slugs = cats if cats else ",".join(DEFAULT_SLUGS)

    dr = _prompt_yes_no("Bara discovery + manifest (ingen git clone)?", default_yes=True)
    lim_s = input("Max antal repon att klona (0 = alla efter dedupe) [0]: ").strip() or "0"
    try:
        limit = max(0, int(lim_s))
    except ValueError:
        limit = 0

    mp = input("Max sidor per kategori (säkerhetsgräns) [80]: ").strip() or "80"
    try:
        max_pages = max(1, int(mp))
    except ValueError:
        max_pages = 80

    return argparse.Namespace(
        repo_root=repo_root,
        out=Path(out).expanduser(),
        categories=slugs,
        max_pages=max_pages,
        pause=0.35,
        dry_run=dr,
        skip_clone=dr,
        limit=limit,
        git_timeout=600,
        no_shallow=False,
        interactive=False,
    )


def _prompt_yes_no(prompt: str, default_yes: bool = False) -> bool:
    hint = " [Y/n]: " if default_yes else " [y/N]: "
    r = input(prompt + hint).strip().lower()
    if not r:
        return default_yes
    return r in ("y", "yes", "j", "ja")


def parse_args(repo_root: Path) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mirror shadcn.io template GitHub repos (discover + optional shallow clone)."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=repo_root,
        help="Sajtmaskin repository root (default: parent of scripts/).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Mirror root (default: <repo>/_template_refs/shadcn-io-mirror or $SHADCN_IO_MIRROR_DIR).",
    )
    parser.add_argument(
        "--categories",
        default=",".join(DEFAULT_SLUGS),
        help=f"Comma-separated category slugs (default: {','.join(DEFAULT_SLUGS)}).",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=80,
        help="Safety cap per category when paginating (default 80).",
    )
    parser.add_argument(
        "--pause",
        type=float,
        default=0.35,
        help="Seconds between HTTP requests (default 0.35).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only discover and write manifest; do not clone.",
    )
    parser.add_argument(
        "--skip-clone",
        action="store_true",
        help="Same as --dry-run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="After global dedupe, clone at most N repos (0 = no limit).",
    )
    parser.add_argument(
        "--git-timeout",
        type=int,
        default=600,
        help="Per-repo git clone timeout seconds (default 600).",
    )
    parser.add_argument(
        "--no-shallow",
        action="store_true",
        help="Full clone instead of --depth 1.",
    )
    parser.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Interaktiv meny (rekommenderat vid manuell körning från repo-root).",
    )
    return parser.parse_args()


def run_mirror(args: argparse.Namespace) -> int:
    dry = args.dry_run or args.skip_clone

    repo_root: Path = args.repo_root
    out_root = args.out if args.out is not None else default_out_root(repo_root)
    repos_dir = out_root / "repos"
    manifest_path = out_root / "manifest.json"

    slugs = [s.strip() for s in args.categories.split(",") if s.strip()]

    all_records: Dict[str, RepoRecord] = {}
    per_slug: Dict[str, Set[str]] = {s: set() for s in slugs}

    for slug in slugs:
        recs, _ = discover_category(slug, args.max_pages, args.pause)
        for r in recs:
            key = normalize_repo(r.github_url)
            per_slug[slug].add(key)
            if key not in all_records:
                all_records[key] = r

    ordered_keys = sorted(all_records.keys())
    if args.limit > 0:
        ordered_keys = ordered_keys[: args.limit]

    manifest = {
        "generated_by": "mirror_shadcn_io_templates.py",
        "categories": slugs,
        "repo_root": str(repo_root),
        "out_root": str(out_root.resolve()),
        "unique_repos": len(all_records),
        "selected_for_clone": len(ordered_keys),
        "repos": [asdict(all_records[k]) for k in ordered_keys],
        "per_slug_counts": {s: len(per_slug[s]) for s in slugs},
        "per_slug_repos": {s: sorted(per_slug[s]) for s in slugs},
    }

    out_root.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote manifest: {manifest_path}")
    print(f"Unique repos discovered: {len(all_records)}; selected: {len(ordered_keys)}")

    if dry:
        print("Dry run — no git clone performed.")
        return 0

    shallow = not args.no_shallow
    results: List[dict] = []
    for key in ordered_keys:
        r = all_records[key]
        dest = repos_dir / r.folder_name
        if dest.exists():
            results.append(
                {
                    "github_url": r.github_url,
                    "path": str(dest),
                    "ok": True,
                    "skipped": "already exists",
                }
            )
            continue
        ok, err = run_git_clone(
            r.github_url, dest, shallow=shallow, timeout=args.git_timeout
        )
        results.append(
            {
                "github_url": r.github_url,
                "path": str(dest),
                "ok": ok,
                "error": err,
            }
        )
        print(("OK " if ok else "FAIL ") + r.github_url)

    (out_root / "clone_report.json").write_text(
        json.dumps(results, indent=2),
        encoding="utf-8",
    )
    failed = [x for x in results if not x.get("ok")]
    return 0 if not failed else 1


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    args = parse_args(repo_root)
    if args.interactive:
        args = interactive_args(repo_root)
    return run_mirror(args)


if __name__ == "__main__":
    sys.exit(main())
