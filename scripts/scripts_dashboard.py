#!/usr/bin/env python3
"""
Scripts dashboard for manual pipeline operations.

Opens a Tkinter GUI where you can run script commands one-by-one, in checked
sequence, or with predefined "run all" presets.
"""

from __future__ import annotations

import os
import queue
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

import tkinter as tk
from tkinter import messagebox, ttk
from tkinter.scrolledtext import ScrolledText


REPO_ROOT = Path(__file__).resolve().parent.parent
NPM_CMD = "npm.cmd" if os.name == "nt" else "npm"
PYTHON_CMD = sys.executable


@dataclass(frozen=True)
class CommandSpec:
    id: str
    label: str
    command: tuple[str, ...]
    group: str
    description: str
    risky: bool = False


COMMANDS: list[CommandSpec] = [
    CommandSpec(
        id="artifacts_rebuild_safe",
        label="Artifacts: smart rebuild (reuse cache)",
        command=(PYTHON_CMD, "scripts/rebuild_artifacts.py", "--with-eval", "--with-typecheck"),
        group="Artifacts",
        description="Purge generated outputs, reuse scrape/repo cache, rebuild and validate everything.",
        risky=True,
    ),
    CommandSpec(
        id="artifacts_rebuild_full",
        label="Artifacts: smart rebuild (full scrape)",
        command=(
            PYTHON_CMD,
            "scripts/rebuild_artifacts.py",
            "--refresh-scrape",
            "--with-eval",
            "--with-typecheck",
        ),
        group="Artifacts",
        description="Purge generated outputs, refresh scrape-cache, rebuild and validate everything.",
        risky=True,
    ),
    CommandSpec(
        id="scaffolds_status",
        label="Scaffolds: status",
        command=(NPM_CMD, "run", "scaffolds:status"),
        group="Scaffolds",
        description="Read-only status for scaffold pipeline artifacts.",
    ),
    CommandSpec(
        id="scaffolds_import",
        label="Scaffolds: import",
        command=(NPM_CMD, "run", "scaffolds:import"),
        group="Scaffolds",
        description="Import discovery into canonical raw-discovery root.",
        risky=True,
    ),
    CommandSpec(
        id="scaffolds_hydrate",
        label="Scaffolds: hydrate",
        command=(NPM_CMD, "run", "scaffolds:hydrate"),
        group="Scaffolds",
        description="Hydrate repo cache from canonical raw-discovery.",
        risky=True,
    ),
    CommandSpec(
        id="scaffolds_build",
        label="Scaffolds: build",
        command=(NPM_CMD, "run", "scaffolds:build"),
        group="Scaffolds",
        description="Build template-library + scaffold research artifacts.",
        risky=True,
    ),
    CommandSpec(
        id="scaffolds_embeddings",
        label="Scaffolds: embeddings",
        command=(NPM_CMD, "run", "scaffolds:embeddings"),
        group="Scaffolds",
        description="Generate scaffold embeddings.",
        risky=True,
    ),
    CommandSpec(
        id="scaffolds_eval",
        label="Scaffolds: eval",
        command=(NPM_CMD, "run", "scaffolds:eval"),
        group="Scaffolds",
        description="Run scaffold selection evaluation.",
        risky=True,
    ),
    CommandSpec(
        id="scaffolds_verify",
        label="Scaffolds: verify",
        command=(NPM_CMD, "run", "scaffolds:verify"),
        group="Scaffolds",
        description="Run scaffold validation checks.",
    ),
    CommandSpec(
        id="scaffolds_all",
        label="Scaffolds: all",
        command=(
            PYTHON_CMD,
            "scripts/scaffolds/scaffold_cli.py",
            "all",
            "--include-template-library",
            "--typecheck",
        ),
        group="Scaffolds",
        description="Import + hydrate + build + all embeddings + eval + verify + typecheck.",
        risky=True,
    ),
    CommandSpec(
        id="template_pipeline_refresh_reuse",
        label="Template pipeline: refresh reuse cache",
        command=(
            PYTHON_CMD,
            "scripts/template-library/full_template_refresh.py",
            "--skip-scrape",
        ),
        group="Template Library",
        description="Full external pipeline run without fresh scrape and without interactive prompts.",
        risky=True,
    ),
    CommandSpec(
        id="template_pipeline_refresh_full",
        label="Template pipeline: refresh full scrape",
        command=(
            PYTHON_CMD,
            "scripts/template-library/full_template_refresh.py",
            "--legacy-wide-use-cases",
            "--per-category=999",
        ),
        group="Template Library",
        description="Full external pipeline run including scraper, explicit and non-interactive.",
        risky=True,
    ),
    CommandSpec(
        id="template_library_verify_summary",
        label="Template library: verify summary",
        command=(NPM_CMD, "run", "template-library:verify-summary"),
        group="Template Library",
        description="Verify discovered summary shape and parseability.",
    ),
    CommandSpec(
        id="template_library_validate_runtime",
        label="Template library: validate runtime artifacts",
        command=(NPM_CMD, "run", "template-library:validate-runtime"),
        group="Template Library",
        description="Validate generated runtime JSON artifacts.",
    ),
    CommandSpec(
        id="templates_local_refresh_embeddings",
        label="v0 templates: local refresh + embeddings",
        command=(NPM_CMD, "run", "templates:local:refresh:embeddings"),
        group="v0 Templates",
        description="Rebuild local v0 catalog + template embeddings.",
        risky=True,
    ),
    CommandSpec(
        id="templates_validate",
        label="v0 templates: validate",
        command=(NPM_CMD, "run", "templates:validate"),
        group="v0 Templates",
        description="Validate generated templates.json + categories mapping.",
    ),
    CommandSpec(
        id="eval",
        label="Eval: full suite",
        command=(NPM_CMD, "run", "eval"),
        group="Quality",
        description="Run broader eval suite and scorecards.",
        risky=True,
    ),
    CommandSpec(
        id="typecheck",
        label="Typecheck",
        command=(NPM_CMD, "run", "typecheck"),
        group="Quality",
        description="Run TypeScript typecheck.",
    ),
]


