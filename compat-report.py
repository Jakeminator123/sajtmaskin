from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional, Tuple


def is_admin_windows() -> Optional[bool]:
    if os.name != "nt":
        return None
    try:
        import ctypes  # noqa: PLC0415
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return None


def read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def run_cmd(cmd: list[str], cwd: Path) -> Tuple[int, str]:
    """
    Runs a command and returns (exit_code, combined_output).
    Uses text mode, merges stderr into stdout.
    """
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        out = (p.stdout or "") + (p.stderr or "")
        return p.returncode, out.strip()
    except FileNotFoundError as e:
        return 127, f"FileNotFoundError: {e}"
    except Exception as e:
        return 1, f"Exception: {e}"


def log(writer, s: str) -> None:
    print(s)
    writer.write(s + "\n")


def header(writer, title: str) -> None:
    log(writer, "")
    log(writer, f"=== {title} ===")


def try_run(writer, label: str, cmd: list[str], cwd: Path) -> None:
    code, out = run_cmd(cmd, cwd)
    if code == 0:
        log(writer, f"{label}:")
    else:
        log(writer, f"{label} (exit={code}):")

    if not out:
        log(writer, "  <no output>")
        return

    for line in out.splitlines():
        log(writer, "  " + line)


def list_project_files(writer, cwd: Path) -> None:
    files = [
        "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
        "tsconfig.json", "tsconfig.base.json", "tsconfig.app.json", "tsconfig.node.json",
        "eslint.config.js", ".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs",
        ".npmrc", ".yarnrc.yml", ".nvmrc", ".node-version",
        "next.config.js", "next.config.ts", "vite.config.ts", "vite.config.js",
        ".vscode/settings.json", ".cursor/settings.json",
    ]

    for rel in files:
        p = cwd / rel
        if p.exists():
            st = p.stat()
            ts = datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            log(writer, f"{rel:<24} {st.st_size:>10} bytes  {ts}")


def show_pkg_pins_and_deps(writer, cwd: Path) -> None:
    pkg_path = cwd / "package.json"
    pkg = read_json(pkg_path)
    if not pkg:
        log(writer, "package.json kunde inte läsas.")
        return

    package_manager = pkg.get("packageManager")
    engines = pkg.get("engines") or {}
    volta = pkg.get("volta") or {}

    log(writer, f"packageManager: {package_manager}")
    log(writer, f"engines:        {', '.join([f'{k}={v}' for k, v in engines.items()])}")
    log(writer, f"volta:          {', '.join([f'{k}={v}' for k, v in volta.items()])}")

    keys = [
        "next", "react", "react-dom",
        "typescript", "ts-node", "@types/node",
        "eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin",
        "vite", "vitest",
        "tailwindcss", "postcss", "autoprefixer",
        "@radix-ui/react-dialog", "@radix-ui/react-popover",
    ]

    deps = pkg.get("dependencies") or {}
    devdeps = pkg.get("devDependencies") or {}

    for k in keys:
        v = deps.get(k) or devdeps.get(k)
        if v:
            log(writer, f"{k:<35} {v}")


def tsconfig_quick_peek(writer, cwd: Path) -> None:
    ts_path = cwd / "tsconfig.json"
    ts = read_json(ts_path)
    if not ts:
        log(writer, "Ingen (eller oläsbar) tsconfig.json i roten.")
        return

    co = ts.get("compilerOptions") or {}
    log(writer, f"target:           {co.get('target')}")
    log(writer, f"module:           {co.get('module')}")
    log(writer, f"moduleResolution: {co.get('moduleResolution')}")
    log(writer, f"jsx:              {co.get('jsx')}")


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    cwd = Path.cwd()

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    report_path = script_dir / f"compat-report-{stamp}.txt"

    # Write in UTF-8 no BOM
    with report_path.open("w", encoding="utf-8", newline="\n") as f:
        header(f, "Session")
        log(f, f"Report: {report_path}")
        log(f, f"ScriptDir: {script_dir}")
        log(f, f"PWD:      {cwd}")
        log(f, f"User:     {os.environ.get('USERNAME') or os.environ.get('USER')}")
        log(f, f"Admin:    {is_admin_windows()}")
        log(f, f"Host:     {platform.node()}")
        log(f, f"OS:       {platform.platform()}")
        log(f, f"Python:   {sys.version.splitlines()[0]}")

        header(f, "PATH resolution (where.exe)")
        for tool in ["node", "npm", "npx", "pnpm", "yarn", "tsc", "eslint", "volta", "corepack"]:
            try_run(f, f"where {tool}", ["where.exe", tool], cwd)

        header(f, "Runtime versions")
        try_run(f, "node -v", ["node", "-v"], cwd)
        try_run(f, "node execPath", ["node", "-p", "process.execPath"], cwd)
        try_run(f, "npm -v", ["npm", "-v"], cwd)
        try_run(f, "npx -v", ["npx", "-v"], cwd)
        try_run(f, "corepack -v", ["corepack", "-v"], cwd)
        try_run(f, "pnpm -v", ["pnpm", "-v"], cwd)
        try_run(f, "yarn -v", ["yarn", "-v"], cwd)

        # Volta bits (if present)
        header(f, "Volta")
        try_run(f, "volta -v", ["volta", "-v"], cwd)
        try_run(f, "volta list", ["volta", "list"], cwd)
        try_run(f, "volta which node", ["volta", "which", "node"], cwd)
        try_run(f, "volta which npm", ["volta", "which", "npm"], cwd)
        try_run(f, "volta which pnpm", ["volta", "which", "pnpm"], cwd)
        try_run(f, "volta which yarn", ["volta", "which", "yarn"], cwd)

        header(f, "Project files")
        list_project_files(f, cwd)

        header(f, "package.json pins + key deps")
        show_pkg_pins_and_deps(f, cwd)

        header(f, "Installed versions (npm ls) – kräver node_modules")
        # This can be slow / error if node_modules missing, but it's useful.
        try_run(
            f,
            "npm ls (selected) depth=0",
            ["npm", "ls", "next", "react", "react-dom", "typescript", "@types/node",
             "eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin", "--depth=0"],
            cwd
        )

        header(f, "tsconfig quick peek")
        tsconfig_quick_peek(f, cwd)

        header(f, "Done")
        log(f, f"Rapport sparad: {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
