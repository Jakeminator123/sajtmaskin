#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from dataclasses import dataclass
from pathlib import Path

import tkinter as tk
from tkinter import messagebox, ttk
from tkinter.scrolledtext import ScrolledText


REPO_ROOT = Path(__file__).resolve().parents[2]
PREVIEW_HOST_ROOT = REPO_ROOT / "preview-host"
ENV_LOCAL_PATH = REPO_ROOT / ".env.local"
FLY_CMD = "fly.exe" if os.name == "nt" else "fly"


def load_env_defaults() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_LOCAL_PATH.exists():
        return values
    for raw_line in ENV_LOCAL_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def pretty_json(data: object) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)


def run_command(args: list[str], *, cwd: Path | None = None) -> str:
    completed = subprocess.run(
        args,
        cwd=str(cwd or REPO_ROOT),
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    output = "\n".join(part for part in (stdout, stderr) if part)
    if completed.returncode != 0:
        raise RuntimeError(output or f"Command failed with exit code {completed.returncode}.")
    return output or "(no output)"


def preview_host_request(
    base_url: str,
    api_key: str,
    path: str,
    *,
    method: str = "GET",
) -> object:
    url = f"{base_url.rstrip('/')}{path}"
    request = urllib.request.Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(payload or f"HTTP {error.code} from {url}.") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach {url}: {error.reason}") from error


def detect_machine_id(machine_list_output: str) -> str | None:
    match = re.search(r"\b([0-9a-f]{14,})\b", machine_list_output, flags=re.IGNORECASE)
    return match.group(1) if match else None


@dataclass
class RefreshPayload:
    fly_status: str
    machine_list: str
    volume_list: str
    secrets_list: str
    storage: object
    sessions: object


class FlyVmDashboard:
    def __init__(self, root: tk.Tk) -> None:
        defaults = load_env_defaults()

        self.root = root
        self.root.title("Fly VM Dashboard")
        self.root.geometry("1500x920")
        self.root.minsize(1280, 820)

        self.app_name_var = tk.StringVar(value="vm-fly-jakem")
        self.base_url_var = tk.StringVar(
            value=defaults.get("SAJTMASKIN_PREVIEW_HOST_BASE_URL", "https://vm-fly-jakem.fly.dev"),
        )
        self.api_key_var = tk.StringVar(
            value=defaults.get("SAJTMASKIN_PREVIEW_HOST_API_KEY", ""),
        )
        self.machine_id_var = tk.StringVar(value="")
        self.status_var = tk.StringVar(value="Ready.")

        self._output_queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self._worker_thread: threading.Thread | None = None

        self._build_layout()
        self._poll_output_queue()
        self.refresh_all()

    def _build_layout(self) -> None:
        wrapper = ttk.Frame(self.root, padding=10)
        wrapper.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(wrapper)
        header.pack(fill=tk.X, pady=(0, 8))

        ttk.Label(
            header,
            text="Fly VM Dashboard",
            font=("Segoe UI", 14, "bold"),
        ).pack(anchor=tk.W)
        ttk.Label(
            header,
            text="En enkel GUI för preview-host, Fly-status, disk, sessions och vanliga åtgärder.",
        ).pack(anchor=tk.W, pady=(2, 0))

        form = ttk.LabelFrame(wrapper, text="Anslutning", padding=8)
        form.pack(fill=tk.X, pady=(0, 8))

        ttk.Label(form, text="Fly app").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(form, textvariable=self.app_name_var, width=26).grid(row=0, column=1, sticky="ew", pady=4)

        ttk.Label(form, text="Preview host URL").grid(row=0, column=2, sticky="w", padx=(16, 8), pady=4)
        ttk.Entry(form, textvariable=self.base_url_var, width=46).grid(row=0, column=3, sticky="ew", pady=4)

        ttk.Label(form, text="API key").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(form, textvariable=self.api_key_var, width=26, show="*").grid(row=1, column=1, sticky="ew", pady=4)

        ttk.Label(form, text="Machine ID").grid(row=1, column=2, sticky="w", padx=(16, 8), pady=4)
        ttk.Entry(form, textvariable=self.machine_id_var, width=46).grid(row=1, column=3, sticky="ew", pady=4)

        form.columnconfigure(1, weight=1)
        form.columnconfigure(3, weight=1)

        buttons = ttk.Frame(wrapper)
        buttons.pack(fill=tk.X, pady=(0, 8))

        actions = [
            ("Refresh all", self.refresh_all),
            ("Read storage", self.refresh_storage_only),
            ("Read sessions", self.refresh_sessions_only),
            ("Cleanup host", self.cleanup_host),
            ("Destroy all previews", self.destroy_all_previews),
            ("Restart machine", self.restart_machine),
            ("Deploy preview-host", self.deploy_preview_host),
            ("Open preview host", lambda: webbrowser.open(self.base_url_var.get().strip())),
            ("Open Fly app", lambda: webbrowser.open(f"https://fly.io/apps/{self.app_name_var.get().strip()}")),
        ]

        for index, (label, command) in enumerate(actions):
            ttk.Button(buttons, text=label, command=command).grid(
                row=index // 5,
                column=index % 5,
                sticky="ew",
                padx=4,
                pady=4,
            )

        for column in range(5):
            buttons.columnconfigure(column, weight=1)

        ttk.Label(wrapper, textvariable=self.status_var).pack(fill=tk.X, pady=(0, 8))

        panes = ttk.Panedwindow(wrapper, orient=tk.HORIZONTAL)
        panes.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(panes)
        right = ttk.Frame(panes)
        panes.add(left, weight=3)
        panes.add(right, weight=2)

        notebook = ttk.Notebook(left)
        notebook.pack(fill=tk.BOTH, expand=True)

        self.overview_text = self._build_text_tab(notebook, "Overview")
        self.storage_text = self._build_text_tab(notebook, "Storage")
        self.sessions_text = self._build_text_tab(notebook, "Sessions")

        log_frame = ttk.LabelFrame(right, text="Log", padding=8)
        log_frame.pack(fill=tk.BOTH, expand=True)
        self.log_text = ScrolledText(
            log_frame,
            wrap=tk.WORD,
            font=("Cascadia Mono", 10),
            state=tk.DISABLED,
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self._append_log(f"Repo root: {REPO_ROOT}")
        self._append_log(f"Preview host root: {PREVIEW_HOST_ROOT}")

    def _build_text_tab(self, notebook: ttk.Notebook, title: str) -> ScrolledText:
        frame = ttk.Frame(notebook, padding=8)
        notebook.add(frame, text=title)
        text = ScrolledText(
            frame,
            wrap=tk.WORD,
            font=("Cascadia Mono", 10),
            state=tk.DISABLED,
        )
        text.pack(fill=tk.BOTH, expand=True)
        return text

    def _set_text(self, widget: ScrolledText, content: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, content)
        widget.see("1.0")
        widget.configure(state=tk.DISABLED)

    def _append_log(self, line: str) -> None:
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, f"{line}\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def _poll_output_queue(self) -> None:
        try:
            while True:
                kind, payload = self._output_queue.get_nowait()
                if kind == "log":
                    self._append_log(payload)
                elif kind == "status":
                    self.status_var.set(payload)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_output_queue)

    def _run_async(self, label: str, worker) -> None:
        if self._worker_thread and self._worker_thread.is_alive():
            messagebox.showwarning("Busy", "En annan åtgärd kör redan.")
            return

        self.status_var.set(f"Running: {label} ...")
        self._append_log("")
        self._append_log(f"=== {label} ===")

        def wrapped() -> None:
            try:
                worker()
                self._output_queue.put(("status", f"Done: {label}"))
            except Exception as error:  # pragma: no cover - GUI fallback
                self._output_queue.put(("log", f"[error] {error}"))
                self._output_queue.put(("status", f"Failed: {label}"))

        self._worker_thread = threading.Thread(target=wrapped, daemon=True)
        self._worker_thread.start()

    def _fly(self, *args: str, cwd: Path | None = None) -> str:
        command = [FLY_CMD, *args]
        self._output_queue.put(("log", f"> {' '.join(command)}"))
        return run_command(command, cwd=cwd)

    def _host(self, path: str, *, method: str = "GET") -> object:
        base_url = self.base_url_var.get().strip()
        api_key = self.api_key_var.get().strip()
        if not base_url or not api_key:
            raise RuntimeError("Preview host URL och API key måste vara ifyllda.")
        self._output_queue.put(("log", f"> {method} {base_url.rstrip('/')}{path}"))
        return preview_host_request(base_url, api_key, path, method=method)

    def refresh_all(self) -> None:
        def worker() -> None:
            payload = RefreshPayload(
                fly_status=self._fly("status", "-a", self.app_name_var.get().strip()),
                machine_list=self._fly("machine", "list", "-a", self.app_name_var.get().strip()),
                volume_list=self._fly("vol", "list", "-a", self.app_name_var.get().strip()),
                secrets_list=self._fly("secrets", "list", "-a", self.app_name_var.get().strip()),
                storage=self._host("/admin/storage"),
                sessions=self._host("/admin/sessions"),
            )
            detected_machine = detect_machine_id(payload.machine_list)
            if detected_machine:
                self.root.after(0, lambda: self.machine_id_var.set(detected_machine))
            overview = "\n\n".join(
                [
                    "=== fly status ===",
                    payload.fly_status,
                    "=== fly machine list ===",
                    payload.machine_list,
                    "=== fly volume list ===",
                    payload.volume_list,
                    "=== fly secrets list ===",
                    payload.secrets_list,
                ],
            )
            self.root.after(0, lambda: self._set_text(self.overview_text, overview))
            self.root.after(0, lambda: self._set_text(self.storage_text, pretty_json(payload.storage)))
            self.root.after(0, lambda: self._set_text(self.sessions_text, pretty_json(payload.sessions)))

        self._run_async("Refresh all", worker)

    def refresh_storage_only(self) -> None:
        def worker() -> None:
            storage = self._host("/admin/storage")
            self.root.after(0, lambda: self._set_text(self.storage_text, pretty_json(storage)))

        self._run_async("Read storage", worker)

    def refresh_sessions_only(self) -> None:
        def worker() -> None:
            sessions = self._host("/admin/sessions")
            self.root.after(0, lambda: self._set_text(self.sessions_text, pretty_json(sessions)))

        self._run_async("Read sessions", worker)

    def cleanup_host(self) -> None:
        def worker() -> None:
            result = self._host("/admin/cleanup", method="POST")
            self.root.after(0, lambda: self._set_text(self.storage_text, pretty_json(result)))

        self._run_async("Cleanup host", worker)

    def destroy_all_previews(self) -> None:
        ok = messagebox.askyesno(
            "Confirm destroy",
            "Detta stoppar och rensar alla aktiva previews på preview-hosten. Fortsätta?",
        )
        if not ok:
            return

        def worker() -> None:
            result = self._host("/admin/destroy-all", method="POST")
            storage = self._host("/admin/storage")
            sessions = self._host("/admin/sessions")
            self.root.after(0, lambda: self._set_text(self.sessions_text, pretty_json(sessions)))
            self.root.after(0, lambda: self._set_text(self.storage_text, pretty_json(storage)))
            self._output_queue.put(("log", pretty_json(result)))

        self._run_async("Destroy all previews", worker)

    def restart_machine(self) -> None:
        def worker() -> None:
            machine_id = self.machine_id_var.get().strip()
            if not machine_id:
                machine_list = self._fly("machine", "list", "-a", self.app_name_var.get().strip())
                machine_id_local = detect_machine_id(machine_list)
                if not machine_id_local:
                    raise RuntimeError("Could not determine machine id.")
                self.root.after(0, lambda: self.machine_id_var.set(machine_id_local))
                machine_id = machine_id_local

            result = self._fly("machine", "restart", machine_id, "-a", self.app_name_var.get().strip())
            self._output_queue.put(("log", result))

        self._run_async("Restart machine", worker)

    def deploy_preview_host(self) -> None:
        ok = messagebox.askyesno(
            "Confirm deploy",
            "Detta deployar preview-hosten till Fly. Fortsätta?",
        )
        if not ok:
            return

        def worker() -> None:
            result = self._fly(
                "deploy",
                "--app",
                self.app_name_var.get().strip(),
                "--config",
                "fly.toml",
                "--now",
                cwd=PREVIEW_HOST_ROOT,
            )
            self._output_queue.put(("log", result))

        self._run_async("Deploy preview-host", worker)


def main() -> int:
    root = tk.Tk()
    FlyVmDashboard(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
