import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    import sajtmaskin_cleaner_cli as cleaner  # type: ignore

    HAS_CLEANER = True
except Exception:
    cleaner = None
    HAS_CLEANER = False

try:
    import ttkbootstrap as ttkb  # type: ignore

    USE_TTKB = True
except Exception:
    ttkb = None
    USE_TTKB = False


APP_TITLE = "Sajtmaskin Env GUI"
DEFAULT_GEOMETRY = "1440x900"
TTKB_THEME = "darkly"

EXPECTED_KEYS: Dict[str, Dict[str, str]] = {
    "VERCEL_TOKEN": {"required": "yes", "notes": "Vercel REST API (deploy, projects)"},
    "VERCEL_TEAM_ID": {"required": "recommended", "notes": "Scope API calls to team"},
    "VERCEL_PROJECT_ID": {"required": "recommended", "notes": "Link local repo to project"},
    "V0_API_KEY": {"required": "yes", "notes": "v0 code generation SDK"},
    "AI_GATEWAY_API_KEY": {"required": "yes", "notes": "Vercel AI Gateway (GPT-4o, Claude)"},
    "OPENAI_API_KEY": {"required": "optional", "notes": "Direct OpenAI (fallback)"},
    "ANTHROPIC_API_KEY": {"required": "optional", "notes": "Direct Anthropic (fallback)"},
    "POSTGRES_URL": {"required": "yes", "notes": "Database connection"},
    "KV_URL": {"required": "recommended", "notes": "Redis/KV sessions"},
    "REDIS_URL": {"required": "recommended", "notes": "Redis rate limiting"},
    "JWT_SECRET": {"required": "yes", "notes": "Auth token signing"},
    "STRIPE_SECRET_KEY": {"required": "optional", "notes": "Payments"},
    "BLOB_READ_WRITE_TOKEN": {"required": "optional", "notes": "Vercel Blob storage"},
    "GITHUB_CLIENT_ID": {"required": "optional", "notes": "GitHub OAuth"},
    "GITHUB_CLIENT_SECRET": {"required": "optional", "notes": "GitHub OAuth"},
    "GOOGLE_CLIENT_ID": {"required": "optional", "notes": "Google OAuth"},
    "GOOGLE_CLIENT_SECRET": {"required": "optional", "notes": "Google OAuth"},
    "UNSPLASH_ACCESS_KEY": {"required": "optional", "notes": "Stock photos"},
}

CATEGORY_LABELS = [
    "All",
    "Vercel",
    "V0",
    "Supabase",
    "OpenAI",
    "Anthropic",
    "GitHub",
    "User",
    "TierModel",
    "Other",
]


def categorize_key(key: str) -> str:
    k = key.upper()
    if "VERCEL" in k:
        return "Vercel"
    if k.startswith("V0") or "V0" in k:
        return "V0"
    if "SUPABASE" in k:
        return "Supabase"
    if "OPENAI" in k:
        return "OpenAI"
    if "ANTHROPIC" in k:
        return "Anthropic"
    if "GITHUB" in k:
        return "GitHub"
    if "USER" in k or "USERNAME" in k:
        return "User"
    if "TIER" in k or "MODEL" in k:
        return "TierModel"
    return "Other"


def mask_value(value: Optional[str]) -> str:
    if value is None:
        return "<hidden>"
    if value == "":
        return ""
    if HAS_CLEANER and cleaner:
        return cleaner.mask_value(value, keep=2)
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}***{value[-2:]}"


def normalize_value(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def serialize_value(value: str) -> str:
    v = normalize_value(value)
    needs_quotes = any(ch.isspace() for ch in v) or "#" in v or v == ""
    if needs_quotes or '"' in v:
        escaped = v.replace("\\", "\\\\").replace('"', '\\"')
        return f"\"{escaped}\""
    return v


def parse_env_line(line: str) -> Optional[Tuple[str, str, bool]]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    is_export = False
    if stripped.startswith("export "):
        stripped = stripped[len("export ") :].strip()
        is_export = True
    if "=" not in stripped:
        return None
    key, raw_val = stripped.split("=", 1)
    key = key.strip()
    value = raw_val.strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]
    return key, value, is_export


def find_repo_root(start: Path) -> Path:
    if HAS_CLEANER and cleaner:
        return cleaner.find_repo_root(start)
    for current in [start, *start.parents]:
        if (current / ".git").exists() or (current / "package.json").exists():
            return current
    return start


def discover_env_files(root: Path) -> List[Path]:
    files: List[Path] = []
    if HAS_CLEANER and cleaner:
        files.extend(cleaner.find_env_files(root))
    else:
        for p in sorted(root.glob(".env*")):
            if p.is_file():
                files.append(p)

    extra = [
        root / "senaste_miljovariablar" / "_.env.local",
        root / "senaste_miljovariablar" / "_.env.production",
    ]
    for p in extra:
        if p.exists() and p.is_file():
            files.append(p)

    seen = set()
    out: List[Path] = []
    for p in files:
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            out.append(rp)
    return out


@dataclass
class EnvSource:
    name: str
    kind: str  # "file", "runtime", "vercel", "v0"
    path: Optional[Path] = None
    values: Dict[str, Optional[str]] = field(default_factory=dict)
    lines: List[str] = field(default_factory=list)
    line_index: Dict[str, int] = field(default_factory=dict)
    dirty: bool = False
    meta: Dict[str, str] = field(default_factory=dict)
    key_meta: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def display_name(self) -> str:
        label = self.name
        if self.kind == "file" and self.dirty:
            label = f"* {label}"
        if self.kind == "file" and self.path:
            label = f"{label}  ({self.path})"
        return label

    def is_readonly(self) -> bool:
        return self.kind != "file"

    def load(self) -> None:
        if self.kind == "runtime":
            self.values = dict(os.environ)
            self.lines = []
            self.line_index = {}
            self.key_meta = {}
            self.dirty = False
            return

        if not self.path:
            return

        if not self.path.exists():
            self.values = {}
            self.lines = []
            self.line_index = {}
            self.key_meta = {}
            self.dirty = False
            return

        content = self.path.read_text(encoding="utf-8", errors="ignore")
        self.lines = content.splitlines()
        self.values = {}
        self.line_index = {}
        self.key_meta = {}
        for idx, line in enumerate(self.lines):
            parsed = parse_env_line(line)
            if not parsed:
                continue
            key, value, _ = parsed
            self.values[key] = value
            self.line_index[key] = idx
        self.dirty = False

    def set_value(self, key: str, value: str) -> None:
        key = key.strip()
        if not key:
            return
        value = normalize_value(value)

        if self.kind == "runtime":
            os.environ[key] = value
            self.values[key] = value
            return

        line = f"{key}={serialize_value(value)}"
        if key in self.line_index:
            self.lines[self.line_index[key]] = line
        else:
            self.lines.append(line)
            self.line_index[key] = len(self.lines) - 1
        self.values[key] = value
        self.dirty = True

    def delete_key(self, key: str) -> None:
        if self.kind == "runtime":
            if key in os.environ:
                del os.environ[key]
            if self.values and key in self.values:
                del self.values[key]
            return

        if not self.lines or not self.line_index:
            return
        idx = self.line_index.get(key)
        if idx is None:
            return
        self.lines.pop(idx)
        self.line_index = {}
        self.values = {}
        self.key_meta = {}
        for i, line in enumerate(self.lines):
            parsed = parse_env_line(line)
            if not parsed:
                continue
            k, v, _ = parsed
            self.values[k] = v
            self.line_index[k] = i
        self.dirty = True

    def save(self) -> None:
        if self.kind != "file" or not self.path:
            return
        if self.lines is None:
            self.lines = []
        self.path.parent.mkdir(parents=True, exist_ok=True)
        content = "\n".join(self.lines).rstrip("\n") + "\n"
        self.path.write_text(content, encoding="utf-8")
        self.dirty = False


