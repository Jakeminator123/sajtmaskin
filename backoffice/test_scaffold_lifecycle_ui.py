"""Grindar för Fas B: verb-tabbar, farlig zon och ett språk per fält.

Bakgrund: `Scaffolds & varianter` blandade tidigare titta/skapa/ändra/radera över
sex tabbar, raderingarna hade tre olika friktionsnivåer (kryssruta för variant,
inskriven text för scaffold och baseline) och samma manifestfält hette olika sak
på tre ytor (`Label` i lifecycle/wizard, `Tags (en per rad)` i scaffolds-editorn).

Tre saker måste hållas sanna över tid:

1. **Tabbstrukturen** — fem tabbar i verbordning, och allt destruktivt ligger i
   `Farlig zon` (inte utspritt i skapa-/ändra-flödena).
2. **Bekräftelsemönstret** — varje radering går via `confirm_by_typing`, och
   säkerhetskopieringen (`backup_file`/`backup_tree`) ligger kvar före raderingen.
3. **Fältetiketterna** — ytorna använder `field_label` i stället för egna
   strängar, så samma fält aldrig kan få två namn igen.

Tabb- och bekräftelsegrindarna läser koden med `ast` i stället för att rendera
Streamlit (som kräver en runtime). Det är strukturen som ska hållas fast, inte
pixlarna.
"""

from __future__ import annotations

import ast
import inspect
import json
import re
import textwrap
import unittest
from unittest import mock

from backoffice import REPO_ROOT
from backoffice import shared
from backoffice.pages import scaffold_lifecycle as sl
from backoffice.pages import scaffold_wizard as sw
from backoffice.shared import FIELD_LABELS, confirm_by_typing, danger_zone, field_label

EXPECTED_TABS = ("Titta", "Skapa", "Ändra", "Farlig zon", "Underhåll")

DESTRUCTIVE_RENDERERS = (
    "_render_delete_variant",
    "_render_delete_scaffold",
    "_render_baseline_tab",
)

# Engelska etiketter som Fas B ersatte. Dyker någon upp igen står två språk för
# samma fält på ytorna, vilket var hela poängen med att införa `field_label`.
BANNED_LABEL_LITERALS = (
    '"Label"',
    '"Description"',
    '"Site Kind"',
    '"Complexity"',
    '"Structure Profile"',
    '"Content Profile"',
    '"Color Mode"',
    '"Signature Motif"',
    '"Allowed Build Intents"',
    '"Default variant"',
    '"Default-variant"',
    '"Advanced fields"',
    "Tags (one per line)",
    "Tags (en per rad)",
    "Keywords (one per line)",
    "Prompt Hints (one per line)",
    "Prompt Hints (en per rad)",
    "Prompt Hints (minst",
    "Quality Checklist (one per line)",
    "Quality Checklist (en per rad)",
    "Quality Checklist (minst",
    "Font Pairings (",
    "Theme Tokens (",
    "Signature layouts",
    "Signature motifs",
    "Signature antiPatterns",
    "Style Rules (",
    "Section Inventory (",
    "Avoid Patterns (",
    "World Class Rubric (",
    "Source Template IDs (",
    "Reference Scaffold IDs (",
    "Features (one per line)",
    "Research Upgrade Targets (",
    "Create neutral starter variant",
)

LABEL_SURFACES = (
    "backoffice/pages/scaffold_lifecycle.py",
    "backoffice/pages/scaffold_lifecycle_lib/ui_danger.py",
    "backoffice/pages/scaffolds.py",
    "backoffice/pages/scaffold_wizard.py",
)

