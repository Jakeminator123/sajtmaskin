#!/usr/bin/env python3
"""
Desktop GUI dashboard for Cursor GPT automation kit.

Features:
- start/stop zero-touch runs
- select browser runtime (playwright or cursor-manual)
- stream logs live
- send stdin input to running process (for login OK / manual paste)
- archive previous run session automatically
- optional baseline artifact archive before a new run
- config editor for config.browser.txt and config.txt
- archive browser for old run logs
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk
from datetime import datetime, timezone


TOOLKIT_ROOT = Path(__file__).resolve().parent.parent
MANAGER_PATH = TOOLKIT_ROOT / "automation" / "kit_manager.py"

DASH_STATE_ROOT = TOOLKIT_ROOT / "automation" / "state" / "ui-dashboard"
CURRENT_RUN_DIR = DASH_STATE_ROOT / "current"
ARCHIVE_RUN_DIR = DASH_STATE_ROOT / "archive"
UI_SETTINGS_PATH = DASH_STATE_ROOT / "ui-settings.json"

CONFIG_BROWSER_PATH = TOOLKIT_ROOT / "config.browser.txt"
CONFIG_CORE_PATH = TOOLKIT_ROOT / "config.txt"


def now_utc_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def now_local_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def parse_kv_config(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def load_config_values(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return parse_kv_config(path.read_text(encoding="utf-8"))


def set_or_add_config_key(path: Path, key: str, value: str) -> None:
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    pattern = re.compile(rf"(?m)^{re.escape(key)}=.*$")
    replacement = f"{key}={value}"
    if pattern.search(current):
        updated = pattern.sub(replacement, current)
    else:
        updated = current
        if updated and not updated.endswith("\n"):
            updated += "\n"
        updated += replacement + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated, encoding="utf-8")


def delete_config_key(path: Path, key: str) -> None:
    if not path.exists():
        return
    current = path.read_text(encoding="utf-8")
    pattern = re.compile(rf"(?m)^{re.escape(key)}=.*\n?")
    updated = pattern.sub("", current)
    path.write_text(updated, encoding="utf-8")


def open_in_file_explorer(path: Path) -> None:
    if os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
        return
    if sys.platform == "darwin":
        subprocess.run(["open", str(path)], check=False)
        return
    subprocess.run(["xdg-open", str(path)], check=False)


class KitDashboard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Cursor GPT Automation Dashboard")
        self.geometry("1300x860")
        self.minsize(1180, 760)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._setup_style()

        self.process: subprocess.Popen[str] | None = None
        self.process_reader_thread: threading.Thread | None = None
        self.process_log_queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self.current_log_file: Path | None = None
        self.current_meta_file: Path | None = None

        self.repo_path_var = tk.StringVar(value="")
        self.repo_name_var = tk.StringVar(value="")
        self.iteration_start_var = tk.StringVar(value="1")
        self.iteration_count_var = tk.StringVar(value="1")
        self.runtime_mode_var = tk.StringVar(value="playwright")
        self.generate_prompt_var = tk.BooleanVar(value=True)
        self.recover_flags_var = tk.BooleanVar(value=True)
        self.run_agent_flow_var = tk.BooleanVar(value=False)
        self.agent_skip_quality_var = tk.BooleanVar(value=False)
        self.agent_skip_release_var = tk.BooleanVar(value=False)
        self.create_snapshots_var = tk.BooleanVar(value=False)
        self.snapshot_branch_prefix_var = tk.StringVar(value="automation-iteration")
        self.snapshot_commit_prefix_var = tk.StringVar(value="commit-iteration")
        self.archive_baseline_var = tk.BooleanVar(value=True)

        self.install_force_overwrite_var = tk.BooleanVar(value=False)
        self.install_playwright_var = tk.BooleanVar(value=False)
        self.uninstall_force_remove_modified_var = tk.BooleanVar(value=False)

        self.status_var = tk.StringVar(value="Idle")
        self.stdin_default_var = tk.StringVar(value="OK")

        self.config_target_var = tk.StringVar(value="config.browser.txt")
        self.config_key_var = tk.StringVar(value="")
        self.config_value_var = tk.StringVar(value="")

        self._build_ui()
        self._load_ui_settings()
        self._refresh_archive_list()
        self._refresh_config_table()
        self._set_status("Idle")
        self.after(200, self._maybe_run_first_time_wizard)

    def _setup_style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Header.TLabel", font=("Segoe UI", 11, "bold"))
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"))
        style.configure("Secondary.TButton", font=("Segoe UI", 9))

    def _build_ui(self) -> None:
        main = ttk.Frame(self, padding=10)
        main.pack(fill=tk.BOTH, expand=True)

        notebook = ttk.Notebook(main)
        notebook.pack(fill=tk.BOTH, expand=True)

        run_tab = ttk.Frame(notebook, padding=10)
        config_tab = ttk.Frame(notebook, padding=10)
        archives_tab = ttk.Frame(notebook, padding=10)

        notebook.add(run_tab, text="Run")
        notebook.add(config_tab, text="Config")
        notebook.add(archives_tab, text="Archives")

        self._build_run_tab(run_tab)
        self._build_config_tab(config_tab)
        self._build_archives_tab(archives_tab)

    def _build_run_tab(self, parent: ttk.Frame) -> None:
        top = ttk.Frame(parent)
        top.pack(fill=tk.X)

        settings_frame = ttk.LabelFrame(top, text="Zero-Touch Settings", padding=10)
        settings_frame.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))

        ops_frame = ttk.LabelFrame(top, text="Operations", padding=10)
        ops_frame.pack(side=tk.LEFT, fill=tk.Y)

        ttk.Label(settings_frame, text="Target repo path", style="Header.TLabel").grid(row=0, column=0, sticky="w")
        repo_entry = ttk.Entry(settings_frame, textvariable=self.repo_path_var, width=68)
        repo_entry.grid(row=1, column=0, columnspan=4, sticky="we", padx=(0, 6), pady=(0, 8))
        ttk.Button(settings_frame, text="Browse", command=self._browse_repo_path).grid(row=1, column=4, sticky="e")

        ttk.Label(settings_frame, text="Repo name override").grid(row=2, column=0, sticky="w")
        ttk.Entry(settings_frame, textvariable=self.repo_name_var, width=26).grid(row=3, column=0, sticky="w", pady=(0, 8))

        ttk.Label(settings_frame, text="Iteration start").grid(row=2, column=1, sticky="w")
        ttk.Entry(settings_frame, textvariable=self.iteration_start_var, width=10).grid(row=3, column=1, sticky="w", pady=(0, 8))

        ttk.Label(settings_frame, text="Iteration count").grid(row=2, column=2, sticky="w")
        ttk.Entry(settings_frame, textvariable=self.iteration_count_var, width=10).grid(row=3, column=2, sticky="w", pady=(0, 8))

        ttk.Label(settings_frame, text="Browser runtime").grid(row=2, column=3, sticky="w")
        runtime_combo = ttk.Combobox(
            settings_frame,
            textvariable=self.runtime_mode_var,
            values=["playwright", "cursor-manual"],
            state="readonly",
            width=20,
        )
        runtime_combo.grid(row=3, column=3, sticky="w", pady=(0, 8))

        ttk.Checkbutton(
            settings_frame,
            text="Generate prompt before each iteration",
            variable=self.generate_prompt_var,
        ).grid(row=4, column=0, columnspan=2, sticky="w")

        ttk.Checkbutton(
            settings_frame,
            text="Recover stale run-flags automatically",
            variable=self.recover_flags_var,
        ).grid(row=4, column=2, columnspan=2, sticky="w")

        ttk.Checkbutton(
            settings_frame,
            text="Create git snapshot branch+commit each iteration",
            variable=self.create_snapshots_var,
        ).grid(row=5, column=0, columnspan=3, sticky="w", pady=(4, 0))

        ttk.Checkbutton(
            settings_frame,
            text="Archive baseline artifacts before each run",
            variable=self.archive_baseline_var,
        ).grid(row=5, column=3, columnspan=2, sticky="w", pady=(4, 0))

        ttk.Checkbutton(
            settings_frame,
            text="Run full agent implementation flow after browser capture",
            variable=self.run_agent_flow_var,
        ).grid(row=6, column=0, columnspan=3, sticky="w", pady=(4, 0))

        ttk.Checkbutton(
            settings_frame,
            text="Agent flow: skip lint/build/test quality gates",
            variable=self.agent_skip_quality_var,
        ).grid(row=6, column=3, columnspan=2, sticky="w", pady=(4, 0))

        ttk.Checkbutton(
            settings_frame,
            text="Agent flow: skip release publish",
            variable=self.agent_skip_release_var,
        ).grid(row=7, column=0, columnspan=3, sticky="w", pady=(2, 0))

        ttk.Label(settings_frame, text="Snapshot branch prefix").grid(row=8, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(settings_frame, textvariable=self.snapshot_branch_prefix_var, width=24).grid(
            row=9, column=0, sticky="w"
        )

        ttk.Label(settings_frame, text="Snapshot commit prefix").grid(row=8, column=1, sticky="w", pady=(8, 0))
        ttk.Entry(settings_frame, textvariable=self.snapshot_commit_prefix_var, width=24).grid(
            row=9, column=1, sticky="w"
        )

        ttk.Button(
            settings_frame,
            text="Start Run",
            style="Primary.TButton",
            command=self._start_zero_touch,
        ).grid(row=9, column=3, sticky="e", padx=(8, 4))

        ttk.Button(
            settings_frame,
            text="Stop Active",
            style="Secondary.TButton",
            command=self._stop_active_process,
        ).grid(row=9, column=4, sticky="e")

        for c in range(5):
            settings_frame.columnconfigure(c, weight=1)

        ttk.Button(ops_frame, text="Install Kit", command=self._run_install, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Quick Setup Wizard", command=self._run_quick_setup_wizard, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Uninstall Kit", command=self._run_uninstall, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Status", command=self._run_status, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Flags Status", command=self._run_flags_status, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Clear Flags", command=self._run_flags_clear, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Archive Current Now", command=self._archive_current_now, style="Secondary.TButton").pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(ops_frame, text="Open Current Run Folder", command=self._open_current_run_folder, style="Secondary.TButton").pack(
            fill=tk.X
        )

        input_frame = ttk.LabelFrame(parent, text="Input To Running Process", padding=10)
        input_frame.pack(fill=tk.X, pady=(10, 8))

        ttk.Label(
            input_frame,
            text=(
                "Use this to send 'OK' for login checkpoint or paste manual report text for cursor-manual mode."
            ),
        ).pack(anchor="w")

        input_controls = ttk.Frame(input_frame)
        input_controls.pack(fill=tk.X, pady=(6, 0))

        ttk.Label(input_controls, text="Quick text").pack(side=tk.LEFT)
        ttk.Entry(input_controls, textvariable=self.stdin_default_var, width=40).pack(side=tk.LEFT, padx=(6, 6))
        ttk.Button(input_controls, text="Send Quick Line", command=self._send_quick_line).pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(input_controls, text="Send EOF", command=self._send_eof_line).pack(side=tk.LEFT)

        self.stdin_text = tk.Text(input_frame, height=5, wrap=tk.WORD)
        self.stdin_text.pack(fill=tk.X, pady=(6, 6))

        stdin_buttons = ttk.Frame(input_frame)
        stdin_buttons.pack(fill=tk.X)
        ttk.Button(stdin_buttons, text="Send Text", command=self._send_multiline_text).pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(stdin_buttons, text="Send Text + EOF", command=self._send_multiline_text_with_eof).pack(side=tk.LEFT)

        log_frame = ttk.LabelFrame(parent, text="Live Logs", padding=8)
        log_frame.pack(fill=tk.BOTH, expand=True)

        log_toolbar = ttk.Frame(log_frame)
        log_toolbar.pack(fill=tk.X, pady=(0, 6))
        ttk.Button(log_toolbar, text="Clear Log View", command=self._clear_log_view).pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(log_toolbar, text="Open Archive Folder", command=self._open_archive_folder).pack(side=tk.LEFT)

        self.log_text = tk.Text(log_frame, wrap=tk.NONE, height=20)
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        y_scroll = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log_text.yview)
        y_scroll.pack(side=tk.LEFT, fill=tk.Y)
        x_scroll = ttk.Scrollbar(parent, orient=tk.HORIZONTAL, command=self.log_text.xview)
        x_scroll.pack(fill=tk.X)
        self.log_text.configure(yscrollcommand=y_scroll.set, xscrollcommand=x_scroll.set)

        status_bar = ttk.Frame(parent)
        status_bar.pack(fill=tk.X, pady=(6, 0))
        ttk.Label(status_bar, text="Status:", style="Header.TLabel").pack(side=tk.LEFT)
        ttk.Label(status_bar, textvariable=self.status_var).pack(side=tk.LEFT, padx=(8, 0))

    def _build_config_tab(self, parent: ttk.Frame) -> None:
        top = ttk.Frame(parent)
        top.pack(fill=tk.X)

        ttk.Label(top, text="Config file", style="Header.TLabel").pack(side=tk.LEFT)
        config_combo = ttk.Combobox(
            top,
            textvariable=self.config_target_var,
            values=["config.browser.txt", "config.txt"],
            state="readonly",
            width=28,
        )
        config_combo.pack(side=tk.LEFT, padx=(8, 8))
        config_combo.bind("<<ComboboxSelected>>", lambda _: self._refresh_config_table())

        ttk.Button(top, text="Refresh", command=self._refresh_config_table).pack(side=tk.LEFT)

        table_frame = ttk.Frame(parent)
        table_frame.pack(fill=tk.BOTH, expand=True, pady=(8, 8))

        self.config_tree = ttk.Treeview(
            table_frame,
            columns=("key", "value"),
            show="headings",
            height=18,
        )
        self.config_tree.heading("key", text="Key")
        self.config_tree.heading("value", text="Value")
        self.config_tree.column("key", width=320, anchor="w")
        self.config_tree.column("value", width=760, anchor="w")
        self.config_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.config_tree.bind("<<TreeviewSelect>>", self._on_config_tree_select)

        config_scroll = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self.config_tree.yview)
        config_scroll.pack(side=tk.LEFT, fill=tk.Y)
        self.config_tree.configure(yscrollcommand=config_scroll.set)

        edit = ttk.LabelFrame(parent, text="Edit Setting", padding=8)
        edit.pack(fill=tk.X)

        ttk.Label(edit, text="Key").grid(row=0, column=0, sticky="w")
        ttk.Entry(edit, textvariable=self.config_key_var, width=36).grid(row=1, column=0, sticky="w", padx=(0, 8))

        ttk.Label(edit, text="Value").grid(row=0, column=1, sticky="w")
        ttk.Entry(edit, textvariable=self.config_value_var, width=80).grid(row=1, column=1, sticky="we", padx=(0, 8))

        ttk.Button(edit, text="Save/Update", command=self._save_config_entry).grid(row=1, column=2, padx=(0, 6))
        ttk.Button(edit, text="Delete", command=self._delete_config_entry).grid(row=1, column=3)
        edit.columnconfigure(1, weight=1)

    def _build_archives_tab(self, parent: ttk.Frame) -> None:
        toolbar = ttk.Frame(parent)
        toolbar.pack(fill=tk.X, pady=(0, 8))
        ttk.Button(toolbar, text="Refresh", command=self._refresh_archive_list).pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(toolbar, text="Open Selected Folder", command=self._open_selected_archive).pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(toolbar, text="Load Selected Log", command=self._load_selected_archive_log).pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(toolbar, text="Open Archive Root", command=self._open_archive_folder).pack(side=tk.LEFT)

        split = ttk.Panedwindow(parent, orient=tk.HORIZONTAL)
        split.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(split)
        right = ttk.Frame(split)
        split.add(left, weight=1)
        split.add(right, weight=3)

        ttk.Label(left, text="Archived sessions", style="Header.TLabel").pack(anchor="w")
        self.archive_listbox = tk.Listbox(left, height=24)
        self.archive_listbox.pack(fill=tk.BOTH, expand=True, pady=(6, 0))

        ttk.Label(right, text="Archive log preview", style="Header.TLabel").pack(anchor="w")
        self.archive_preview_text = tk.Text(right, wrap=tk.NONE)
        self.archive_preview_text.pack(fill=tk.BOTH, expand=True, pady=(6, 0))

    def _set_status(self, value: str) -> None:
        self.status_var.set(value)

    def _append_log(self, text: str) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {text}"
        self.log_text.insert(tk.END, line + "\n")
        self.log_text.see(tk.END)
        if self.current_log_file:
            with self.current_log_file.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")

    def _get_python_cmd(self) -> list[str]:
        return [sys.executable, str(MANAGER_PATH)]

    def _ensure_repo_path(self) -> Path:
        raw = self.repo_path_var.get().strip()
        if not raw:
            raise RuntimeError("Target repo path is required.")
        repo_path = Path(raw).expanduser()
        if not repo_path.is_absolute():
            repo_path = (Path.cwd() / repo_path).resolve()
        if not repo_path.exists():
            raise RuntimeError(f"Repo path does not exist: {repo_path}")
        return repo_path

    def _selected_config_path(self) -> Path:
        key = self.config_target_var.get().strip()
        if key == "config.txt":
            return CONFIG_CORE_PATH
        return CONFIG_BROWSER_PATH

    def _browse_repo_path(self) -> None:
        selected = filedialog.askdirectory(initialdir=str(Path.home()))
        if selected:
            self.repo_path_var.set(selected)
            if not self.repo_name_var.get().strip():
                self.repo_name_var.set(Path(selected).name)
            self._save_ui_settings()

    def _run_quick_setup_wizard(self) -> None:
        selected = filedialog.askdirectory(
            title="Select target git repository",
            initialdir=self.repo_path_var.get().strip() or str(Path.home()),
        )
        if not selected:
            return

        repo_path = Path(selected)
        if not (repo_path / ".git").exists():
            messagebox.showerror("Invalid repo", f"Selected folder is not a git repo:\n{repo_path}")
            return

        runtime_choice = simpledialog.askstring(
            "Runtime mode",
            "Enter runtime mode: 'cursor-manual' or 'playwright'",
            initialvalue=self.runtime_mode_var.get().strip() or "cursor-manual",
            parent=self,
        )
        if runtime_choice is None:
            return
        runtime_value = runtime_choice.strip().lower()
        if runtime_value not in {"cursor-manual", "playwright"}:
            messagebox.showerror("Invalid runtime", "Runtime must be 'cursor-manual' or 'playwright'.")
            return

        full_pipeline = messagebox.askyesno(
            "Full pipeline",
            "Enable full pipeline by default?\n\nThis runs browser capture and then run-iterations automatically.",
        )

        self.repo_path_var.set(str(repo_path))
        self.repo_name_var.set(repo_path.name)
        self.runtime_mode_var.set(runtime_value)
        self.iteration_start_var.set("1")
        self.iteration_count_var.set("1")
        self.generate_prompt_var.set(True)
        self.recover_flags_var.set(True)
        self.run_agent_flow_var.set(full_pipeline)
        self.agent_skip_quality_var.set(False)
        self.agent_skip_release_var.set(False)
        self.create_snapshots_var.set(False)
        self.archive_baseline_var.set(True)
        self._save_ui_settings()

        messagebox.showinfo(
            "Setup completed",
            (
                f"Configured repo:\n{repo_path}\n\nRuntime: {runtime_value}"
                f"\nFull pipeline: {'enabled' if full_pipeline else 'disabled'}"
                "\n\nYou can now click Start Run."
                "\n(Full pipeline requires automation/run-iterations.ps1 in target repo.)"
            ),
        )

    def _maybe_run_first_time_wizard(self) -> None:
        if self.repo_path_var.get().strip():
            return
        if not messagebox.askyesno(
            "Quick setup",
            "No target repo is configured yet.\n\nRun the quick setup wizard now?",
        ):
            return
        self._run_quick_setup_wizard()

    def _load_ui_settings(self) -> None:
        if not UI_SETTINGS_PATH.exists():
            return
        try:
            data = json.loads(UI_SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception:
            return
        self.repo_path_var.set(str(data.get("repo_path", "")))
        self.repo_name_var.set(str(data.get("repo_name", "")))
        self.iteration_start_var.set(str(data.get("iteration_start", "1")))
        self.iteration_count_var.set(str(data.get("iteration_count", "1")))
        self.runtime_mode_var.set(str(data.get("runtime_mode", "playwright")))
        self.generate_prompt_var.set(bool(data.get("generate_prompt", True)))
        self.recover_flags_var.set(bool(data.get("recover_flags", True)))
        self.run_agent_flow_var.set(bool(data.get("run_agent_flow", False)))
        self.agent_skip_quality_var.set(bool(data.get("agent_skip_quality", False)))
        self.agent_skip_release_var.set(bool(data.get("agent_skip_release", False)))
        self.create_snapshots_var.set(bool(data.get("create_snapshots", False)))
        self.snapshot_branch_prefix_var.set(str(data.get("snapshot_branch_prefix", "automation-iteration")))
        self.snapshot_commit_prefix_var.set(str(data.get("snapshot_commit_prefix", "commit-iteration")))
        self.archive_baseline_var.set(bool(data.get("archive_baseline", True)))
        self.install_force_overwrite_var.set(bool(data.get("install_force_overwrite", False)))
        self.install_playwright_var.set(bool(data.get("install_playwright", False)))
        self.uninstall_force_remove_modified_var.set(bool(data.get("uninstall_force_remove_modified", False)))

    def _save_ui_settings(self) -> None:
        data = {
            "repo_path": self.repo_path_var.get().strip(),
            "repo_name": self.repo_name_var.get().strip(),
            "iteration_start": self.iteration_start_var.get().strip(),
            "iteration_count": self.iteration_count_var.get().strip(),
            "runtime_mode": self.runtime_mode_var.get().strip(),
            "generate_prompt": self.generate_prompt_var.get(),
            "recover_flags": self.recover_flags_var.get(),
            "run_agent_flow": self.run_agent_flow_var.get(),
            "agent_skip_quality": self.agent_skip_quality_var.get(),
            "agent_skip_release": self.agent_skip_release_var.get(),
            "create_snapshots": self.create_snapshots_var.get(),
            "snapshot_branch_prefix": self.snapshot_branch_prefix_var.get().strip(),
            "snapshot_commit_prefix": self.snapshot_commit_prefix_var.get().strip(),
            "archive_baseline": self.archive_baseline_var.get(),
            "install_force_overwrite": self.install_force_overwrite_var.get(),
            "install_playwright": self.install_playwright_var.get(),
            "uninstall_force_remove_modified": self.uninstall_force_remove_modified_var.get(),
        }
        UI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        UI_SETTINGS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _has_running_process(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def _rollover_current_run(self) -> None:
        CURRENT_RUN_DIR.mkdir(parents=True, exist_ok=True)
        has_contents = any(CURRENT_RUN_DIR.iterdir())
        if not has_contents:
            return
        ARCHIVE_RUN_DIR.mkdir(parents=True, exist_ok=True)
        archive_target = ARCHIVE_RUN_DIR / f"run-{now_local_stamp()}"
        suffix = 1
        while archive_target.exists():
            suffix += 1
            archive_target = ARCHIVE_RUN_DIR / f"run-{now_local_stamp()}-{suffix}"
        shutil.move(str(CURRENT_RUN_DIR), str(archive_target))
        CURRENT_RUN_DIR.mkdir(parents=True, exist_ok=True)

    def _archive_baseline_artifacts(self, destination_root: Path) -> None:
        artifacts_root = destination_root / "artifacts-baseline"
        artifacts_root.mkdir(parents=True, exist_ok=True)
        sources = [
            TOOLKIT_ROOT / "automation" / "reports",
            TOOLKIT_ROOT / "automation" / "state" / "run-state.json",
            TOOLKIT_ROOT / "automation" / "inbox",
            TOOLKIT_ROOT / "config.browser.txt",
            TOOLKIT_ROOT / "config.txt",
        ]
        for src in sources:
            if not src.exists():
                continue
            target = artifacts_root / src.relative_to(TOOLKIT_ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                shutil.copytree(src, target, dirs_exist_ok=True)
            else:
                shutil.copy2(src, target)

    def _prepare_new_run_session(self, title: str, cmd: list[str], *, archive_baseline: bool) -> None:
        self._rollover_current_run()
        CURRENT_RUN_DIR.mkdir(parents=True, exist_ok=True)

        if archive_baseline:
            self._archive_baseline_artifacts(CURRENT_RUN_DIR)

        self.current_log_file = CURRENT_RUN_DIR / "run.log"
        self.current_meta_file = CURRENT_RUN_DIR / "session.json"
        meta = {
            "title": title,
            "command": cmd,
            "started_at_utc": now_utc_iso(),
            "pid": None,
        }
        self.current_meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        self._refresh_archive_list()

    def _update_session_metadata(self, updates: dict) -> None:
        if not self.current_meta_file:
            return
        data = {}
        if self.current_meta_file.exists():
            try:
                data = json.loads(self.current_meta_file.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        data.update(updates)
        self.current_meta_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _start_command(self, title: str, cmd: list[str], *, archive_baseline: bool = False) -> None:
        if self._has_running_process():
            messagebox.showwarning("Process already running", "Stop the active process before starting a new one.")
            return

        self._save_ui_settings()
        self._prepare_new_run_session(title, cmd, archive_baseline=archive_baseline)
        self._append_log(f"[dashboard] Starting: {' '.join(cmd)}")

        creation_flags = 0
        if os.name == "nt":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]

        self.process = subprocess.Popen(
            cmd,
            cwd=str(TOOLKIT_ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=creation_flags,
        )
        self._update_session_metadata({"pid": self.process.pid})
        self._set_status(f"Running: {title}")

        def reader_worker() -> None:
            assert self.process is not None
            assert self.process.stdout is not None
            for line in self.process.stdout:
                self.process_log_queue.put(("line", line.rstrip("\n")))
            self.process_log_queue.put(("done", ""))

        self.process_reader_thread = threading.Thread(target=reader_worker, daemon=True)
        self.process_reader_thread.start()
        self.after(120, self._drain_process_log_queue)

    def _drain_process_log_queue(self) -> None:
        had_item = False
        while True:
            try:
                kind, payload = self.process_log_queue.get_nowait()
            except queue.Empty:
                break
            had_item = True
            if kind == "line":
                self._append_log(payload)
                continue
            if kind == "done":
                return_code = self.process.poll() if self.process else None
                self._append_log(f"[dashboard] Process finished with code: {return_code}")
                self._set_status(f"Idle (last exit: {return_code})")
                self._update_session_metadata(
                    {
                        "ended_at_utc": now_utc_iso(),
                        "exit_code": return_code,
                    }
                )
                self.process = None
                self._refresh_archive_list()

        if self._has_running_process() or had_item:
            self.after(120, self._drain_process_log_queue)

    def _stop_active_process(self) -> None:
        if not self._has_running_process():
            messagebox.showinfo("No active process", "There is no running process.")
            return
        assert self.process is not None
        self._append_log("[dashboard] Stop requested.")
        try:
            if os.name == "nt":
                self.process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                self.process.terminate()
        except Exception:
            self.process.terminate()
        self.after(4000, self._force_kill_if_still_running)

    def _force_kill_if_still_running(self) -> None:
        if not self._has_running_process():
            return
        assert self.process is not None
        self._append_log("[dashboard] Force kill.")
        self.process.kill()

    def _send_to_process(self, text: str) -> None:
        if not self._has_running_process():
            messagebox.showinfo("No active process", "There is no running process to send input to.")
            return
        assert self.process is not None
        assert self.process.stdin is not None
        self.process.stdin.write(text)
        self.process.stdin.flush()
        self._append_log(f"[dashboard] Sent {len(text)} chars to stdin.")

    def _send_quick_line(self) -> None:
        payload = self.stdin_default_var.get().strip()
        if not payload:
            payload = "OK"
        self._send_to_process(payload + "\n")

    def _send_eof_line(self) -> None:
        self._send_to_process("EOF\n")

    def _send_multiline_text(self) -> None:
        payload = self.stdin_text.get("1.0", tk.END).rstrip("\n")
        if not payload.strip():
            messagebox.showwarning("Empty input", "Input box is empty.")
            return
        self._send_to_process(payload + "\n")

    def _send_multiline_text_with_eof(self) -> None:
        payload = self.stdin_text.get("1.0", tk.END).rstrip("\n")
        if not payload.strip():
            messagebox.showwarning("Empty input", "Input box is empty.")
            return
        self._send_to_process(payload + "\nEOF\n")

    def _clear_log_view(self) -> None:
        self.log_text.delete("1.0", tk.END)

    def _build_zero_touch_cmd(self) -> list[str]:
        repo_path = self._ensure_repo_path()
        try:
            iteration_start = int(self.iteration_start_var.get().strip())
            iteration_count = int(self.iteration_count_var.get().strip())
        except ValueError as exc:
            raise RuntimeError("Iteration start/count must be integers.") from exc
        if iteration_start < 1 or iteration_count < 1:
            raise RuntimeError("Iteration start/count must be >= 1.")

        cmd = self._get_python_cmd() + [
            "zero-touch",
            "--target",
            str(repo_path),
            "--iteration-start",
            str(iteration_start),
            "--iteration-count",
            str(iteration_count),
            "--runtime",
            self.runtime_mode_var.get().strip(),
        ]

        repo_name = self.repo_name_var.get().strip()
        if repo_name:
            cmd.extend(["--repo-name", repo_name])

        if not self.generate_prompt_var.get():
            cmd.append("--skip-generate-prompt")

        if self.recover_flags_var.get():
            cmd.append("--recover-stale-flags")

        if self.run_agent_flow_var.get():
            cmd.append("--run-agent-flow")
            if self.agent_skip_quality_var.get():
                cmd.append("--agent-skip-quality-gates")
            if self.agent_skip_release_var.get():
                cmd.append("--agent-skip-release")
            if self.create_snapshots_var.get():
                raise RuntimeError("Disable git snapshots when full agent flow is enabled.")

        if self.create_snapshots_var.get():
            cmd.append("--create-git-snapshots")
            branch_prefix = self.snapshot_branch_prefix_var.get().strip() or "automation-iteration"
            commit_prefix = self.snapshot_commit_prefix_var.get().strip() or "commit-iteration"
            cmd.extend(["--snapshot-branch-prefix", branch_prefix])
            cmd.extend(["--snapshot-commit-prefix", commit_prefix])

        return cmd

    def _start_zero_touch(self) -> None:
        try:
            cmd = self._build_zero_touch_cmd()
        except Exception as exc:
            messagebox.showerror("Invalid run settings", str(exc))
            return
        self._start_command("zero-touch", cmd, archive_baseline=self.archive_baseline_var.get())

    def _run_install(self) -> None:
        try:
            repo_path = self._ensure_repo_path()
        except Exception as exc:
            messagebox.showerror("Invalid repo path", str(exc))
            return

        force = messagebox.askyesno("Install option", "Allow overwrite of existing files?")
        install_playwright = messagebox.askyesno(
            "Install option",
            "Install playwright in target repo?\n(This modifies package.json/package-lock.json in target repo)",
        )

        cmd = self._get_python_cmd() + ["install", "--target", str(repo_path)]
        if force:
            cmd.append("--force-overwrite")
        if install_playwright:
            cmd.append("--install-playwright")
        self._start_command("install", cmd)

    def _run_uninstall(self) -> None:
        try:
            repo_path = self._ensure_repo_path()
        except Exception as exc:
            messagebox.showerror("Invalid repo path", str(exc))
            return

        force_remove = messagebox.askyesno(
            "Uninstall option",
            "Force-remove files modified after install?",
        )

        cmd = self._get_python_cmd() + ["uninstall", "--target", str(repo_path)]
        if force_remove:
            cmd.append("--force-remove-modified")
        self._start_command("uninstall", cmd)

    def _run_status(self) -> None:
        try:
            repo_path = self._ensure_repo_path()
        except Exception as exc:
            messagebox.showerror("Invalid repo path", str(exc))
            return
        cmd = self._get_python_cmd() + ["status", "--target", str(repo_path)]
        self._start_command("status", cmd)

    def _run_flags_status(self) -> None:
        cmd = self._get_python_cmd() + ["flags-status"]
        self._start_command("flags-status", cmd)

    def _run_flags_clear(self) -> None:
        if not messagebox.askyesno("Clear flags", "Clear local and global run-flags now?"):
            return
        cmd = self._get_python_cmd() + ["flags-clear"]
        self._start_command("flags-clear", cmd)

    def _archive_current_now(self) -> None:
        if self._has_running_process():
            messagebox.showwarning("Process running", "Stop the active process before archiving current run.")
            return
        self._rollover_current_run()
        self._append_log("[dashboard] Current run data archived.")
        self._refresh_archive_list()

    def _open_current_run_folder(self) -> None:
        CURRENT_RUN_DIR.mkdir(parents=True, exist_ok=True)
        open_in_file_explorer(CURRENT_RUN_DIR)

    def _open_archive_folder(self) -> None:
        ARCHIVE_RUN_DIR.mkdir(parents=True, exist_ok=True)
        open_in_file_explorer(ARCHIVE_RUN_DIR)

    def _refresh_config_table(self) -> None:
        for item in self.config_tree.get_children():
            self.config_tree.delete(item)
        values = load_config_values(self._selected_config_path())
        for key in sorted(values.keys(), key=str.lower):
            self.config_tree.insert("", tk.END, values=(key, values[key]))

    def _on_config_tree_select(self, _: object) -> None:
        selected = self.config_tree.selection()
        if not selected:
            return
        item = self.config_tree.item(selected[0], "values")
        if len(item) != 2:
            return
        self.config_key_var.set(str(item[0]))
        self.config_value_var.set(str(item[1]))

    def _save_config_entry(self) -> None:
        key = self.config_key_var.get().strip()
        value = self.config_value_var.get().strip()
        if not key:
            messagebox.showwarning("Missing key", "Config key is required.")
            return
        set_or_add_config_key(self._selected_config_path(), key, value)
        self._refresh_config_table()
        self._append_log(f"[dashboard] Config updated: {key}")

    def _delete_config_entry(self) -> None:
        key = self.config_key_var.get().strip()
        if not key:
            messagebox.showwarning("Missing key", "Config key is required.")
            return
        if not messagebox.askyesno("Delete setting", f"Delete '{key}' from config file?"):
            return
        delete_config_key(self._selected_config_path(), key)
        self._refresh_config_table()
        self._append_log(f"[dashboard] Config deleted: {key}")

    def _refresh_archive_list(self) -> None:
        self.archive_listbox.delete(0, tk.END)
        ARCHIVE_RUN_DIR.mkdir(parents=True, exist_ok=True)
        entries = sorted(
            [p for p in ARCHIVE_RUN_DIR.iterdir() if p.is_dir()],
            key=lambda p: p.name,
            reverse=True,
        )
        for entry in entries:
            self.archive_listbox.insert(tk.END, entry.name)

    def _selected_archive_path(self) -> Path | None:
        selected = self.archive_listbox.curselection()
        if not selected:
            return None
        name = self.archive_listbox.get(selected[0])
        return ARCHIVE_RUN_DIR / name

    def _open_selected_archive(self) -> None:
        selected = self._selected_archive_path()
        if not selected:
            messagebox.showinfo("No selection", "Select an archive run first.")
            return
        open_in_file_explorer(selected)

    def _load_selected_archive_log(self) -> None:
        selected = self._selected_archive_path()
        if not selected:
            messagebox.showinfo("No selection", "Select an archive run first.")
            return
        log_path = selected / "run.log"
        if not log_path.exists():
            self.archive_preview_text.delete("1.0", tk.END)
            self.archive_preview_text.insert(tk.END, "No run.log found in selected archive.")
            return
        self.archive_preview_text.delete("1.0", tk.END)
        self.archive_preview_text.insert(tk.END, log_path.read_text(encoding="utf-8"))

    def _on_close(self) -> None:
        if self._has_running_process():
            if not messagebox.askyesno("Process running", "A process is running. Stop it and close dashboard?"):
                return
            self._stop_active_process()
        self.destroy()


def main() -> int:
    if not MANAGER_PATH.exists():
        print(f"Missing manager script: {MANAGER_PATH}", file=sys.stderr)
        return 1
    app = KitDashboard()
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
