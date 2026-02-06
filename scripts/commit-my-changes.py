"""
commit-my-changes.py
═══════════════════════════════════════════════════════════════

Interactive commit helper for selective staging when multiple
Cursor agents are working on the same repo.

Usage:
    python scripts/commit-my-changes.py

Flow:
    1. Shows all changed/untracked files with numbers
    2. You pick which files to stage (comma-separated or ranges)
    3. Shows a diff preview of what will be committed
    4. You write a commit message
    5. Choose: commit locally only, or commit + push to GitHub
"""

import subprocess
import sys
import os
from pathlib import Path

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore

# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def run(cmd: list[str], capture: bool = True) -> str:
    result = subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        cwd=find_repo_root(),
        encoding="utf-8",
        errors="replace",
    )
    if capture:
        return result.stdout.strip()
    return ""


def find_repo_root() -> Path:
    """Find the git repo root from this script's location."""
    p = Path(__file__).resolve().parent
    while p != p.parent:
        if (p / ".git").exists():
            return p
        p = p.parent
    # Fallback to cwd
    return Path.cwd()


def get_changed_files() -> list[dict]:
    """Get all changed files (staged, unstaged, untracked)."""
    raw = run(["git", "status", "--porcelain"])
    if not raw:
        return []
    files = []
    for line in raw.splitlines():
        if len(line) < 4:
            continue
        index_status = line[0]
        work_status = line[1]
        filepath = line[3:]

        # Determine display status
        if index_status == "?" and work_status == "?":
            status = "new"
            staged = False
        elif index_status == "A":
            status = "new (staged)"
            staged = True
        elif index_status == "D" or work_status == "D":
            status = "deleted"
            staged = index_status == "D"
        elif index_status in ("M", " ") or work_status in ("M", " "):
            staged = index_status == "M"
            status = "modified" + (" (staged)" if staged else "")
        else:
            status = f"{index_status}{work_status}"
            staged = index_status != " "

        files.append({
            "path": filepath.strip().strip('"'),
            "status": status,
            "staged": staged,
        })
    return files


def parse_selection(selection: str, max_idx: int) -> list[int]:
    """Parse user selection like '1,3,5-7' into a list of indices."""
    indices = set()
    for part in selection.replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            start, end = part.split("-", 1)
            try:
                s, e = int(start), int(end)
                for i in range(s, e + 1):
                    if 1 <= i <= max_idx:
                        indices.add(i)
            except ValueError:
                pass
        else:
            try:
                i = int(part)
                if 1 <= i <= max_idx:
                    indices.add(i)
            except ValueError:
                pass
    return sorted(indices)


# ═══════════════════════════════════════════════════════════════
# COLORS (ANSI)
# ═══════════════════════════════════════════════════════════════

BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
RED = "\033[31m"
DIM = "\033[2m"
RESET = "\033[0m"

STATUS_COLORS = {
    "new": GREEN,
    "new (staged)": GREEN,
    "modified": YELLOW,
    "modified (staged)": YELLOW,
    "deleted": RED,
}


def color_status(status: str) -> str:
    c = STATUS_COLORS.get(status, "")
    return f"{c}{status}{RESET}" if c else status


# ═══════════════════════════════════════════════════════════════
# MAIN FLOW
# ═══════════════════════════════════════════════════════════════