# Autorun-kedjan är en del av sparningen: "Skapa nu" sätter `swz_autorun` och
# nästa render kör `_post_create_steps` automatiskt. Skrivplanen listade först
# bara wizardens egna filer, så `variant-embeddings.json` skrevs om utan att
# nämnas — rutan lovade "det här skrivs" och räknade inte upp allt.
#
# Raderna nedan binder varje npm-nyckel till skriptet, till symbolen som skickas
# till write (writeFileSync eller saveEmbeddingsArtifact) och till konstanterna
# som ger sökvägen. Ett test som bara letade efter strängen
# `variant-embeddings.json` i UI:t hade tystnat den dag skriptet bytte utdata;
# det här faller i stället.
AUTORUN_WRITE_SOURCES: dict[str, dict] = {
    "scaffolds:variant-patterns": {
        "source": "scripts/scaffolds/auto-curate-variant-patterns.ts",
        "write_targets": {"ref.filePath"},
        "path_constants": (
            'const VARIANTS_ROOT = resolve(WORKSPACE_ROOT, "config", "scaffold-variants")',
            "const scaffoldDir = join(VARIANTS_ROOT, scaffoldEntry.name)",
            "filePath: join(scaffoldDir, fileEntry.name)",
        ),
        "path": "config/scaffold-variants/cafe-site/warm-clay.json",
    },
    "scaffolds:variant-embeddings": {
        "source": "scripts/scaffolds/generate-variant-embeddings.ts",
        # Blob + lokal cache via shared storage (inte längre writeFileSync(OUTPUT_PATH)).
        "write_targets": {"saveEmbeddingsArtifact:variant"},
        "path_constants": (
            'const VARIANTS_ROOT = resolve(WORKSPACE_ROOT, "config", "scaffold-variants")',
            'saveEmbeddingsArtifact("variant"',
        ),
        # Lokal cache-path (gitignored); Blob-nyckel = embeddings/variant-embeddings.json.
        "path": "config/scaffold-variants/_index/variant-embeddings.json",
        # saveEmbeddingsArtifact uppdaterar även den committade URL-manifesten vid Blob-upload.
        "extra_paths": ("config/embeddings-blob-manifest.json",),
    },
}

# Steg 3 i kedjan kör vitest och skriver inget. Undantaget är explicit och
# kontrolleras mot package.json, så det inte kan bli en glugg om kommandot byts.
READ_ONLY_AUTORUN_SCRIPTS = {"scaffolds:validate"}

WRITE_CALL_RE = re.compile(r"write(?:FileSync|File)\(\s*([A-Za-z_$][\w.$]*)")
SAVE_EMBEDDINGS_RE = re.compile(r"""saveEmbeddingsArtifact\(\s*["'](\w+)["']""")


def _npm_scripts() -> dict[str, str]:
    return json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]


def _npm_script_names(command: tuple[str, ...]) -> list[str]:
    """`("npm", "run", "x", "--", "--only=y")` → `["x"]`."""
    parts = list(command)
    return [parts[index + 1] for index, part in enumerate(parts) if part == "run"]


def _write_targets(rel_source: str) -> set[str]:
    text = (REPO_ROOT / rel_source).read_text(encoding="utf-8")
    targets = set(WRITE_CALL_RE.findall(text))
    for artifact_id in SAVE_EMBEDDINGS_RE.findall(text):
        targets.add(f"saveEmbeddingsArtifact:{artifact_id}")
    return targets


def _function_ast(func) -> ast.FunctionDef:
    tree = ast.parse(textwrap.dedent(inspect.getsource(func)))
    node = tree.body[0]
    assert isinstance(node, ast.FunctionDef)
    return node


def _called_names(node: ast.AST) -> set[str]:
    """Every function/method name called anywhere inside ``node``."""
    names: set[str] = set()
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        func = child.func
        if isinstance(func, ast.Name):
            names.add(func.id)
        elif isinstance(func, ast.Attribute):
            names.add(func.attr)
    return names


def _tab_bodies() -> dict[str, set[str]]:
    """Map tab label → names called inside that tab's ``with`` block."""
    render = _function_ast(sl.render)

    labels: list[str] = []
    variables: list[str] = []
    for node in ast.walk(render):
        if not isinstance(node, ast.Assign):
            continue
        value = node.value
        if not (
            isinstance(value, ast.Call)
            and isinstance(value.func, ast.Attribute)
            and value.func.attr == "tabs"
        ):
            continue
        labels = [
            element.value
            for element in value.args[0].elts
            if isinstance(element, ast.Constant)
        ]
        target = node.targets[0]
        assert isinstance(target, ast.Tuple)
        variables = [name.id for name in target.elts if isinstance(name, ast.Name)]
        break

    by_variable = dict(zip(variables, labels))
    bodies: dict[str, set[str]] = {}
    for node in ast.walk(render):
        if not isinstance(node, ast.With):
            continue
        context = node.items[0].context_expr
        if not isinstance(context, ast.Name) or context.id not in by_variable:
            continue
        calls: set[str] = set()
        for statement in node.body:
            calls |= _called_names(statement)
        bodies[by_variable[context.id]] = calls
    return bodies


class TabLayoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.bodies = _tab_bodies()

    def test_five_tabs_in_verb_order(self) -> None:
        self.assertEqual(tuple(self.bodies), EXPECTED_TABS)

    def test_each_renderer_sits_in_its_verb_tab(self) -> None:
        self.assertIn("_render_tree_view", self.bodies["Titta"])
        self.assertIn("_render_create_scaffold", self.bodies["Skapa"])
        self.assertIn("_render_create_variant", self.bodies["Skapa"])
        self.assertIn("_render_edit_variant", self.bodies["Ändra"])
        self.assertIn("_render_pipeline_tools", self.bodies["Underhåll"])

    def test_everything_destructive_is_in_the_danger_tab(self) -> None:
        danger = self.bodies["Farlig zon"]
        for name in DESTRUCTIVE_RENDERERS:
            self.assertIn(name, danger, f"{name} måste ligga i Farlig zon")
        for label, calls in self.bodies.items():
            if label == "Farlig zon":
                continue
            leaked = sorted(calls & set(DESTRUCTIVE_RENDERERS))
            self.assertEqual(
                leaked, [], f"destruktiv åtgärd läckte till tabben {label}: {leaked}"
            )

    def test_danger_tab_frames_each_action_in_a_danger_zone(self) -> None:
        self.assertIn("danger_zone", self.bodies["Farlig zon"])

    def test_renderer_signatures_are_unchanged(self) -> None:
        """Befintliga tester importerar dem — namn och signatur är låsta."""
        expected = {
            "_render_tree_view": [
                "ctx",
                "manifests",
                "variants_by_scaffold",
                "inspiration_lookup",
                "inspiration_sources",
                "runtime_dossier_counts",
            ],
            "_render_create_scaffold": ["ctx", "manifests"],
            "_render_create_variant": ["scaffold_ids", "ctx"],
            "_render_edit_variant": ["ctx", "scaffold_ids", "variants_by_scaffold"],
            "_render_delete_variant": ["ctx", "scaffold_ids", "variants_by_scaffold"],
            "_render_delete_scaffold": ["ctx", "scaffold_ids", "variants"],
            "_render_baseline_tab": ["ctx"],
            "_render_pipeline_tools": ["ctx"],
        }
        for name, params in expected.items():
            signature = inspect.signature(getattr(sl, name))
            self.assertEqual(list(signature.parameters), params, f"{name} bytte signatur")


class TypedConfirmationTests(unittest.TestCase):
    """Radering kräver att operatören skriver namnet — på alla tre ytorna."""

    def test_every_destructive_surface_uses_confirm_by_typing(self) -> None:
        for name in DESTRUCTIVE_RENDERERS:
            calls = _called_names(_function_ast(getattr(sl, name)))
            self.assertIn(
                "confirm_by_typing",
                calls,
                f"{name} saknar typad bekräftelse",
            )

    def test_variant_delete_no_longer_confirms_with_a_checkbox(self) -> None:
        """Kryssrutan var den svagaste friktionen och ersattes, inte kompletterades."""
        calls = _called_names(_function_ast(sl._render_delete_variant))
        self.assertNotIn("checkbox", calls)

    def test_backup_promise_still_precedes_deletion(self) -> None:
        self.assertIn("backup_file", _called_names(_function_ast(sl._render_delete_variant)))
        self.assertIn("backup_tree", _called_names(_function_ast(sl._delete_scaffold)))
        self.assertIn("backup_file", _called_names(_function_ast(sl._factory_reset_to_baseline)))


