#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import threading
import urllib.error
import urllib.request
import webbrowser
from dataclasses import dataclass, field
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


def format_bytes(value: object) -> str:
    if not isinstance(value, (int, float)):
        return "unknown"
    bytes_value = int(value)
    if bytes_value < 0:
        return "unknown"
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(bytes_value)
    unit_index = 0
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    precision = 0 if size >= 10 or unit_index == 0 else 1
    return f"{size:.{precision}f} {units[unit_index]}"


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


def run_command_json(args: list[str], *, cwd: Path | None = None) -> object:
    output = run_command(args, cwd=cwd)
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Command did not return valid JSON: {' '.join(args)}") from error


def preview_host_request(
    base_url: str,
    api_key: str | None,
    path: str,
    *,
    method: str = "GET",
    require_auth: bool = False,
) -> object:
    url = f"{base_url.rstrip('/')}{path}"
    headers = {
        "Content-Type": "application/json",
    }
    token = (api_key or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    elif require_auth:
        raise RuntimeError("Preview host API key is required for this endpoint.")
    request = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(payload or f"HTTP {error.code} from {url}.") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach {url}: {error.reason}") from error


def detect_machine_id(machine_list: object, machine_list_output: str | None = None) -> str | None:
    if isinstance(machine_list, list):
        for entry in machine_list:
            if isinstance(entry, dict):
                machine_id = entry.get("id")
                if isinstance(machine_id, str) and machine_id.strip():
                    return machine_id.strip()
    if machine_list_output:
        match = re.search(r"\b([0-9a-f]{14,})\b", machine_list_output, flags=re.IGNORECASE)
        return match.group(1) if match else None
    return None


def parse_secret_names(secrets_output: str) -> list[str]:
    names: list[str] = []
    for index, raw_line in enumerate(secrets_output.splitlines()):
        line = raw_line.strip()
        if not line:
            continue
        if index == 0 and "NAME" in line.upper():
            continue
        parts = re.split(r"\s{2,}|\t+", line)
        if parts and parts[0]:
            names.append(parts[0].strip())
    return names


@dataclass
class RefreshPayload:
    fly_status_json: object | None = None
    machine_list_json: object | None = None
    volume_list_json: object | None = None
    secrets_list: str | None = None
    host_health: object | None = None
    storage: object | None = None
    sessions: object | None = None
    errors: list[str] = field(default_factory=list)


def first_machine(payload: RefreshPayload) -> dict[str, object] | None:
    if isinstance(payload.machine_list_json, list) and payload.machine_list_json:
        first = payload.machine_list_json[0]
        if isinstance(first, dict):
            return first
    if isinstance(payload.fly_status_json, dict):
        machines = payload.fly_status_json.get("Machines")
        if isinstance(machines, list) and machines:
            first = machines[0]
            if isinstance(first, dict):
                return first
    return None


def first_volume(payload: RefreshPayload) -> dict[str, object] | None:
    if isinstance(payload.volume_list_json, list) and payload.volume_list_json:
        first = payload.volume_list_json[0]
        if isinstance(first, dict):
            return first
    return None


def format_machine_resources(machine: dict[str, object]) -> str:
    config = machine.get("config")
    if not isinstance(config, dict):
        return "unknown"
    guest = config.get("guest")
    if not isinstance(guest, dict):
        return "unknown"
    cpus = guest.get("cpus")
    memory_mb = guest.get("memory_mb")
    cpu_kind = guest.get("cpu_kind")
    if not isinstance(cpus, int) or not isinstance(memory_mb, int):
        return "unknown"
    kind_suffix = f" ({cpu_kind})" if isinstance(cpu_kind, str) and cpu_kind.strip() else ""
    return f"{cpus} CPU / {memory_mb} MB RAM{kind_suffix}"


def build_summary(payload: RefreshPayload, *, app_name: str, base_url: str, api_key_present: bool) -> str:
    machine = first_machine(payload)
    volume = first_volume(payload)
    secret_names = parse_secret_names(payload.secrets_list or "")
    storage_root = payload.storage.get("storage") if isinstance(payload.storage, dict) else None
    storage_paths = storage_root.get("paths") if isinstance(storage_root, dict) else None
    host_health_ok = payload.host_health.get("ok") if isinstance(payload.host_health, dict) else None
    host_health_sessions = (
        payload.host_health.get("sessions") if isinstance(payload.host_health, dict) else None
    )
    sessions_count = payload.sessions.get("count") if isinstance(payload.sessions, dict) else None
    data_fs = storage_root.get("dataFilesystem") if isinstance(storage_root, dict) else None
    data_dir = storage_root.get("dataDir") if isinstance(storage_root, dict) else None
    data_dir_info = storage_paths.get("dataDir") if isinstance(storage_paths, dict) else None
    workspace_info = storage_paths.get("workspacesDir") if isinstance(storage_paths, dict) else None
    verify_workspace_info = (
        storage_paths.get("verifyWorkspacesDir") if isinstance(storage_paths, dict) else None
    )

    lines = [
        "=== Live audit summary ===",
        "",
        f"Fly app: {app_name or 'unknown'}",
        f"Preview host URL: {base_url or 'missing'}",
        f"Preview host API key configured in dashboard: {'yes' if api_key_present else 'no'}",
        "",
    ]

    if machine:
        config = machine.get("config")
        image = config.get("image", "unknown") if isinstance(config, dict) else "unknown"
        lines.extend(
            [
                f"Machine: {machine.get('id', 'unknown')} ({machine.get('name', 'unknown')})",
                f"State: {machine.get('state', 'unknown')}",
                f"Region: {machine.get('region', 'unknown')}",
                f"Resources: {format_machine_resources(machine)}",
                f"Image: {image}",
            ]
        )
    else:
        lines.append("Machine: unavailable")

    if volume:
        lines.extend(
            [
                f"Volume: {volume.get('name', 'unknown')} ({volume.get('id', 'unknown')})",
                f"Volume size: {volume.get('size_gb', 'unknown')} GB",
                f"Volume state: {volume.get('state', 'unknown')}",
                f"Volume attached machine: {volume.get('attached_machine_id', 'unknown')}",
            ]
        )
    else:
        lines.append("Volume: unavailable")

    lines.append(f"Fly secrets detected: {', '.join(secret_names) if secret_names else 'none'}")
    lines.append("")
    lines.append(
        f"Host health: {'ok' if host_health_ok is True else 'unavailable' if host_health_ok is None else host_health_ok}"
    )
    if host_health_sessions is not None:
        lines.append(f"Host reported sessions (/health): {host_health_sessions}")
    if sessions_count is not None:
        lines.append(f"Admin session count (/admin/sessions): {sessions_count}")

    if data_fs or data_dir_info or workspace_info or verify_workspace_info:
        lines.append("")
        lines.append("Storage:")
        if isinstance(data_fs, dict):
            lines.append(
                f"- /data filesystem: {data_fs.get('usedHuman', 'unknown')} used / {data_fs.get('freeHuman', 'unknown')} free / {data_fs.get('totalHuman', 'unknown')} total"
            )
        elif isinstance(data_dir_info, dict):
            lines.append(
                f"- /data directory usage: {data_dir_info.get('human', format_bytes(data_dir_info.get('bytes')))}"
            )
        if data_dir:
            lines.append(f"- Data dir: {data_dir}")
        if isinstance(workspace_info, dict):
            lines.append(
                f"- /data/workspaces: {workspace_info.get('human', format_bytes(workspace_info.get('bytes')))}"
            )
        if isinstance(verify_workspace_info, dict):
            lines.append(
                f"- /data/verify-workspaces: {verify_workspace_info.get('human', format_bytes(verify_workspace_info.get('bytes')))}"
            )

    warnings: list[str] = []
    if not api_key_present:
        warnings.append(
            "Preview host API key saknas i dashboarden; admin/storage och admin/sessions kan inte lasas."
        )
    if machine and machine.get("state") != "started":
        warnings.append(f"Machine state ar {machine.get('state')}, inte started.")
    if machine and volume:
        machine_id = machine.get("id")
        attached_machine_id = volume.get("attached_machine_id")
        if isinstance(machine_id, str) and isinstance(attached_machine_id, str):
            if attached_machine_id and attached_machine_id != machine_id:
                warnings.append(
                    f"Volume ar kopplad till {attached_machine_id}, inte aktuell machine {machine_id}."
                )
    if host_health_ok is not True:
        warnings.append("Preview host /health svarar inte med ok=true.")
    warnings.extend(payload.errors)

    lines.append("")
    lines.append("Warnings:")
    if warnings:
        lines.extend([f"- {warning}" for warning in warnings])
    else:
        lines.append("- none")
    return "\n".join(lines)


def build_overview(payload: RefreshPayload) -> str:
    sections: list[str] = []
    if payload.fly_status_json is not None:
        sections.append("=== fly status --json ===\n" + pretty_json(payload.fly_status_json))
    if payload.machine_list_json is not None:
        sections.append("=== fly machine list --json ===\n" + pretty_json(payload.machine_list_json))
    if payload.volume_list_json is not None:
        sections.append("=== fly volumes list --json ===\n" + pretty_json(payload.volume_list_json))
    if payload.host_health is not None:
        sections.append("=== preview host /health ===\n" + pretty_json(payload.host_health))
    if payload.secrets_list:
        sections.append("=== fly secrets list ===\n" + payload.secrets_list)
    if payload.errors:
        sections.append("=== partial refresh errors ===\n" + "\n".join(payload.errors))
    return "\n\n".join(sections) if sections else "(no overview data)"


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
        self._latest_payload: RefreshPayload | None = None

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
            text="Live-audit for preview-host, Fly-status, disk, sessioner och vanliga driftatgarder.",
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

        self.summary_text = self._build_text_tab(notebook, "Summary")
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
            messagebox.showwarning("Busy", "En annan atgard kor redan.")
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

    def _safe_call(self, payload: RefreshPayload, label: str, callback):
        try:
            return callback()
        except Exception as error:
            message = f"{label}: {error}"
            payload.errors.append(message)
            self._output_queue.put(("log", f"[warn] {message}"))
            return None

    def _fly(self, *args: str, cwd: Path | None = None) -> str:
        command = [FLY_CMD, *args]
        self._output_queue.put(("log", f"> {' '.join(command)}"))
        return run_command(command, cwd=cwd)

    def _fly_json(self, *args: str, cwd: Path | None = None) -> object:
        command = [FLY_CMD, *args]
        self._output_queue.put(("log", f"> {' '.join(command)}"))
        return run_command_json(command, cwd=cwd)

    def _host_public(self, path: str, *, method: str = "GET") -> object:
        base_url = self.base_url_var.get().strip()
        if not base_url:
            raise RuntimeError("Preview host URL must be set.")
        self._output_queue.put(("log", f"> {method} {base_url.rstrip('/')}{path}"))
        return preview_host_request(base_url, None, path, method=method, require_auth=False)

    def _host(self, path: str, *, method: str = "GET") -> object:
        base_url = self.base_url_var.get().strip()
        api_key = self.api_key_var.get().strip()
        if not base_url:
            raise RuntimeError("Preview host URL must be set.")
        if not api_key:
            raise RuntimeError("Preview host API key must be set.")
        self._output_queue.put(("log", f"> {method} {base_url.rstrip('/')}{path}"))
        return preview_host_request(base_url, api_key, path, method=method, require_auth=True)

    def _collect_refresh_payload(self) -> RefreshPayload:
        app_name = self.app_name_var.get().strip()
        payload = RefreshPayload()
        payload.fly_status_json = self._safe_call(
            payload,
            "fly status --json",
            lambda: self._fly_json("status", "-a", app_name, "--json"),
        )
        payload.machine_list_json = self._safe_call(
            payload,
            "fly machine list --json",
            lambda: self._fly_json("machine", "list", "-a", app_name, "--json"),
        )
        payload.volume_list_json = self._safe_call(
            payload,
            "fly volumes list --json",
            lambda: self._fly_json("vol", "list", "-a", app_name, "--json"),
        )
        payload.secrets_list = self._safe_call(
            payload,
            "fly secrets list",
            lambda: self._fly("secrets", "list", "-a", app_name),
        )
        payload.host_health = self._safe_call(
            payload,
            "preview host /health",
            lambda: self._host_public("/health"),
        )
        api_key_present = bool(self.api_key_var.get().strip())
        if api_key_present:
            payload.storage = self._safe_call(
                payload,
                "preview host /admin/storage",
                lambda: self._host("/admin/storage"),
            )
            payload.sessions = self._safe_call(
                payload,
                "preview host /admin/sessions",
                lambda: self._host("/admin/sessions"),
            )
        else:
            payload.errors.append("Preview host API key missing; skipped /admin/storage and /admin/sessions.")
        return payload

    def _apply_refresh_payload(self, payload: RefreshPayload) -> None:
        self._latest_payload = payload
        detected_machine = detect_machine_id(payload.machine_list_json)
        if detected_machine:
            self.machine_id_var.set(detected_machine)

        summary = build_summary(
            payload,
            app_name=self.app_name_var.get().strip(),
            base_url=self.base_url_var.get().strip(),
            api_key_present=bool(self.api_key_var.get().strip()),
        )
        overview = build_overview(payload)
        storage = pretty_json(payload.storage) if payload.storage is not None else "(storage unavailable)"
        sessions = pretty_json(payload.sessions) if payload.sessions is not None else "(sessions unavailable)"
        self._set_text(self.summary_text, summary)
        self._set_text(self.overview_text, overview)
        self._set_text(self.storage_text, storage)
        self._set_text(self.sessions_text, sessions)

    def refresh_all(self) -> None:
        def worker() -> None:
            payload = self._collect_refresh_payload()
            self.root.after(0, lambda: self._apply_refresh_payload(payload))

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
            payload = self._collect_refresh_payload()
            self._output_queue.put(("log", pretty_json(result)))
            self.root.after(0, lambda: self._apply_refresh_payload(payload))

        self._run_async("Cleanup host", worker)

    def destroy_all_previews(self) -> None:
        ok = messagebox.askyesno(
            "Confirm destroy",
            "Detta stoppar och rensar alla aktiva previews pa preview-hosten. Fortsatta?",
        )
        if not ok:
            return

        def worker() -> None:
            result = self._host("/admin/destroy-all", method="POST")
            payload = self._collect_refresh_payload()
            self._output_queue.put(("log", pretty_json(result)))
            self.root.after(0, lambda: self._apply_refresh_payload(payload))

        self._run_async("Destroy all previews", worker)

    def restart_machine(self) -> None:
        def worker() -> None:
            machine_id = self.machine_id_var.get().strip()
            if not machine_id:
                machine_list = self._fly_json(
                    "machine",
                    "list",
                    "-a",
                    self.app_name_var.get().strip(),
                    "--json",
                )
                machine_id_local = detect_machine_id(machine_list)
                if not machine_id_local:
                    raise RuntimeError("Could not determine machine id.")
                self.root.after(0, lambda: self.machine_id_var.set(machine_id_local))
                machine_id = machine_id_local

            result = self._fly("machine", "restart", machine_id, "-a", self.app_name_var.get().strip())
            payload = self._collect_refresh_payload()
            self._output_queue.put(("log", result))
            self.root.after(0, lambda: self._apply_refresh_payload(payload))

        self._run_async("Restart machine", worker)

    def deploy_preview_host(self) -> None:
        ok = messagebox.askyesno(
            "Confirm deploy",
            "Detta deployar preview-hosten till Fly. Fortsatta?",
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
            payload = self._collect_refresh_payload()
            self._output_queue.put(("log", result))
            self.root.after(0, lambda: self._apply_refresh_payload(payload))

        self._run_async("Deploy preview-host", worker)


def main() -> int:
    root = tk.Tk()
    FlyVmDashboard(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