def main():
    os.system("")  # Enable ANSI on Windows

    print(f"\n{BOLD}═══ Commit My Changes ═══{RESET}\n")

    # 1. Show changed files
    files = get_changed_files()
    if not files:
        print(f"{GREEN}Inga ändrade filer. Allt är rent!{RESET}")
        return

    print(f"{BOLD}Ändrade filer:{RESET}\n")
    for i, f in enumerate(files, 1):
        marker = f"{GREEN}●{RESET}" if f["staged"] else f"{DIM}○{RESET}"
        print(f"  {marker} {CYAN}{i:>3}{RESET}  {color_status(f['status']):<20s} {f['path']}")

    # 2. File selection
    print(f"\n{BOLD}Välj filer att committa:{RESET}")
    print(f"  {DIM}Ange nummer separerade med komma, t.ex. 1,3,5-7{RESET}")
    print(f"  {DIM}'a' = alla, 's' = redan staged, 'q' = avbryt{RESET}")

    choice = input(f"\n  {BOLD}>{RESET} ").strip().lower()

    if choice == "q":
        print(f"\n{DIM}Avbrutet.{RESET}")
        return

    if choice == "a":
        selected_files = files
    elif choice == "s":
        selected_files = [f for f in files if f["staged"]]
        if not selected_files:
            print(f"\n{YELLOW}Inga staged filer. Välj specifika filer istället.{RESET}")
            return
    else:
        indices = parse_selection(choice, len(files))
        if not indices:
            print(f"\n{RED}Ogiltig inmatning.{RESET}")
            return
        selected_files = [files[i - 1] for i in indices]

    print(f"\n{BOLD}Valda filer ({len(selected_files)} st):{RESET}")
    for f in selected_files:
        print(f"  {GREEN}✓{RESET} {f['path']}")

    # 3. Stage selected files
    paths = [f["path"] for f in selected_files]

    # git add handles additions, modifications, AND deletions correctly
    for p in paths:
        run(["git", "add", p])

    # 4. Show diff preview
    print(f"\n{BOLD}Diff-preview:{RESET}")
    diff = run(["git", "diff", "--cached", "--stat"])
    if diff:
        for line in diff.splitlines():
            print(f"  {DIM}{line}{RESET}")
    else:
        print(f"  {DIM}(inga staged ändringar att visa){RESET}")

    # 5. Commit message
    print(f"\n{BOLD}Commit-meddelande:{RESET}")
    print(f"  {DIM}Rad 1 = rubrik, tom rad + fler rader = beskrivning{RESET}")
    print(f"  {DIM}Tom rad avslutar meddelandet{RESET}\n")

    lines = []
    while True:
        prefix = "  rubrik> " if len(lines) == 0 else "        > "
        line = input(prefix)
        if line == "" and len(lines) > 0:
            break
        lines.append(line)

    if not lines or not lines[0].strip():
        print(f"\n{RED}Tomt meddelande. Avbrutet.{RESET}")
        # Unstage
        run(["git", "reset", "HEAD"] + paths)
        return

    message = "\n".join(lines)

    # 6. Choose action
    print(f"\n{BOLD}Vad vill du göra?{RESET}")
    print(f"  {CYAN}1{RESET}  Committa lokalt (ingen push)")
    print(f"  {CYAN}2{RESET}  Committa + pusha till GitHub")
    print(f"  {CYAN}q{RESET}  Avbryt")

    action = input(f"\n  {BOLD}>{RESET} ").strip()

    if action == "q":
        run(["git", "reset", "HEAD"] + paths)
        print(f"\n{DIM}Avbrutet. Filer unstaged.{RESET}")
        return

    if action not in ("1", "2"):
        run(["git", "reset", "HEAD"] + paths)
        print(f"\n{RED}Ogiltigt val. Avbrutet.{RESET}")
        return

    # 7. Execute
    print(f"\n{DIM}Committar...{RESET}")
    result = subprocess.run(
        ["git", "commit", "-m", message],
        capture_output=True,
        text=True,
        cwd=find_repo_root(),
        encoding="utf-8",
        errors="replace",
    )

    if result.returncode != 0:
        print(f"\n{RED}Commit misslyckades:{RESET}")
        print(result.stderr or result.stdout)
        return

    # Show commit result
    for line in (result.stdout or "").splitlines():
        print(f"  {GREEN}{line}{RESET}")

    if action == "2":
        print(f"\n{DIM}Pushar till GitHub...{RESET}")
        push_result = subprocess.run(
            ["git", "push", "origin", "main"],
            capture_output=True,
            text=True,
            cwd=find_repo_root(),
            encoding="utf-8",
            errors="replace",
        )
        if push_result.returncode != 0:
            print(f"\n{RED}Push misslyckades:{RESET}")
            print(push_result.stderr or push_result.stdout)
            print(f"\n{YELLOW}Committen finns lokalt. Du kan pusha manuellt med 'git push origin main'.{RESET}")
        else:
            output = push_result.stderr or push_result.stdout  # git push writes to stderr
            for line in output.splitlines():
                print(f"  {GREEN}{line}{RESET}")
            print(f"\n{GREEN}{BOLD}Klart! Committat och pushat till GitHub.{RESET}")
    else:
        print(f"\n{GREEN}{BOLD}Klart! Committat lokalt (ej pushat).{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{DIM}Avbrutet.{RESET}")
        sys.exit(0)