PRESET_SAFE_ALL = [
    "artifacts_rebuild_safe",
]

PRESET_FULL_ALL = [
    "artifacts_rebuild_full",
]


class ScriptsDashboard:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Sajtmaskin Scripts Dashboard")
        self.root.geometry("1360x860")
        self.root.minsize(1200, 760)

        self._command_by_id = {spec.id: spec for spec in COMMANDS}
        self._check_vars: dict[str, tk.BooleanVar] = {}
        self._output_queue: queue.Queue[str] = queue.Queue()
        self._worker_thread: threading.Thread | None = None
        self._active_process: subprocess.Popen[str] | None = None
        self._stop_requested = False

        self._build_layout()
        self._poll_output_queue()

    def _build_layout(self) -> None:
        wrapper = ttk.Frame(self.root, padding=10)
        wrapper.pack(fill=tk.BOTH, expand=True)

        top = ttk.Frame(wrapper)
        top.pack(fill=tk.X, pady=(0, 8))

        title = ttk.Label(
            top,
            text="Scripts Dashboard (manual pipeline control)",
            font=("Segoe UI", 13, "bold"),
        )
        title.pack(anchor=tk.W)

        subtitle = ttk.Label(
            top,
            text=(
                "Kör enstaka script, valda sekvenser eller preset-all. "
                "Kommandon som kan skriva/uppdatera data markeras som risky."
            ),
        )
        subtitle.pack(anchor=tk.W, pady=(2, 0))

        controls = ttk.Frame(wrapper)
        controls.pack(fill=tk.X, pady=(0, 8))

        self.run_checked_button = ttk.Button(
            controls,
            text="Run checked sequence",
            command=self._run_checked_sequence,
        )
        self.run_checked_button.pack(side=tk.LEFT)

        self.run_safe_all_button = ttk.Button(
            controls,
            text="Run SAFE all",
            command=lambda: self._run_preset(PRESET_SAFE_ALL, "SAFE all"),
        )
        self.run_safe_all_button.pack(side=tk.LEFT, padx=(8, 0))

        self.run_full_all_button = ttk.Button(
            controls,
            text="Run FULL all (risky)",
            command=lambda: self._run_preset(PRESET_FULL_ALL, "FULL all"),
        )
        self.run_full_all_button.pack(side=tk.LEFT, padx=(8, 0))

        self.stop_button = ttk.Button(
            controls,
            text="Stop active",
            command=self._stop_active_process,
            state=tk.DISABLED,
        )
        self.stop_button.pack(side=tk.LEFT, padx=(16, 0))

        self.clear_button = ttk.Button(
            controls,
            text="Clear log",
            command=self._clear_log,
        )
        self.clear_button.pack(side=tk.LEFT, padx=(8, 0))

        self.auto_confirm_var = tk.BooleanVar(value=False)
        auto_confirm = ttk.Checkbutton(
            controls,
            variable=self.auto_confirm_var,
            text="Auto-confirm risky commands",
        )
        auto_confirm.pack(side=tk.RIGHT)

        body = ttk.PanedWindow(wrapper, orient=tk.HORIZONTAL)
        body.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(body, padding=(0, 0, 8, 0))
        right = ttk.Frame(body)
        body.add(left, weight=1)
        body.add(right, weight=2)

        self._build_commands_panel(left)
        self._build_output_panel(right)

    def _build_commands_panel(self, parent: ttk.Frame) -> None:
        groups = ["Artifacts", "Scaffolds", "Template Library", "v0 Templates", "Quality"]
        for group in groups:
            frame = ttk.LabelFrame(parent, text=group, padding=8)
            frame.pack(fill=tk.X, pady=(0, 8))
            for spec in [item for item in COMMANDS if item.group == group]:
                self._build_command_row(frame, spec)

    def _build_command_row(self, parent: ttk.Frame, spec: CommandSpec) -> None:
        row = ttk.Frame(parent)
        row.pack(fill=tk.X, pady=3)

        var = tk.BooleanVar(value=False)
        self._check_vars[spec.id] = var

        check = ttk.Checkbutton(row, variable=var)
        check.pack(side=tk.LEFT)

        run_button = ttk.Button(
            row,
            text="Run",
            width=8,
            command=lambda command_id=spec.id: self._run_sequence([command_id], spec.label),
        )
        run_button.pack(side=tk.LEFT, padx=(2, 6))

        label_text = f"{spec.label}{' [risky]' if spec.risky else ''}"
        label = ttk.Label(row, text=label_text)
        label.pack(side=tk.LEFT)

        desc = ttk.Label(parent, text=spec.description)
        desc.pack(anchor=tk.W, padx=(72, 0))

    def _build_output_panel(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text="Output", padding=8)
        frame.pack(fill=tk.BOTH, expand=True)

        self.output = ScrolledText(
            frame,
            wrap=tk.WORD,
            font=("Cascadia Mono", 10),
            state=tk.DISABLED,
        )
        self.output.pack(fill=tk.BOTH, expand=True)

        self._append_line(f"Repo root: {REPO_ROOT}")

    def _run_checked_sequence(self) -> None:
        selected_ids = [cid for cid, var in self._check_vars.items() if var.get()]
        if not selected_ids:
            messagebox.showinfo("No selection", "Markera minst ett kommando först.")
            return
        self._run_sequence(selected_ids, "Checked sequence")

    def _run_preset(self, command_ids: list[str], name: str) -> None:
        self._run_sequence(command_ids, name)

    def _run_sequence(self, command_ids: list[str], label: str) -> None:
        if self._worker_thread and self._worker_thread.is_alive():
            messagebox.showwarning("Busy", "Ett annat kommando kör redan.")
            return

        specs = [self._command_by_id[cid] for cid in command_ids]
        risky_specs = [spec for spec in specs if spec.risky]
        if risky_specs and not self.auto_confirm_var.get():
            risky_names = "\n".join(f"- {spec.label}" for spec in risky_specs)
            ok = messagebox.askyesno(
                "Confirm risky commands",
                (
                    "Följande kommandon kan skriva/uppdatera mycket data:\n\n"
                    f"{risky_names}\n\n"
                    "Vill du fortsätta?"
                ),
            )
            if not ok:
                return

        self._set_running_state(True)
        self._stop_requested = False
        self._append_line("")
        self._append_line(f"=== Start: {label} ===")

        self._worker_thread = threading.Thread(
            target=self._run_worker,
            args=(specs, label),
            daemon=True,
        )
        self._worker_thread.start()

    def _run_worker(self, specs: list[CommandSpec], label: str) -> None:
        try:
            for spec in specs:
                if self._stop_requested:
                    self._output_queue.put("[dashboard] Stopped by user.")
                    return

                command_display = " ".join(spec.command)
                self._output_queue.put("")
                self._output_queue.put(f"--- {spec.label} ---")
                self._output_queue.put(f"> {command_display}")

                proc = subprocess.Popen(
                    list(spec.command),
                    cwd=str(REPO_ROOT),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
                self._active_process = proc
                assert proc.stdout is not None

                for line in proc.stdout:
                    if self._stop_requested:
                        break
                    self._output_queue.put(line.rstrip("\n"))

                if self._stop_requested:
                    if proc.poll() is None:
                        proc.terminate()
                    proc.wait(timeout=10)
                    self._output_queue.put("[dashboard] Command terminated.")
                    return

                exit_code = proc.wait()
                if exit_code != 0:
                    self._output_queue.put(f"[dashboard] Command failed: {spec.label} (exit {exit_code})")
                    return

            self._output_queue.put("")
            self._output_queue.put(f"=== Done: {label} ===")
        except Exception as error:  # pragma: no cover - defensive GUI guard
            self._output_queue.put(f"[dashboard] ERROR: {error}")
        finally:
            self._active_process = None
            self.root.after(0, lambda: self._set_running_state(False))

    def _set_running_state(self, running: bool) -> None:
        state = tk.DISABLED if running else tk.NORMAL
        self.run_checked_button.configure(state=state)
        self.run_safe_all_button.configure(state=state)
        self.run_full_all_button.configure(state=state)
        self.stop_button.configure(state=tk.NORMAL if running else tk.DISABLED)

    def _stop_active_process(self) -> None:
        if not self._active_process:
            return
        self._stop_requested = True
        self._append_line("[dashboard] Stop requested...")

    def _clear_log(self) -> None:
        self.output.configure(state=tk.NORMAL)
        self.output.delete("1.0", tk.END)
        self.output.configure(state=tk.DISABLED)

    def _append_line(self, text: str) -> None:
        self.output.configure(state=tk.NORMAL)
        self.output.insert(tk.END, f"{text}\n")
        self.output.see(tk.END)
        self.output.configure(state=tk.DISABLED)

    def _poll_output_queue(self) -> None:
        try:
            while True:
                self._append_line(self._output_queue.get_nowait())
        except queue.Empty:
            pass
        self.root.after(100, self._poll_output_queue)


def main() -> int:
    root = tk.Tk()
    ScriptsDashboard(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