class EnvGuiApp:
    def __init__(self, root: tk.Tk, repo_root: Path) -> None:
        self.root = root
        self.repo_root = repo_root
        self.local_sources: List[EnvSource] = []
        self.remote_sources: List[EnvSource] = []
        self.sources: List[EnvSource] = []
        self.selected_source: Optional[EnvSource] = None
        self.profiles: List[Any] = []
        self.config_path: Optional[Path] = None

        self.search_var = tk.StringVar(value="")
        self.category_var = tk.StringVar(value="All")
        self.show_values_var = tk.BooleanVar(value=True)
        self.diff_only_var = tk.BooleanVar(value=False)
        self.compare_var = tk.StringVar(value="(none)")
        self.include_runtime_var = tk.BooleanVar(value=False)
        self.profile_var = tk.StringVar(value="")
        self.vercel_var = tk.BooleanVar(value=True)
        self.v0_var = tk.BooleanVar(value=True)
        self.decrypt_var = tk.BooleanVar(value=True)
        self.project_filter_var = tk.StringVar(value="")
        self.max_projects_var = tk.StringVar(value="20")
        self.status_var = tk.StringVar(value="Ready")

        self._build_ui()
        self._load_profiles()
        self._reload_local_sources()

    def _build_ui(self) -> None:
        self.root.title(APP_TITLE)
        self.root.geometry(DEFAULT_GEOMETRY)

        # -- Top bar --
        top = ttk.Frame(self.root, padding=(12, 8))
        top.pack(side=tk.TOP, fill=tk.X)

        ttk.Label(top, text=APP_TITLE, font=("Segoe UI", 16, "bold")).pack(side=tk.LEFT)
        ttk.Label(top, text=f"  {self.repo_root}", font=("Segoe UI", 9)).pack(side=tk.LEFT, padx=8)

        ttk.Checkbutton(top, text="Runtime", variable=self.include_runtime_var,
                         command=self._reload_local_sources).pack(side=tk.RIGHT, padx=4)
        if USE_TTKB and ttkb:
            ttk.Button(top, text="Reload", bootstyle="info-outline",
                       command=self._reload_current).pack(side=tk.RIGHT, padx=4)
            ttk.Button(top, text="+ env file", bootstyle="secondary-outline",
                       command=self._add_env_file).pack(side=tk.RIGHT, padx=4)
        else:
            ttk.Button(top, text="Reload", command=self._reload_current).pack(side=tk.RIGHT, padx=4)
            ttk.Button(top, text="+ env file", command=self._add_env_file).pack(side=tk.RIGHT, padx=4)

        # -- Remote bar --
        remote_bar = ttk.Frame(self.root, padding=(12, 2, 12, 6))
        remote_bar.pack(side=tk.TOP, fill=tk.X)

        ttk.Label(remote_bar, text="Profile:").pack(side=tk.LEFT)
        self.profile_box = ttk.Combobox(remote_bar, values=[], textvariable=self.profile_var,
                                         width=14, state="readonly")
        self.profile_box.pack(side=tk.LEFT, padx=6)
        ttk.Checkbutton(remote_bar, text="Vercel", variable=self.vercel_var).pack(side=tk.LEFT, padx=4)
        ttk.Checkbutton(remote_bar, text="v0", variable=self.v0_var).pack(side=tk.LEFT, padx=4)

        ttk.Label(remote_bar, text="Filter:").pack(side=tk.LEFT, padx=(10, 0))
        ttk.Entry(remote_bar, textvariable=self.project_filter_var, width=16).pack(side=tk.LEFT, padx=4)
        ttk.Label(remote_bar, text="Max:").pack(side=tk.LEFT, padx=(6, 0))
        ttk.Entry(remote_bar, textvariable=self.max_projects_var, width=4).pack(side=tk.LEFT, padx=4)
        ttk.Checkbutton(remote_bar, text="Decrypt", variable=self.decrypt_var).pack(side=tk.LEFT, padx=6)

        if USE_TTKB and ttkb:
            ttk.Button(remote_bar, text="Load remote", bootstyle="success",
                       command=self._load_remote).pack(side=tk.RIGHT, padx=4)
            ttk.Button(remote_bar, text="Clear remote", bootstyle="danger-outline",
                       command=self._clear_remote).pack(side=tk.RIGHT, padx=4)
        else:
            ttk.Button(remote_bar, text="Load remote", command=self._load_remote).pack(side=tk.RIGHT, padx=4)
            ttk.Button(remote_bar, text="Clear remote", command=self._clear_remote).pack(side=tk.RIGHT, padx=4)

        # -- Main split --
        main = ttk.Panedwindow(self.root, orient=tk.HORIZONTAL)
        main.pack(fill=tk.BOTH, expand=True, padx=10, pady=6)

        left = ttk.Frame(main, padding=6)
        right = ttk.Frame(main, padding=6)
        main.add(left, weight=2)
        main.add(right, weight=5)

        # -- Left: sources + account + health --
        ttk.Label(left, text="Sources", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        src_frame = ttk.Frame(left)
        src_frame.pack(fill=tk.BOTH, expand=True, pady=4)
        self.sources_list = tk.Listbox(src_frame, height=10, font=("Consolas", 9))
        src_scroll = ttk.Scrollbar(src_frame, orient="vertical", command=self.sources_list.yview)
        self.sources_list.configure(yscrollcommand=src_scroll.set)
        self.sources_list.grid(row=0, column=0, sticky="nsew")
        src_scroll.grid(row=0, column=1, sticky="ns")
        src_frame.columnconfigure(0, weight=1)
        src_frame.rowconfigure(0, weight=1)
        self.sources_list.bind("<<ListboxSelect>>", self._on_source_select)

        self.source_hint = ttk.Label(left, text="Select a source to view variables.")
        self.source_hint.pack(anchor="w", pady=2)

        # -- Account info --
        acct_frame = ttk.LabelFrame(left, text="Accounts / Teams", padding=4)
        acct_frame.pack(fill=tk.BOTH, expand=False, pady=(6, 0))
        self.account_text = tk.Text(acct_frame, height=6, wrap="word", state="disabled",
                                     font=("Consolas", 9))
        acct_scroll = ttk.Scrollbar(acct_frame, orient="vertical", command=self.account_text.yview)
        self.account_text.configure(yscrollcommand=acct_scroll.set)
        self.account_text.grid(row=0, column=0, sticky="nsew")
        acct_scroll.grid(row=0, column=1, sticky="ns")
        acct_frame.columnconfigure(0, weight=1)
        acct_frame.rowconfigure(0, weight=1)

        # -- Health panel --
        health_frame = ttk.LabelFrame(left, text="Health Check", padding=4)
        health_frame.pack(fill=tk.BOTH, expand=False, pady=(6, 0))
        self.health_text = tk.Text(health_frame, height=8, wrap="word", state="disabled",
                                    font=("Consolas", 9))
        health_scroll = ttk.Scrollbar(health_frame, orient="vertical", command=self.health_text.yview)
        self.health_text.configure(yscrollcommand=health_scroll.set)
        self.health_text.grid(row=0, column=0, sticky="nsew")
        health_scroll.grid(row=0, column=1, sticky="ns")
        health_frame.columnconfigure(0, weight=1)
        health_frame.rowconfigure(0, weight=1)

        self.health_text.tag_configure("ok", foreground="#00e676")
        self.health_text.tag_configure("warn", foreground="#ffc107")
        self.health_text.tag_configure("error", foreground="#ff5252")
        self.health_text.tag_configure("info", foreground="#90caf9")

        # -- Right: filter bar + table --
        filter_bar = ttk.Frame(right)
        filter_bar.pack(fill=tk.X, pady=(0, 6))

        ttk.Label(filter_bar, text="Search:").pack(side=tk.LEFT)
        search_entry = ttk.Entry(filter_bar, textvariable=self.search_var, width=24)
        search_entry.pack(side=tk.LEFT, padx=4)
        search_entry.bind("<KeyRelease>", lambda _e: self._refresh_table())

        ttk.Label(filter_bar, text="Cat:").pack(side=tk.LEFT, padx=(8, 0))
        category_box = ttk.Combobox(filter_bar, values=CATEGORY_LABELS,
                                     textvariable=self.category_var, width=12, state="readonly")
        category_box.pack(side=tk.LEFT, padx=4)
        category_box.bind("<<ComboboxSelected>>", lambda _e: self._refresh_table())

        ttk.Label(filter_bar, text="Compare:").pack(side=tk.LEFT, padx=(8, 0))
        self.compare_box = ttk.Combobox(filter_bar, values=["(none)"],
                                         textvariable=self.compare_var, width=28, state="readonly")
        self.compare_box.pack(side=tk.LEFT, padx=4)
        self.compare_box.bind("<<ComboboxSelected>>", lambda _e: self._refresh_table())

        ttk.Checkbutton(filter_bar, text="Diff only", variable=self.diff_only_var,
                         command=self._refresh_table).pack(side=tk.LEFT, padx=6)
        ttk.Checkbutton(filter_bar, text="Show values", variable=self.show_values_var,
                         command=self._refresh_table).pack(side=tk.RIGHT, padx=4)

        # -- Table --
        table_frame = ttk.Frame(right)
        table_frame.pack(fill=tk.BOTH, expand=True)

        columns = ("key", "value", "compare", "diff", "category")
        self.table = ttk.Treeview(table_frame, columns=columns, show="headings", height=22)
        self.table.heading("key", text="Key")
        self.table.heading("value", text="Value")
        self.table.heading("compare", text="Compare")
        self.table.heading("diff", text="Diff")
        self.table.heading("category", text="Category")
        self.table.column("key", width=260, anchor="w")
        self.table.column("value", width=340, anchor="w")
        self.table.column("compare", width=340, anchor="w")
        self.table.column("diff", width=90, anchor="center")
        self.table.column("category", width=100, anchor="center")

        self.table.tag_configure("changed", background="#4a2600")
        self.table.tag_configure("only-left", background="#1a3a1a")
        self.table.tag_configure("only-right", background="#3a1a1a")
        self.table.tag_configure("suspect", background="#4a3a00")

        yscroll = ttk.Scrollbar(table_frame, orient="vertical", command=self.table.yview)
        xscroll = ttk.Scrollbar(table_frame, orient="horizontal", command=self.table.xview)
        self.table.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        self.table.grid(row=0, column=0, sticky="nsew")
        yscroll.grid(row=0, column=1, sticky="ns")
        xscroll.grid(row=1, column=0, sticky="ew")
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)

        self.table.bind("<Double-1>", lambda _e: self._edit_selected())

        # -- Bottom buttons --
        buttons = ttk.Frame(right)
        buttons.pack(fill=tk.X, pady=6)
        if USE_TTKB and ttkb:
            self.add_btn = ttk.Button(buttons, text="Add", bootstyle="success-outline", command=self._add_entry)
            self.edit_btn = ttk.Button(buttons, text="Edit", bootstyle="info-outline", command=self._edit_selected)
            self.delete_btn = ttk.Button(buttons, text="Delete", bootstyle="danger-outline", command=self._delete_selected)
            self.save_btn = ttk.Button(buttons, text="Save", bootstyle="warning", command=self._save_current)
            export_btn = ttk.Button(buttons, text="Export report", bootstyle="primary-outline", command=self._export_report)
        else:
            self.add_btn = ttk.Button(buttons, text="Add", command=self._add_entry)
            self.edit_btn = ttk.Button(buttons, text="Edit", command=self._edit_selected)
            self.delete_btn = ttk.Button(buttons, text="Delete", command=self._delete_selected)
            self.save_btn = ttk.Button(buttons, text="Save", command=self._save_current)
            export_btn = ttk.Button(buttons, text="Export report", command=self._export_report)
        self.add_btn.pack(side=tk.LEFT)
        self.edit_btn.pack(side=tk.LEFT, padx=4)
        self.delete_btn.pack(side=tk.LEFT, padx=4)
        self.save_btn.pack(side=tk.RIGHT)
        export_btn.pack(side=tk.RIGHT, padx=6)

        # -- Status bar --
        status = ttk.Frame(self.root, padding=(12, 4))
        status.pack(side=tk.BOTTOM, fill=tk.X)
        self.status_label = ttk.Label(status, textvariable=self.status_var, font=("Consolas", 9))
        self.status_label.pack(anchor="w")

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _load_profiles(self) -> None:
        if not HAS_CLEANER or not cleaner:
            self.profiles = []
            self.profile_box.configure(values=[])
            self.profile_var.set("")
            self._set_account_text("Cleaner module not available.")
            return

        try:
            env_files = cleaner.find_env_files(self.repo_root)
            if env_files:
                cleaner.load_env_files_into_os(env_files)
        except Exception:
            pass

        candidates = [
            self.repo_root / ".sajtmaskin-cleaner.json",
            self.repo_root / "vercel_gui" / "sajtmaskin-cleaner.json",
        ]
        cfg_path = None
        for p in candidates:
            if p.exists():
                cfg_path = p
                break

        profiles, _sqlite_candidates, loaded_path = cleaner.load_config(
            self.repo_root, str(cfg_path) if cfg_path else None
        )
        self.profiles = profiles
        self.config_path = loaded_path
        names = [p.name for p in profiles]
        self.profile_box.configure(values=names)
        if names:
            if self.profile_var.get() not in names:
                self.profile_var.set(names[0])
        else:
            self.profile_var.set("")

    def _reload_local_sources(self) -> None:
        self.local_sources = []
        if self.include_runtime_var.get():
            runtime = EnvSource(name="Runtime env (session)", kind="runtime")
            runtime.load()
            self.local_sources.append(runtime)

        for path in discover_env_files(self.repo_root):
            if path.exists():
                src = EnvSource(name=f"Local: {path.name}", kind="file", path=path)
                src.load()
                self.local_sources.append(src)

        self._rebuild_sources()

    def _rebuild_sources(self) -> None:
        self.sources = list(self.local_sources) + list(self.remote_sources)
        self._refresh_sources_list()
        self._update_compare_options()

    def _refresh_sources_list(self) -> None:
        current_name = self.selected_source.name if self.selected_source else ""
        self.sources_list.delete(0, tk.END)
        selected_idx = None
        for idx, src in enumerate(self.sources):
            self.sources_list.insert(tk.END, src.display_name())
            if src.name == current_name:
                selected_idx = idx
        if selected_idx is None and self.sources:
            selected_idx = 0
        if selected_idx is not None:
            self.sources_list.selection_clear(0, tk.END)
            self.sources_list.selection_set(selected_idx)
            self._select_source(selected_idx)
        else:
            self.selected_source = None
            self._update_actions_state()
            self._refresh_table()
            self._refresh_health()

    def _update_compare_options(self) -> None:
        options = ["(none)"] + [src.name for src in self.sources]
        self.compare_box.configure(values=options)
        if self.compare_var.get() not in options:
            self.compare_var.set("(none)")

    def _get_compare_source(self) -> Optional[EnvSource]:
        name = self.compare_var.get()
        if name == "(none)":
            return None
        for src in self.sources:
            if src.name == name:
                return src
        return None

    def _format_value(self, value: Optional[str], show_values: bool, missing: bool = False) -> str:
        if missing:
            return "<missing>"
        if value is None:
            return "<hidden>"
        return value if show_values else mask_value(value)

    def _diff_status(
        self,
        left_present: bool,
        right_present: bool,
        left_value: Optional[str],
        right_value: Optional[str],
    ) -> str:
        if left_present and not right_present:
            return "only-left"
        if right_present and not left_present:
            return "only-right"
        if left_value is None or right_value is None:
            return "unknown"
        return "same" if normalize_value(left_value) == normalize_value(right_value) else "changed"

    def _select_source(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.sources):
            return
        if self.selected_source and self.selected_source.kind == "file" and self.selected_source.dirty:
            choice = messagebox.askyesnocancel(
                "Unsaved changes", "Save changes before switching sources?"
            )
            if choice is None:
                return
            if choice:
                self._save_current()
        self.selected_source = self.sources[idx]
        self._update_actions_state()
        self._refresh_table()
        self._refresh_health()

    def _on_source_select(self, _event: tk.Event) -> None:
        selection = self.sources_list.curselection()
        if not selection:
            return
        self._select_source(selection[0])

    def _refresh_table(self) -> None:
        self.table.delete(*self.table.get_children())
        src = self.selected_source
        if not src:
            return
        compare_src = self._get_compare_source()
        search = self.search_var.get().strip().lower()
        category_filter = self.category_var.get()
        show_values = self.show_values_var.get()
        diff_only = self.diff_only_var.get()

        keys = set(src.values.keys())
        if compare_src:
            keys |= set(compare_src.values.keys())

        for key in sorted(keys):
            left_present = key in src.values
            right_present = compare_src is not None and key in compare_src.values
            left_value = src.values.get(key) if left_present else None
            right_value = compare_src.values.get(key) if (compare_src and right_present) else None
            cat = categorize_key(key)
            if category_filter != "All" and cat != category_filter:
                continue
            if search:
                haystack = key.lower()
                if left_value:
                    haystack += f" {left_value.lower()}"
                if right_value:
                    haystack += f" {right_value.lower()}"
                if search not in haystack:
                    continue

            diff = ""
            display_right = ""
            if compare_src:
                diff = self._diff_status(left_present, right_present, left_value, right_value)
                if diff_only and diff == "same":
                    continue
                display_right = self._format_value(right_value, show_values, missing=not right_present)
            elif diff_only:
                continue

            display_left = self._format_value(left_value, show_values, missing=not left_present)

            tags: Tuple[str, ...] = ()
            if diff in ("changed",):
                tags = ("changed",)
            elif diff == "only-left":
                tags = ("only-left",)
            elif diff == "only-right":
                tags = ("only-right",)
            elif self._suspect_checks(key, left_value):
                tags = ("suspect",)

            self.table.insert("", tk.END, values=(key, display_left, display_right, diff, cat), tags=tags)

        self._update_status()

    def _update_status(self) -> None:
        src = self.selected_source
        if not src:
            self.status_var.set("No source selected.")
            return
        total = len(src.values) if src.values else 0
        parts = [f"{src.name}", f"{total} vars"]
        if src.kind == "runtime":
            parts.append("session only")
        if src.kind == "file" and src.dirty:
            parts.append("unsaved changes")
        if src.kind in ("vercel", "v0"):
            provider = src.meta.get("provider")
            if provider:
                parts.append(provider)
            profile = src.meta.get("profile")
            if profile:
                parts.append(f"profile={profile}")
            team = src.meta.get("team")
            if team:
                parts.append(f"team={team}")
            level = src.meta.get("level")
            if level:
                parts.append(f"level={level}")
        compare_src = self._get_compare_source()
        if compare_src:
            parts.append(f"compare={compare_src.name}")
        self.status_var.set(" | ".join(parts))

    def _update_actions_state(self) -> None:
        src = self.selected_source
        editable = bool(src and not src.is_readonly())
        state = tk.NORMAL if editable else tk.DISABLED
        self.add_btn.configure(state=state)
        self.edit_btn.configure(state=state)
        self.delete_btn.configure(state=state)
        save_state = tk.NORMAL if (src and src.kind == "file" and src.dirty) else tk.DISABLED
        self.save_btn.configure(state=save_state)

    def _refresh_health(self) -> None:
        src = self.selected_source
        self.health_text.configure(state="normal")
        self.health_text.delete("1.0", tk.END)

        if not src:
            self.health_text.insert(tk.END, "Select a source to check.", "info")
            self.health_text.configure(state="disabled")
            return

        ok_count = 0
        warn_count = 0
        err_count = 0

        for key, meta in EXPECTED_KEYS.items():
            req = meta["required"]
            notes = meta["notes"]
            val = src.values.get(key)
            present = key in src.values
            has_value = present and val is not None and val.strip() != ""

            if has_value:
                issues = self._suspect_checks(key, val)
                if issues:
                    self.health_text.insert(tk.END, f"  !! {key}: {'; '.join(issues)}\n", "warn")
                    warn_count += 1
                else:
                    self.health_text.insert(tk.END, f"  OK {key} ({len(val)} chars)\n", "ok")
                    ok_count += 1
            elif req == "yes":
                self.health_text.insert(tk.END, f"  XX {key} MISSING - {notes}\n", "error")
                err_count += 1
            elif req == "recommended":
                self.health_text.insert(tk.END, f"  -- {key} missing (recommended) - {notes}\n", "warn")
                warn_count += 1
            else:
                self.health_text.insert(tk.END, f"  -- {key} not set (optional)\n", "info")

        extra_suspects = []
        for key, val in sorted(src.values.items()):
            if key in EXPECTED_KEYS:
                continue
            issues = self._suspect_checks(key, val)
            if issues:
                extra_suspects.append((key, issues))
        if extra_suspects:
            self.health_text.insert(tk.END, "\n  Other warnings:\n", "warn")
            for key, issues in extra_suspects:
                self.health_text.insert(tk.END, f"  !! {key}: {'; '.join(issues)}\n", "warn")
                warn_count += 1

        self.health_text.insert(tk.END, f"\n  --- {ok_count} ok, {warn_count} warn, {err_count} error ---\n",
                                 "ok" if err_count == 0 else "error")
        self.health_text.configure(state="disabled")

    def _set_account_text(self, text: str) -> None:
        self.account_text.configure(state="normal")
        self.account_text.delete("1.0", tk.END)
        self.account_text.insert("1.0", text or "")
        self.account_text.configure(state="disabled")

    def _format_error(self, exc: Exception) -> str:
        if HAS_CLEANER and cleaner and isinstance(exc, cleaner.HttpError):
            return f"HTTP {exc.status}"
        msg = str(exc).strip()
        if len(msg) > 200:
            return f"{msg[:200].rstrip()}..."
        return msg or "Unknown error"

    def _parse_max_projects(self) -> int:
        raw = self.max_projects_var.get().strip()
        if not raw:
            return 0
        try:
            value = int(raw)
        except ValueError:
            return 0
        return max(value, 0)

    def _extract_plan_label(self, data: Dict[str, Any]) -> str:
        if not isinstance(data, dict):
            return "unknown"
        direct = data.get("plan") or data.get("billingPlan") or data.get("stripePlan")
        if direct:
            return str(direct)
        billing = data.get("billing")
        if isinstance(billing, dict):
            plan = billing.get("plan") or billing.get("tier") or billing.get("name")
            if plan:
                return str(plan)
        return "unknown"

    def _get_selected_profile(self) -> Optional[Any]:
        name = self.profile_var.get().strip()
        for p in self.profiles:
            if p.name == name:
                return p
        return None

    def _load_remote(self) -> None:
        if not HAS_CLEANER or not cleaner:
            messagebox.showerror("Remote load", "Cleaner module not available.")
            return
        profile = self._get_selected_profile()
        if not profile:
            messagebox.showwarning("Remote load", "No profile selected.")
            return
        if not self.vercel_var.get() and not self.v0_var.get():
            messagebox.showwarning("Remote load", "Select at least one provider.")
            return

        self.status_var.set("Loading remote sources...")
        self.root.update_idletasks()
        sources: List[EnvSource] = []
        info_lines: List[str] = []

        if self.vercel_var.get():
            try:
                v_sources, v_info = self._fetch_vercel_sources(profile)
            except Exception as exc:
                v_sources = []
                v_info = [f"Vercel [{profile.name}]", f"  - Error: {self._format_error(exc)}"]
                messagebox.showerror("Vercel load failed", self._format_error(exc))
            sources.extend(v_sources)
            info_lines.extend(v_info)

        if self.v0_var.get():
            try:
                z_sources, z_info = self._fetch_v0_sources(profile)
            except Exception as exc:
                z_sources = []
                z_info = [f"v0 [{profile.name}]", f"  - Error: {self._format_error(exc)}"]
                messagebox.showerror("v0 load failed", self._format_error(exc))
            sources.extend(z_sources)
            info_lines.extend(z_info)

        self.remote_sources = sources
        self._set_account_text("\n".join(info_lines).strip())
        self._rebuild_sources()
        self.status_var.set(f"Loaded {len(sources)} remote sources.")

    def _clear_remote(self) -> None:
        self.remote_sources = []
        self._set_account_text("")
        self._rebuild_sources()

    def _fetch_vercel_sources(self, profile: Any) -> Tuple[List[EnvSource], List[str]]:
        info_lines: List[str] = [f"Vercel [{profile.name}]"]
        if not getattr(profile, "vercel", None) or not profile.vercel.token:
            info_lines.append("  - Missing Vercel token")
            return [], info_lines

        vc = cleaner.VercelClient(
            profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug
        )

        try:
            user_data = vc.user_info()
            user = user_data.get("user") if isinstance(user_data.get("user"), dict) else user_data
            username = ""
            if isinstance(user, dict):
                username = user.get("username") or user.get("email") or user.get("id") or ""
            plan = self._extract_plan_label(user if isinstance(user, dict) else {})
            if username:
                info_lines.append(f"  - User: {username} | plan={plan}")
        except Exception as exc:
            info_lines.append(f"  - User: error ({self._format_error(exc)})")

        if profile.vercel.team_id or profile.vercel.team_slug:
            info_lines.append(
                f"  - Scope: teamId={profile.vercel.team_id or '-'} slug={profile.vercel.team_slug or '-'}"
            )

        try:
            teams = vc.teams_list()
            if teams:
                info_lines.append("  - Teams:")
                for t in teams:
                    name = t.get("name") or t.get("slug") or t.get("id")
                    slug = t.get("slug") or "-"
                    tid = t.get("id") or "-"
                    plan = self._extract_plan_label(t)
                    info_lines.append(f"    - {name} | slug={slug} | id={tid} | plan={plan}")
        except Exception as exc:
            info_lines.append(f"  - Teams: error ({self._format_error(exc)})")

        try:
            projects = vc.projects_all()
        except Exception as exc:
            info_lines.append(f"  - Projects: error ({self._format_error(exc)})")
            return [], info_lines

        filter_text = self.project_filter_var.get().strip().lower()
        if filter_text:
            projects = [p for p in projects if filter_text in str(p.get("name") or "").lower()]

        max_projects = self._parse_max_projects()
        if max_projects:
            projects = projects[:max_projects]

        info_lines.append(f"  - Projects found: {len(projects)}")

        sources: List[EnvSource] = []
        env_ok = 0
        env_fail = 0
        for project in projects:
            project_id = project.get("id") or project.get("name") or ""
            project_name = project.get("name") or project_id or "unknown"
            if not project_id:
                continue

            try:
                envs = vc.env_list(project_id, decrypt=self.decrypt_var.get(), git_branch="")
                if envs:
                    env_ok += 1
            except Exception as exc:
                env_fail += 1
                info_lines.append(
                    f"  - Env: {project_name} error ({self._format_error(exc)})"
                )
                continue
            by_target: Dict[str, EnvSource] = {}

            for ev in envs:
                key = str(ev.get("key") or "").strip()
                if not key:
                    continue
                value = ev.get("value") if "value" in ev else None
                targets = ev.get("target") or []
                if isinstance(targets, str):
                    targets = [targets]
                if not targets:
                    targets = ["unspecified"]
                for target in targets:
                    src = by_target.get(target)
                    if not src:
                        src_name = f"Vercel[{profile.name}]: {project_name} [{target}]"
                        src = EnvSource(
                            name=src_name,
                            kind="vercel",
                            meta={
                                "provider": "Vercel",
                                "profile": profile.name,
                                "team": profile.vercel.team_slug or profile.vercel.team_id or "",
                                "project": project_name,
                                "project_id": str(project_id),
                                "level": str(target),
                            },
                        )
                        by_target[target] = src
                    src.values[key] = str(value) if value is not None else None
                    src.key_meta[key] = {
                        "type": str(ev.get("type") or ""),
                        "target": str(target),
                        "id": str(ev.get("id") or ""),
                    }

            sources.extend(by_target.values())

        info_lines.append(f"  - Env loaded: {env_ok} projects with vars, {env_fail} errors")
        return sources, info_lines

    def _fetch_v0_sources(self, profile: Any) -> Tuple[List[EnvSource], List[str]]:
        info_lines: List[str] = [f"v0 [{profile.name}]"]
        if not getattr(profile, "v0", None) or not profile.v0.token:
            info_lines.append("  - Missing v0 token")
            return [], info_lines

        v0c = cleaner.V0Client(profile.v0.token)
        try:
            projects = v0c.projects_all()
        except Exception as exc:
            info_lines.append(f"  - Projects: error ({self._format_error(exc)})")
            return [], info_lines

        filter_text = self.project_filter_var.get().strip().lower()
        if filter_text:
            projects = [p for p in projects if filter_text in str(p.get("name") or "").lower()]

        max_projects = self._parse_max_projects()
        if max_projects:
            projects = projects[:max_projects]

        info_lines.append(f"  - Projects found: {len(projects)}")
        for p in projects[:15]:
            pname = p.get("name") or p.get("id") or "?"
            pid = p.get("id") or "-"
            privacy = p.get("privacy") or "-"
            v_proj = p.get("vercelProjectId") or "-"
            info_lines.append(f"    - {pname} | id={pid} | privacy={privacy} | vercel={v_proj}")
        if len(projects) > 15:
            info_lines.append(f"    ... and {len(projects) - 15} more")

        sources: List[EnvSource] = []
        env_ok = 0
        env_skip = 0
        for project in projects:
            project_id = project.get("id") or ""
            project_name = project.get("name") or project_id or "unknown"
            if not project_id:
                continue
            try:
                envs = v0c.env_list(project_id, decrypted=self.decrypt_var.get())
            except Exception:
                # v0 env-vars endpoint returns 404 for most projects (not supported)
                env_skip += 1
                continue
            if not envs:
                env_skip += 1
                continue
            src_name = f"v0[{profile.name}]: {project_name} [all]"
            src = EnvSource(
                name=src_name,
                kind="v0",
                meta={
                    "provider": "v0",
                    "profile": profile.name,
                    "project": project_name,
                    "project_id": str(project_id),
                    "level": "all",
                },
            )
            for ev in envs:
                key = str(ev.get("key") or "").strip()
                if not key:
                    continue
                value = ev.get("value") if "value" in ev else None
                src.values[key] = str(value) if value is not None else None
                src.key_meta[key] = {
                    "decrypted": str(ev.get("decrypted") or ""),
                    "id": str(ev.get("id") or ""),
                }
            if src.values:
                env_ok += 1
                sources.append(src)

        info_lines.append(f"  - Env: {env_ok} with vars, {env_skip} skipped (no env support)")
        return sources, info_lines

    def _get_selected_key(self) -> Optional[str]:
        selection = self.table.selection()
        if not selection:
            return None
        values = self.table.item(selection[0], "values")
        if not values:
            return None
        return str(values[0])

    def _edit_selected(self) -> None:
        src = self.selected_source
        if not src:
            return
        if src.is_readonly():
            messagebox.showinfo("Read-only source", "This source is read-only.")
            return
        key = self._get_selected_key()
        if not key:
            return
        value = src.values.get(key) or ""
        result = self._open_editor("Edit variable", key, value, allow_key_edit=True)
        if not result:
            return
        new_key, new_val = result
        if new_key != key:
            src.delete_key(key)
        src.set_value(new_key, new_val)
        self._refresh_sources_list()
        self._refresh_table()

    def _add_entry(self) -> None:
        src = self.selected_source
        if not src:
            return
        if src.is_readonly():
            messagebox.showinfo("Read-only source", "This source is read-only.")
            return

        result = self._open_editor("Add variable", "", "", allow_key_edit=True)
        if not result:
            return
        key, val = result
        src.set_value(key, val)
        self._refresh_sources_list()
        self._refresh_table()

    def _delete_selected(self) -> None:
        src = self.selected_source
        if not src:
            return
        if src.is_readonly():
            messagebox.showinfo("Read-only source", "This source is read-only.")
            return
        key = self._get_selected_key()
        if not key:
            return
        if not messagebox.askyesno("Delete", f"Delete {key}?"):
            return
        src.delete_key(key)
        self._refresh_sources_list()
        self._refresh_table()

    def _save_current(self) -> None:
        src = self.selected_source
        if not src or src.kind != "file":
            return
        src.save()
        self._refresh_sources_list()
        self._update_status()
        self._update_actions_state()

    def _reload_current(self) -> None:
        src = self.selected_source
        if not src:
            return
        if src.kind in ("vercel", "v0"):
            messagebox.showinfo("Remote source", "Use 'Load remote' to refresh remote sources.")
            return
        if src.kind == "file" and src.dirty:
            choice = messagebox.askyesno(
                "Discard changes",
                "Reloading will discard unsaved changes. Continue?",
            )
            if not choice:
                return
        src.load()
        self._refresh_sources_list()
        self._refresh_table()

    def _add_env_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Select .env file",
            initialdir=str(self.repo_root),
            filetypes=[("Env files", "*.env*"), ("All files", "*.*")],
        )
        if not path:
            return
        p = Path(path)
        src = EnvSource(name=f"Local: {p.name}", kind="file", path=p)
        src.load()
        self.local_sources.append(src)
        self._rebuild_sources()

    def _open_editor(
        self, title: str, key: str, value: str, allow_key_edit: bool = True
    ) -> Optional[Tuple[str, str]]:
        win = tk.Toplevel(self.root)
        win.title(title)
        win.geometry("520x260")
        win.transient(self.root)
        win.grab_set()

        ttk.Label(win, text="Key").pack(anchor="w", padx=12, pady=(12, 2))
        key_var = tk.StringVar(value=key)
        key_entry = ttk.Entry(win, textvariable=key_var, state="normal" if allow_key_edit else "disabled")
        key_entry.pack(fill=tk.X, padx=12)

        ttk.Label(win, text="Value").pack(anchor="w", padx=12, pady=(12, 2))
        value_var = tk.StringVar(value=value)
        value_entry = ttk.Entry(win, textvariable=value_var)
        value_entry.pack(fill=tk.X, padx=12)

        hint = ttk.Label(win, text="Note: values are stored as plain text in .env files.")
        hint.pack(anchor="w", padx=12, pady=(8, 0))

        result: List[Tuple[str, str]] = []

        def on_ok() -> None:
            k = key_var.get().strip()
            if not k:
                messagebox.showwarning("Missing key", "Key cannot be empty.")
                return
            result.append((k, value_var.get()))
            win.destroy()

        def on_cancel() -> None:
            win.destroy()

        buttons = ttk.Frame(win)
        buttons.pack(fill=tk.X, pady=12, padx=12)
        ttk.Button(buttons, text="Cancel", command=on_cancel).pack(side=tk.RIGHT)
        ttk.Button(buttons, text="Save", command=on_ok).pack(side=tk.RIGHT, padx=6)

        key_entry.focus_set()
        win.wait_window()
        return result[0] if result else None

    def _obfuscate(self, value: Optional[str]) -> str:
        if value is None:
            return "<hidden>"
        if value == "":
            return "<empty>"
        n = len(value)
        if n <= 6:
            return "*" * n
        return f"{value[:3]}{'*' * (n - 6)}{value[-3:]}"

    def _suspect_checks(self, key: str, value: Optional[str]) -> List[str]:
        issues: List[str] = []
        if value is None:
            return issues
        k = key.upper()
        v = value.strip()
        if not v:
            if any(w in k for w in ("KEY", "TOKEN", "SECRET", "PASSWORD", "URL")):
                issues.append("empty value for a key/token/secret")
        if v and len(v) < 8 and any(w in k for w in ("KEY", "TOKEN", "SECRET")):
            issues.append(f"suspiciously short ({len(v)} chars)")
        if k == "VERCEL_TOKEN" and len(v) < 20:
            issues.append("Vercel tokens are usually longer")
        if "localhost" in v and "PROD" in k:
            issues.append("localhost in production variable")
        if k == "NODE_ENV" and v not in ("development", "production", "test"):
            issues.append(f"unusual NODE_ENV value: {v}")
        if k.startswith("NEXT_PUBLIC_") and any(
            w in k for w in ("SECRET", "TOKEN", "PASSWORD")
        ):
            issues.append("secret exposed as NEXT_PUBLIC_")
        return issues

    def _export_report(self) -> None:
        if not self.sources:
            messagebox.showinfo("Export", "No sources loaded.")
            return

        win = tk.Toplevel(self.root)
        win.title("Export Report")
        win.geometry("420x260")
        win.transient(self.root)
        win.grab_set()

        obfuscate_var = tk.BooleanVar(value=True)
        include_diff_var = tk.BooleanVar(value=True)
        include_suspects_var = tk.BooleanVar(value=True)
        include_account_var = tk.BooleanVar(value=True)

        ttk.Label(win, text="Export options", font=("Segoe UI", 12, "bold")).pack(
            anchor="w", padx=12, pady=(12, 6)
        )
        ttk.Checkbutton(
            win, text="Obfuscate values (same char count)", variable=obfuscate_var
        ).pack(anchor="w", padx=20)
        ttk.Checkbutton(
            win, text="Include cross-source diff", variable=include_diff_var
        ).pack(anchor="w", padx=20)
        ttk.Checkbutton(
            win, text="Include suspect warnings", variable=include_suspects_var
        ).pack(anchor="w", padx=20)
        ttk.Checkbutton(
            win, text="Include account / team info", variable=include_account_var
        ).pack(anchor="w", padx=20)

        result_path: List[str] = []

        def do_export() -> None:
            path = filedialog.asksaveasfilename(
                parent=win,
                title="Save report",
                initialdir=str(self.repo_root / "vercel_gui"),
                initialfile=f"env_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
            )
            if not path:
                return
            report = self._generate_report(
                obfuscate=obfuscate_var.get(),
                include_diff=include_diff_var.get(),
                include_suspects=include_suspects_var.get(),
                include_account=include_account_var.get(),
            )
            Path(path).write_text(report, encoding="utf-8")
            result_path.append(path)
            win.destroy()
            messagebox.showinfo("Export", f"Report saved to:\n{path}")

        btns = ttk.Frame(win)
        btns.pack(fill=tk.X, padx=12, pady=12)
        ttk.Button(btns, text="Cancel", command=win.destroy).pack(side=tk.RIGHT)
        ttk.Button(btns, text="Export", command=do_export).pack(side=tk.RIGHT, padx=6)
        win.wait_window()

    def _generate_report(
        self,
        obfuscate: bool,
        include_diff: bool,
        include_suspects: bool,
        include_account: bool,
    ) -> str:
        lines: List[str] = []
        sep = "=" * 80
        sub_sep = "-" * 60
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        lines.append(sep)
        lines.append(f"  SAJTMASKIN ENV REPORT  |  {ts}")
        lines.append(f"  Repo root: {self.repo_root}")
        lines.append(f"  Sources loaded: {len(self.sources)}")
        lines.append(f"  Obfuscated: {'yes' if obfuscate else 'NO (plaintext!)'}")
        lines.append(sep)

        def fmt(val: Optional[str]) -> str:
            if val is None:
                return "<hidden>"
            if val == "":
                return "<empty>"
            return self._obfuscate(val) if obfuscate else val

        if include_account:
            lines.append("")
            lines.append("ACCOUNTS / TEAMS")
            lines.append(sub_sep)
            acct_text = self.account_text.get("1.0", "end-1c").strip()
            if acct_text:
                lines.append(acct_text)
            else:
                lines.append("(no account info loaded)")

        all_suspects: List[Tuple[str, str, List[str]]] = []

        for src in self.sources:
            lines.append("")
            lines.append(sep)
            lines.append(f"SOURCE: {src.name}")
            lines.append(f"  kind={src.kind}")
            if src.path:
                lines.append(f"  path={src.path}")
            if src.meta:
                for mk, mv in sorted(src.meta.items()):
                    lines.append(f"  {mk}={mv}")
            lines.append(f"  vars={len(src.values)}")
            lines.append(sub_sep)

            for key in sorted(src.values.keys()):
                value = src.values.get(key)
                cat = categorize_key(key)
                char_count = len(value) if value is not None else 0
                displayed = fmt(value)
                line = f"  {key}={displayed}  [{cat}] ({char_count} chars)"

                if include_suspects:
                    issues = self._suspect_checks(key, value)
                    if issues:
                        line += f"  !! {'; '.join(issues)}"
                        all_suspects.append((src.name, key, issues))

                lines.append(line)

        if include_diff and len(self.sources) >= 2:
            lines.append("")
            lines.append(sep)
            lines.append("CROSS-SOURCE DIFF")
            lines.append(sub_sep)

            local_sources = [s for s in self.sources if s.kind == "file"]
            remote_sources = [s for s in self.sources if s.kind in ("vercel", "v0")]

            pairs: List[Tuple[EnvSource, EnvSource]] = []
            for ls in local_sources:
                for rs in remote_sources:
                    pairs.append((ls, rs))
            if len(local_sources) >= 2:
                pairs.append((local_sources[0], local_sources[1]))

            for left, right in pairs:
                lines.append("")
                lines.append(f"  [{left.name}]  vs  [{right.name}]")
                lines.append(f"  {'~' * 50}")

                all_keys = sorted(set(left.values.keys()) | set(right.values.keys()))
                only_left: List[str] = []
                only_right: List[str] = []
                changed: List[str] = []
                same_count = 0
                unknown_count = 0

                for key in all_keys:
                    l_has = key in left.values
                    r_has = key in right.values
                    l_val = left.values.get(key)
                    r_val = right.values.get(key)

                    if l_has and not r_has:
                        only_left.append(key)
                    elif r_has and not l_has:
                        only_right.append(key)
                    elif l_val is None or r_val is None:
                        unknown_count += 1
                    elif normalize_value(l_val) != normalize_value(r_val):
                        changed.append(key)
                    else:
                        same_count += 1

                lines.append(f"  same={same_count}  changed={len(changed)}  only-left={len(only_left)}  only-right={len(only_right)}  unknown={unknown_count}")

                if only_left:
                    lines.append(f"  ONLY in [{left.name}]:")
                    for k in only_left:
                        lines.append(f"    - {k}={fmt(left.values.get(k))}")
                if only_right:
                    lines.append(f"  ONLY in [{right.name}]:")
                    for k in only_right:
                        lines.append(f"    - {k}={fmt(right.values.get(k))}")
                if changed:
                    lines.append(f"  CHANGED:")
                    for k in changed:
                        lv = left.values.get(k)
                        rv = right.values.get(k)
                        lc = len(lv) if lv else 0
                        rc = len(rv) if rv else 0
                        lines.append(f"    - {k}")
                        lines.append(f"        left  ({lc} chars): {fmt(lv)}")
                        lines.append(f"        right ({rc} chars): {fmt(rv)}")

        if include_suspects and all_suspects:
            lines.append("")
            lines.append(sep)
            lines.append("SUSPECT WARNINGS")
            lines.append(sub_sep)
            for src_name, key, issues in all_suspects:
                lines.append(f"  [{src_name}] {key}: {'; '.join(issues)}")

        lines.append("")
        lines.append(sep)
        lines.append(f"  END OF REPORT  |  {ts}")
        lines.append(sep)
        lines.append("")

        return "\n".join(lines)

    def _on_close(self) -> None:
        if self.selected_source and self.selected_source.kind == "file" and self.selected_source.dirty:
            choice = messagebox.askyesnocancel("Unsaved changes", "Save changes before exit?")
            if choice is None:
                return
            if choice:
                self._save_current()
        self.root.destroy()


def main() -> None:
    start = Path(__file__).resolve()
    repo_root = find_repo_root(start.parent)

    if USE_TTKB and ttkb:
        root = ttkb.Window(themename=TTKB_THEME)
    else:
        root = tk.Tk()
        try:
            style = ttk.Style()
            if "vista" in style.theme_names():
                style.theme_use("vista")
        except Exception:
            pass

    EnvGuiApp(root, repo_root)
    root.mainloop()


if __name__ == "__main__":
    main()