class ConfirmByTypingTests(unittest.TestCase):
    def _typed(self, value: str, expected: str = "landing-page") -> bool:
        with mock.patch.object(shared.st, "text_input", return_value=value):
            return confirm_by_typing(expected, "test_key")

    def test_exact_match_confirms(self) -> None:
        self.assertTrue(self._typed("landing-page"))

    def test_surrounding_whitespace_is_forgiven(self) -> None:
        self.assertTrue(self._typed("  landing-page \n"))

    def test_near_miss_does_not_confirm(self) -> None:
        self.assertFalse(self._typed("landing_page"))
        self.assertFalse(self._typed("landing-pages"))
        self.assertFalse(self._typed(""))

    def test_empty_expected_can_never_be_confirmed(self) -> None:
        """Fail-closed: annars vore ett orört fält ett godkännande."""
        self.assertFalse(self._typed("", expected=""))
        self.assertFalse(self._typed("   ", expected="   "))

    def test_help_text_names_the_exact_string(self) -> None:
        with mock.patch.object(shared.st, "text_input", return_value="") as text_input:
            confirm_by_typing("landing-page", "test_key", label="Skriv ID")
        _args, kwargs = text_input.call_args
        self.assertEqual(text_input.call_args[0][0], "Skriv ID")
        self.assertIn("landing-page", kwargs["help"])
        self.assertEqual(kwargs["key"], "test_key")


class DangerZoneTests(unittest.TestCase):
    def setUp(self) -> None:
        self.container = mock.MagicMock()
        patches = [
            mock.patch.object(shared.st, "container", return_value=self.container),
            mock.patch.object(shared.st, "markdown"),
            mock.patch.object(shared.st, "caption"),
        ]
        self.make, self.markdown, self.caption = [p.start() for p in patches]
        for patch in patches:
            self.addCleanup(patch.stop)

    def test_returns_a_framed_container_with_a_red_heading(self) -> None:
        returned = danger_zone("Radera variant", help_text="Tar bort filen.")
        self.assertIs(returned, self.container)
        self.make.assert_called_once_with(border=True)
        heading = self.markdown.call_args[0][0]
        self.assertIn("Radera variant", heading)
        self.assertIn("🔴", heading)
        self.caption.assert_called_once_with("Tar bort filen.")

    def test_help_text_is_optional(self) -> None:
        danger_zone("Radera scaffold")
        self.caption.assert_not_called()


class FieldLabelTests(unittest.TestCase):
    def test_technical_key_always_follows_the_swedish_label(self) -> None:
        self.assertEqual(field_label("label"), "Namn (`label`)")
        self.assertEqual(field_label("tags", hint="en per rad"), "Matchord, en per rad (`tags`)")
        self.assertEqual(
            field_label("promptHints"), "Instruktioner till own-engine (`promptHints`)"
        )

    def test_every_entry_is_swedish_and_non_empty(self) -> None:
        for key, label in FIELD_LABELS.items():
            self.assertTrue(label.strip(), f"{key} saknar etikett")
            self.assertNotIn("`", label, f"{key}: nyckeln läggs på av field_label")
            self.assertIn(f"(`{key}`)", field_label(key))

    def test_unknown_key_fails_loudly(self) -> None:
        with self.assertRaises(KeyError):
            field_label("promptHintz")


