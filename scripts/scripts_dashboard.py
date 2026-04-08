#!/usr/bin/env python3
"""
Scripts dashboard for manual pipeline operations.

Opens a Tkinter GUI where you can run script commands one-by-one, in checked
sequence, or with predefined "run all" presets.
"""

from __future__ import annotations

import json
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

from dashboard_shared import format_prompt_dump_status_lines


REPO_ROOT = Path(__file__).resolve().parent.parent
NPM_CMD = "npm.cmd" if os.name == "nt" else "npm"
PYTHON_CMD = sys.executable

BUILDER_TEMPLATES_PATH = REPO_ROOT / "src" / "lib" / "templates" / "templates.json"
BUILDER_TEMPLATE_EMBEDDINGS_PATH = REPO_ROOT / "src" / "lib" / "templates" / "template-embeddings.json"
EXTERNAL_TEMPLATE_LIBRARY_PATH = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
EXTERNAL_TEMPLATE_LIBRARY_EMBEDDINGS_PATH = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
SCAFFOLD_RESEARCH_PATH = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-research.generated.json"
SCAFFOLD_EMBEDDINGS_PATH = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"


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
        self.root.title("Sajtmaskin Scriptpanel")
        self.root.geometry("1360x860")
        self.root.minsize(1200, 760)

        self._command_by_id = {spec.id: spec for spec in COMMANDS}
        self._check_vars: dict[str, tk.BooleanVar] = {}
        self._output_queue: queue.Queue[str] = queue.Queue()
        self._worker_thread: threading.Thread | None = None
        self._active_process: subprocess.Popen[str] | None = None
        self._stop_requested = False

        self._build_layout()
        self._refresh_status_panel()
        self._poll_output_queue()

    def _build_layout(self) -> None:
        wrapper = ttk.Frame(self.root, padding=10)
        wrapper.pack(fill=tk.BOTH, expand=True)

        top = ttk.Frame(wrapper)
        top.pack(fill=tk.X, pady=(0, 8))

        title = ttk.Label(
            top,
            text="Sajtmaskin Scriptpanel",
            font=("Segoe UI", 13, "bold"),
        )
        title.pack(anchor=tk.W)

        subtitle = ttk.Label(
            top,
            text=(
                "Kör enstaka steg eller hela pipelines. "
                "Saker som skriver om data eller bygger om artifacts markeras som riskabla."
            ),
        )
        subtitle.pack(anchor=tk.W, pady=(2, 0))

        controls = ttk.Frame(wrapper)
        controls.pack(fill=tk.X, pady=(0, 8))

        self.run_checked_button = ttk.Button(
            controls,
            text="Kör markerade",
            command=self._run_checked_sequence,
        )
        self.run_checked_button.pack(side=tk.LEFT)

        self.run_safe_all_button = ttk.Button(
            controls,
            text="Kör säker helkörning",
            command=lambda: self._run_preset(PRESET_SAFE_ALL, "SAFE all"),
        )
        self.run_safe_all_button.pack(side=tk.LEFT, padx=(8, 0))

        self.run_full_all_button = ttk.Button(
            controls,
            text="Rensa och bygg om allt",
            command=lambda: self._run_preset(PRESET_FULL_ALL, "FULL all"),
        )
        self.run_full_all_button.pack(side=tk.LEFT, padx=(8, 0))

        self.stop_button = ttk.Button(
            controls,
            text="Stoppa aktiv körning",
            command=self._stop_active_process,
            state=tk.DISABLED,
        )
        self.stop_button.pack(side=tk.LEFT, padx=(16, 0))

        self.clear_button = ttk.Button(
            controls,
            text="Rensa logg",
            command=self._clear_log,
        )
        self.clear_button.pack(side=tk.LEFT, padx=(8, 0))

        self.auto_confirm_var = tk.BooleanVar(value=False)
        auto_confirm = ttk.Checkbutton(
            controls,
            variable=self.auto_confirm_var,
            text="Bekräfta riskabla kommandon automatiskt",
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
        self._build_explanation_panel(parent)
        self._build_terms_panel(parent)
        self._build_button_help_panel(parent)
        self._build_runtime_usage_panel(parent)
        self._build_status_panel(parent)

        groups = ["Artifacts", "Scaffolds", "Template Library", "v0 Templates", "Quality"]
        for group in groups:
            frame = ttk.LabelFrame(parent, text=group, padding=8)
            frame.pack(fill=tk.X, pady=(0, 8))
            for spec in [item for item in COMMANDS if item.group == group]:
                self._build_command_row(frame, spec)

    def _build_explanation_panel(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text="Vad är vad?", padding=8)
        frame.pack(fill=tk.X, pady=(0, 8))

        lines = [
            "Mallar i buildern = src/lib/templates/*",
            "Detta är builderns Mallar-tab och byggs från templates_v0/out/*.",
            "",
            "Scaffolds = src/lib/gen/scaffolds/*",
            "Detta är interna startpunkter som own-engine använder vid codegen.",
            "Scaffold family = scaffoldens runtime-bucket i registret.",
            "Exempel: auth-pages/manifest.ts -> registry.ts -> matcher -> system prompt -> own-engine.",
            "",
            "Template-library = src/lib/gen/template-library/*",
            "Det är den kuraterade referensartefakten som byggs från data/external-template-pipeline/*.",
            "Externa referenser / rå research lever främst under data/external-template-pipeline/*.",
            "README i template-library betyder README.md från det externa referensrepot, inte detta repo.",
            "",
            "e2e/vercel-templates = automatisk hämtning av externa Vercel-mallar.",
            "Det är intake/research, inte runtime.",
            "",
            "Embeddingsfiler är förgenererade artifacts.",
            "Vanliga requests kan skapa en query-embedding, men bygger inte om hela filerna.",
        ]
        label = ttk.Label(frame, text="\n".join(lines), justify=tk.LEFT)
        label.pack(anchor=tk.W)

        llm_frame = ttk.LabelFrame(parent, text="Vad skickas till LLM?", padding=8)
        llm_frame.pack(fill=tk.X, pady=(0, 8))
        llm_lines = [
            "Direkt input idag:",
            "- user-turn / senaste användarmeddelandet (skickas separat; dupliceras inte som extra originalprompt i systemprompten)",
            "- brief / spec om den finns",
            "- route plan (provenance.primarySource + provenance.sources[])",
            "- pre-generation contracts",
            "- scaffold-kontext (filträd + kritiska scaffold-filer)",
            "- scaffold-traits i prompten (serialize.ts använder etiketterna structure_profile, content_profile, site_kind, complexity, features)",
            "- tema / designreferenser / media-katalog / custom instructions",
            "",
            "Inte direkt runtime-input:",
            "- hela externa repos",
            "- fulla dossiers",
            "",
            "Dossiers kondenseras först till:",
            "- template-library.generated.json",
            "- scaffold-research.generated.json",
            "",
            "Du kan köra hela ombyggnaden manuellt via:",
            "- Artifacts: smart rebuild (reuse cache)",
            "- Rensa och bygg om allt",
        ]
        llm_label = ttk.Label(llm_frame, text="\n".join(llm_lines), justify=tk.LEFT)
        llm_label.pack(anchor=tk.W)

    def _build_terms_panel(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text="BuildSpec och kedjetermer", padding=8)
        frame.pack(fill=tk.X, pady=(0, 8))
        lines = [
            "buildIntent = vad som byggs: website / app / template",
            "generationMode = init (första bygget) eller followUp (ändra befintligt)",
            "changeScope = vilken typ av ändring: copy / local-layout / page-addition / redesign / integration",
            "qualityTarget = kvalitetsnivå: standard / premium / release-candidate (deriveBuildSpec i build-spec.ts; skilj från manifest qualityToOwnEngineModel)",
            "previewPolicy = previewnivå: fidelity2 / fidelity3",
            "verificationPolicy = kontrollnivå: fast / standard / strict",
            "contextPolicy = kontextnivå: light / normal / heavy",
            "routePlan.siteType = sidtyp: one-page / brochure / content-heavy / app-shell",
            "routePlan.provenance.primarySource = brief / prompt / scaffold (brief vinner; annars scaffold om defaults la till routes; annars prompt)",
            "routePlan.provenance.sources = ordnad lista av bidrag (t.ex. prompt → scaffold)",
            "scaffoldFamily = vald runtime-scaffold-bucket",
            "",
            "Repo-ratt stegordning före codegen-stream (orchestrate.ts):",
            "resolveOrchestrationBase: scaffold → buildRoutePlan → inferPreGenerationContracts → deriveBuildSpec → buildOrchestrationContract → serializeScaffoldForPrompt;",
            "därefter finalizeOrchestrationPrompts → buildDynamicContext (system-prompt.ts) = faktisk LLM-input;",
            "pruning/meta: DynamicContextPruning i generation-input-package + orchestration-dynamic/meta.json;",
            "kartläggning: docs/architecture/llm-input-blocks.md.",
            "",
            "Efter codegen (Steg 4): finalizeAndSaveVersion — se docs/architecture/step4-post-generation.md;",
            "hotspots/testplan: docs/plans/active/step4-quality-hotspots-and-verification.md.",
            "",
            "Användning i kedjan:",
            "- BuildSpec sätts i orchestrate.ts under orkestreringen, före promptbygget",
            "- contextPolicy styr tokenbudgetar och scaffold-serialisering",
            "- routePlan och contracts styr vilka sidor och integrationer som ska med",
            "- scaffoldFamily påverkar scaffold-kontext och referenskategorier",
            "- dashboarden beskriver runtime, men runtimekoden är alltid source of truth",
        ]
        label = ttk.Label(frame, text="\n".join(lines), justify=tk.LEFT)
        label.pack(anchor=tk.W)

        dump_frame = ttk.LabelFrame(parent, text="Prompt-dumps och stale-risk", padding=8)
        dump_frame.pack(fill=tk.X, pady=(0, 8))
        dump_lines = [
            "Prompt-dumps skrivs bara när SAJTMASKIN_PROMPT_DUMP är på.",
            "Orchestration-dynamic skriver latest.md + generation-input-package.json.",
            "De andra kategorierna har egna filer: own-engine-codegen och plan-mode-planner.",
            "Om dumpning är avstängd markeras kategorin som disabled och gamla payloadfiler ska betraktas som stale-risk.",
            "Använd dumps för felsökning, inte som permanent source of truth.",
        ]
        dump_label = ttk.Label(dump_frame, text="\n".join(dump_lines), justify=tk.LEFT)
        dump_label.pack(anchor=tk.W)

    def _build_button_help_panel(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text="Vad händer om jag trycker här?", padding=8)
        frame.pack(fill=tk.X, pady=(0, 8))
        lines = [
            "Kör säker helkörning = rensar artifacts, återanvänder scrape-cache/repo-cache, bygger om v0-mallar, externa referenser, scaffolds, embeddings, eval och typecheck.",
            "Rensa och bygg om allt = samma som ovan men kör också ny full scrape av externa Vercel-mallar.",
            "Scaffolds: all = kör scaffold-pipelinen från import/hydrate/build till embeddings/eval/verify.",
            "Template pipeline: refresh reuse cache = bygger om externa referenser utan ny scrape.",
            "v0 templates: local refresh + embeddings = bygger om Mallar-tab + dess embeddings lokalt.",
        ]
        label = ttk.Label(frame, text="\n".join(f"- {line}" for line in lines), justify=tk.LEFT)
        label.pack(anchor=tk.W)

    def _build_runtime_usage_panel(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text="Vad används direkt av runtime?", padding=8)
        frame.pack(fill=tk.X, pady=(0, 8))
        lines = [
            "Ja:",
            "- src/lib/templates/templates.json",
            "- src/lib/templates/template-embeddings.json",
            "- src/lib/gen/scaffolds/* (manifest + scaffold research + scaffold embeddings)",
            "",
            "Inte direkt:",
            "- e2e/vercel-templates/*",
            "- data/external-template-pipeline/raw-discovery/*",
            "- data/external-template-pipeline/repo-cache/*",
            "- data/external-template-pipeline/reference-library/* (dossiers)",
            "- fulla externa repos",
            "",
            "Dossiers kondenseras först till runtime-/buildartefakter:",
            "- src/lib/gen/template-library/template-library.generated.json",
            "- src/lib/gen/scaffolds/scaffold-research.generated.json",
        ]
        label = ttk.Label(frame, text="\n".join(lines), justify=tk.LEFT)
        label.pack(anchor=tk.W)

    def _build_status_panel(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text="Artifact-status", padding=8)
        frame.pack(fill=tk.BOTH, pady=(0, 8))

        button_row = ttk.Frame(frame)
        button_row.pack(fill=tk.X, pady=(0, 6))

        refresh_button = ttk.Button(
            button_row,
            text="Uppdatera status",
            command=self._refresh_status_panel,
        )
        refresh_button.pack(side=tk.LEFT)

        self.status_text = ScrolledText(
            frame,
            wrap=tk.WORD,
            height=16,
            font=("Cascadia Mono", 9),
            state=tk.DISABLED,
        )
        self.status_text.pack(fill=tk.BOTH, expand=True)

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

    def _load_json(self, path: Path):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _format_status_lines(self) -> list[str]:
        lines: list[str] = []

        templates = self._load_json(BUILDER_TEMPLATES_PATH) or []
        template_embeddings = self._load_json(BUILDER_TEMPLATE_EMBEDDINGS_PATH) or {}
        template_entries = len(templates) if isinstance(templates, list) else 0
        template_embedding_count = (
            template_embeddings.get("_meta", {}).get("count")
            if isinstance(template_embeddings, dict)
            else None
        )
        lines.extend([
            "Mallar i buildern",
            f"  templates.json count: {template_entries}",
            f"  template-embeddings.json count: {template_embedding_count}",
            f"  parity: {'OK' if template_entries == template_embedding_count else 'MISMATCH'}",
            f"  generated: {template_embeddings.get('_meta', {}).get('generated') if isinstance(template_embeddings, dict) else None}",
            "",
        ])

        library = self._load_json(EXTERNAL_TEMPLATE_LIBRARY_PATH) or {}
        library_embeddings = self._load_json(EXTERNAL_TEMPLATE_LIBRARY_EMBEDDINGS_PATH) or {}
        library_entry_count = len(library.get("entries", [])) if isinstance(library, dict) else 0
        library_embedding_count = (
            library_embeddings.get("_meta", {}).get("count")
            if isinstance(library_embeddings, dict)
            else None
        )
        lines.extend([
            "Externa referenser",
            f"  template-library.generated.json entries: {library_entry_count}",
            f"  template-library-embeddings.json count: {library_embedding_count}",
            f"  parity: {'OK' if library_entry_count == library_embedding_count else 'MISMATCH'}",
            f"  generated: {library_embeddings.get('_meta', {}).get('generated') if isinstance(library_embeddings, dict) else None}",
            "",
        ])

        scaffold_research = self._load_json(SCAFFOLD_RESEARCH_PATH) or {}
        scaffold_embeddings = self._load_json(SCAFFOLD_EMBEDDINGS_PATH) or {}
        scaffold_count = len(scaffold_research.get("scaffolds", {})) if isinstance(scaffold_research, dict) else 0
        scaffold_embedding_count = (
            scaffold_embeddings.get("_meta", {}).get("count")
            if isinstance(scaffold_embeddings, dict)
            else None
        )
        lines.extend([
            "Aktiva scaffolds",
            f"  scaffold-research.generated.json scaffolds: {scaffold_count}",
            f"  scaffold-embeddings.json count: {scaffold_embedding_count}",
            f"  parity: {'OK' if scaffold_count == scaffold_embedding_count else 'MISMATCH'}",
            f"  generated: {scaffold_embeddings.get('_meta', {}).get('generated') if isinstance(scaffold_embeddings, dict) else None}",
            f"  runtime scaffold ids: {', '.join(sorted(scaffold_research.get('scaffolds', {}).keys())) if isinstance(scaffold_research, dict) else ''}",
            "",
        ])

        lines.extend([
            "Källvägar",
            "  Mallar i buildern <- templates_v0/out/* -> src/lib/templates/*",
            "  Extern intake <- e2e/vercel-templates/* -> data/external-template-pipeline/*",
            "  Externa referenser <- data/external-template-pipeline/* -> src/lib/gen/template-library/*",
            "  Scaffolds <- src/lib/gen/scaffolds/* + scaffold research overlays",
            "",
        ])

        lines.append("")
        lines.extend(
            format_prompt_dump_status_lines(
                REPO_ROOT,
                env_value=os.environ.get("SAJTMASKIN_PROMPT_DUMP"),
            )
        )

        return lines

    def _refresh_status_panel(self) -> None:
        if not hasattr(self, "status_text"):
            return
        self.status_text.configure(state=tk.NORMAL)
        self.status_text.delete("1.0", tk.END)
        self.status_text.insert(tk.END, "\n".join(self._format_status_lines()) + "\n")
        self.status_text.see("1.0")
        self.status_text.configure(state=tk.DISABLED)

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
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        self._output_queue.put(
                            "[dashboard] Graceful stop timed out, killing process..."
                        )
                        proc.kill()
                        proc.wait(timeout=5)
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
            self.root.after(0, self._refresh_status_panel)

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
        try:
            if self._active_process.poll() is None:
                self._active_process.terminate()
        except Exception as error:  # pragma: no cover - GUI guard
            self._append_line(f"[dashboard] Failed to terminate process cleanly: {error}")

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