class FieldLabelParityTests(unittest.TestCase):
    """Samma fält, samma namn — på lifecycle, scaffolds-editorn och guiden."""

    def test_no_legacy_english_labels_remain(self) -> None:
        offenders: list[str] = []
        for rel in LABEL_SURFACES:
            text = (REPO_ROOT / rel).read_text(encoding="utf-8")
            offenders += [f"{rel}: {literal}" for literal in BANNED_LABEL_LITERALS if literal in text]
        self.assertEqual(
            offenders,
            [],
            "Engelsk fältetikett kvar — använd field_label(): " + ", ".join(offenders),
        )

    def test_every_surface_uses_the_shared_labels(self) -> None:
        for rel in LABEL_SURFACES:
            text = (REPO_ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("field_label", text, f"{rel} skriver egna etiketter")

    def test_fields_shown_on_several_surfaces_go_through_the_same_helper(self) -> None:
        """Ett fält som finns på flera ytor får inte ha en egen sträng på någon av dem."""
        sources = {
            rel: (REPO_ROOT / rel).read_text(encoding="utf-8") for rel in LABEL_SURFACES
        }
        for key in ("tags", "promptHints", "qualityChecklist", "allowedBuildIntents"):
            surfaces = [rel for rel, text in sources.items() if f'field_label("{key}"' in text]
            self.assertGreaterEqual(
                len(surfaces),
                2,
                f"{key} visas på flera ytor men bara {surfaces} använder field_label",
            )


class PlannedWritesTests(unittest.TestCase):
    """Steg 4 lovar vad som skrivs — löftet måste matcha `_apply`."""

    def _draft(self, mode: str) -> dict:
        draft = {
            "mode": mode,
            "variant": {"scaffoldId": "cafe-site", "id": "warm-clay"},
        }
        if mode == "new-scaffold":
            draft["scaffold"] = {"cloneFrom": "base-nextjs"}
        return draft

    def test_new_variant_writes_only_the_variant_file(self) -> None:
        self.assertEqual(
            sw._planned_writes(self._draft("new-variant")),
            ["config/scaffold-variants/cafe-site/warm-clay.json"],
        )

    def test_new_scaffold_lists_every_touched_file(self) -> None:
        paths = sw._planned_writes(self._draft("new-scaffold"))
        for expected in (
            "src/lib/gen/scaffolds/cafe-site/manifest.ts",
            "src/lib/gen/scaffolds/types.ts",
            "src/lib/gen/scaffolds/registry.ts",
            "src/lib/gen/scaffolds/scaffold-embedding-locale.ts",
            "docs/schemas/strict/scaffold-variant.schema.json",
            "config/scaffold-variants/cafe-site/warm-clay.json",
        ):
            self.assertIn(expected, paths)
        self.assertTrue(any("base-nextjs" in path for path in paths), "klonkällan ska nämnas")

    def test_summary_is_rendered_before_the_checklist(self) -> None:
        source = inspect.getsource(sw._render_step_validate)
        self.assertLess(
            source.index("_render_planned_writes"),
            source.index("_run_checks("),
            "sammanfattningen ska stå före checklistan, inte efter",
        )

    def test_autorun_chain_output_is_part_of_the_plan(self) -> None:
        """Regressionen Codex hittade: skrivningen skedde, raden fanns inte."""
        planned = {row["path"] for row in sw._autorun_writes(self._draft("new-variant"))}
        for script, expected in AUTORUN_WRITE_SOURCES.items():
            self.assertIn(
                expected["path"],
                planned,
                f"{script} skriver {expected['path']} men skrivplanen nämner den inte",
            )
            for extra in expected.get("extra_paths", ()):
                self.assertIn(
                    extra,
                    planned,
                    f"{script} skriver även {extra} men skrivplanen nämner den inte",
                )

    def test_plan_rows_match_what_the_scripts_actually_write(self) -> None:
        """Varje rad pekar på skriptet som skriver den — och skriptet skriver dit."""
        rows_by_script: dict[str, list[dict]] = {}
        for row in sw._autorun_writes(self._draft("new-variant")):
            rows_by_script.setdefault(row["script"], []).append(row)
        for script, expected in AUTORUN_WRITE_SOURCES.items():
            script_rows = rows_by_script.get(script) or []
            self.assertTrue(script_rows, f"{script} saknas i skrivplanen")
            primary = next(
                (row for row in script_rows if row["path"] == expected["path"]),
                None,
            )
            self.assertIsNotNone(primary, f"{script} saknar rad för {expected['path']}")
            self.assertEqual(primary["source"], expected["source"])
            self.assertEqual(
                _write_targets(expected["source"]),
                expected["write_targets"],
                f"{expected['source']} skriver till andra mål än planen räknar med — "
                "uppdatera _autorun_writes",
            )
            source_text = (REPO_ROOT / expected["source"]).read_text(encoding="utf-8")
            for constant in expected["path_constants"]:
                self.assertIn(
                    constant,
                    source_text,
                    f"{expected['source']} byggde sökvägen annorlunda — "
                    f"kontrollera att planen fortfarande säger {expected['path']}",
                )
            for extra in expected.get("extra_paths", ()):
                self.assertTrue(
                    any(row["path"] == extra for row in script_rows),
                    f"{script} ska även lista {extra}",
                )

    def test_every_writing_step_in_the_chain_is_accounted_for(self) -> None:
        """Ny autorun-skrivare får inte kunna smyga in utan att redovisas."""
        listed = {row["script"] for row in sw._autorun_writes(self._draft("new-variant"))}
        npm_scripts = _npm_scripts()
        for step in sw._post_create_steps("warm-clay"):
            for name in _npm_script_names(step["command"]):
                self.assertIn(name, npm_scripts, f"{name} finns inte i package.json")
                if name in READ_ONLY_AUTORUN_SCRIPTS:
                    self.assertIn(
                        "vitest run",
                        npm_scripts[name],
                        f"{name} är undantaget som läsande men kör något annat nu",
                    )
                    continue
                self.assertIn(
                    name,
                    listed,
                    f"{name} körs av autorun-kedjan men redovisas inte i skrivplanen",
                )

    def test_embeddings_autorun_requires_blob(self) -> None:
        embeddings = next(
            step
            for step in sw._post_create_steps("warm-clay")
            if step["key"] == "embeddings"
        )
        self.assertIn("--require-blob", embeddings["command"])
        self.assertTrue(embeddings["needs_blob"])

    def test_new_scaffold_chain_indexes_scaffold_and_variant(self) -> None:
        steps = sw._post_create_steps("warm-clay", new_scaffold=True)
        keys = [step["key"] for step in steps]
        self.assertEqual(keys[0], "patterns")
        self.assertIn("scaffold_embeddings", keys)
        self.assertIn("embeddings", keys)
        self.assertEqual(keys[-1], "validate")
        scaffold_step = next(step for step in steps if step["key"] == "scaffold_embeddings")
        self.assertIn("--require-blob", scaffold_step["command"])
        self.assertEqual(scaffold_step["command"][2], "scaffolds:embeddings")
        listed = {row["script"] for row in sw._autorun_writes(self._draft("new-scaffold"))}
        self.assertIn("scaffolds:embeddings", listed)
        for step in steps:
            for name in _npm_script_names(step["command"]):
                if name in READ_ONLY_AUTORUN_SCRIPTS:
                    continue
                self.assertIn(name, listed)
        scaffold_row = next(
            row
            for row in sw._autorun_writes(self._draft("new-scaffold"))
            if row["script"] == "scaffolds:embeddings"
        )
        self.assertEqual(
            _write_targets(scaffold_row["source"]),
            {"saveEmbeddingsArtifact:scaffold"},
        )

    def test_condition_is_stated_whether_or_not_the_key_exists(self) -> None:
        """Utan nyckel skrivs autorun-filerna inte — rutan får inte lova dem."""
        for autorun in (True, False):
            with mock.patch.object(sw.st, "markdown") as markdown, mock.patch.object(
                sw.st, "caption"
            ):
                sw._render_planned_writes(self._draft("new-variant"), autorun=autorun)
            rendered = "\n".join(str(call[0][0]) for call in markdown.call_args_list)
            self.assertIn("OPENAI_API_KEY", rendered, "villkoret ska stå i rutan")
            self.assertIn("config/scaffold-variants/_index/variant-embeddings.json", rendered)
            self.assertIn("config/embeddings-blob-manifest.json", rendered)
            if autorun:
                self.assertIn("automatiskt", rendered)
            else:
                self.assertIn("skrivs inte", rendered)
                self.assertIn("BLOB_READ_WRITE_TOKEN", rendered)


class PipelineToolsCopyTests(unittest.TestCase):
    def test_maintenance_tab_points_at_blob_index_gate(self) -> None:
        source = inspect.getsource(sl._render_pipeline_tools)
        self.assertIn("index-grinden", source)
        self.assertIn("--require-blob", source)
        self.assertNotIn("sker nu från terminalen", source)

    def test_index_gate_renders_before_flash_note(self) -> None:
        source = inspect.getsource(sl.render)
        gate_pos = source.find("render_index_gate(ctx)")
        flash_pos = source.find("_render_flashed_note()")
        self.assertGreater(gate_pos, -1)
        self.assertGreater(flash_pos, gate_pos)


class IndexGateQueueTests(unittest.TestCase):
    def setUp(self) -> None:
        from backoffice.pages.scaffold_lifecycle_lib import index_gate as ig

        self.ig = ig
        self.state: dict = {}
        self.patcher = mock.patch.object(ig.st, "session_state", self.state)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_later_variant_queue_keeps_scaffold_step(self) -> None:
        self.ig.queue_index_after_create(new_scaffold=True, scaffold_id="alpha")
        self.state[self.ig.INDEX_RESULTS_KEY] = {
            "scaffold_embeddings": {"ok": True},
            "embeddings": {"ok": True},
        }
        self.ig.queue_index_after_create(new_scaffold=False, scaffold_id="alpha")
        pending = self.state[self.ig.INDEX_PENDING_KEY]
        self.assertTrue(pending["new_scaffold"])
        self.assertEqual(pending["scaffold_id"], "alpha")
        results = self.state[self.ig.INDEX_RESULTS_KEY]
        self.assertEqual(results.get("scaffold_embeddings"), {"ok": True})
        self.assertNotIn("embeddings", results)
        keys = [step["key"] for step in self.ig.indexing_steps(new_scaffold=True)]
        self.assertIn("scaffold_embeddings", keys)

    def test_new_scaffold_after_variant_invalidates_scaffold_result(self) -> None:
        self.ig.queue_index_after_create(new_scaffold=False, scaffold_id="beta")
        self.state[self.ig.INDEX_RESULTS_KEY] = {"embeddings": {"ok": True}}
        self.ig.queue_index_after_create(new_scaffold=True, scaffold_id="gamma")
        pending = self.state[self.ig.INDEX_PENDING_KEY]
        self.assertTrue(pending["new_scaffold"])
        self.assertEqual(pending["scaffold_id"], "beta, gamma")
        self.assertNotIn("scaffold_embeddings", self.state[self.ig.INDEX_RESULTS_KEY])
        self.assertNotIn("embeddings", self.state[self.ig.INDEX_RESULTS_KEY])

    def test_delete_and_reset_requeue_blob_index(self) -> None:
        from backoffice.pages.scaffold_lifecycle_lib import ui_danger

        delete_src = inspect.getsource(ui_danger._render_delete_scaffold)
        reset_src = inspect.getsource(ui_danger._render_baseline_tab)
        self.assertIn("queue_index_after_create(new_scaffold=True", delete_src)
        self.assertIn("queue_index_after_create(new_scaffold=True", reset_src)
        delete_variant_src = inspect.getsource(ui_danger._render_delete_variant)
        self.assertIn("queue_index_after_create", delete_variant_src)
        warning = inspect.getsource(self.ig.render_index_gate)
        self.assertIn("if not complete:", warning)
        self.assertIn("ur synk", warning)
        self.assertNotIn("är skriven i worktreet", warning)

    def test_index_commands_get_more_than_the_600s_default(self) -> None:
        """En timeout mitt i en ombyggnad ser ut som ett misslyckat index."""
        self.assertGreaterEqual(self.ig.INDEX_COMMAND_TIMEOUT_S, 30 * 60)
        for source in (
            inspect.getsource(self.ig.render_index_gate),
            inspect.getsource(sw._render_post_create),
        ):
            self.assertIn("timeout=INDEX_COMMAND_TIMEOUT_S", source)

    def test_every_step_republishes_to_blob_fail_closed(self) -> None:
        """Delete får inte publiceras genom att ladda upp en lokal cache.

        En misslyckad `embeddings:sync` gör cachen inaktuell, och `embeddings:push`
        skulle då skriva över Blob för scaffolds som aldrig rörts.
        """
        for new_scaffold in (True, False):
            for step in self.ig.indexing_steps(new_scaffold=new_scaffold):
                self.assertIn("--require-blob", step["command"])
                self.assertNotIn("embeddings:push", step["command"])
                self.assertTrue(step["needs_blob"])


if __name__ == "__main__":
    unittest.main()
