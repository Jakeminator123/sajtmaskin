"""Grindar för Fas D: modellvalet ägs av AI-modellmanifestet, inte av koden.

Tre saker som går sönder tyst utan tester:

1. **Paritet.** Fallback-tabellerna i ``backoffice/ai_workloads.py`` finns bara
   för att backoffice inte ska krascha på en trasig manifestfil. Driftar de från
   manifestet blir fallbacken en andra sanning om modellval — precis det Fas D
   skulle bort med.
2. **Vision-gating.** Bilder får bara gå till modeller som posten pekar ut som
   vision-kapabla. En regression här skickar en bild till en textmodell (HTTP
   400) eller, värre, slutar skicka bilden till persona-modellen utan att någon
   märker det.
3. **Ingen sammanslagning.** Persona och guide ska vara två poster, och ingen av
   dem får vara ``analyze_presentation_vision`` (kroppsspråksanalysen i
   ``src/app/api/analyze-presentation/route.ts``).
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from backoffice import ai_workloads as aw
from backoffice import wizard_support as wiz


def _manifest() -> dict:
    return json.loads((REPO_ROOT / aw.MANIFEST_REL).read_text(encoding="utf-8"))


def _workload(workload_id: str) -> dict:
    for entry in _manifest()["workloads"]:
        if entry.get("id") == workload_id:
            return entry
    raise AssertionError(f"workload {workload_id!r} saknas i manifestet")


ALL_WORKLOADS = (
    aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA,
    aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE,
    aw.WORKLOAD_DOSSIER_CURATION,
)

# Vilken av de två anropsvägarna ett budget-test gäller.
_PERSONA = "persona"
_GUIDE = "guide"


class WorkloadRegistrationTests(unittest.TestCase):
    def test_all_three_workloads_exist(self) -> None:
        for workload_id in ALL_WORKLOADS:
            with self.subTest(workload_id=workload_id):
                entry = _workload(workload_id)
                self.assertTrue(entry.get("defaultModel"), f"{workload_id} saknar defaultModel")
                self.assertEqual(entry.get("provider"), "openai_direct")
                self.assertEqual(entry.get("authEnv"), ["OPENAI_API_KEY"])

    def test_persona_and_guide_are_separate_entries(self) -> None:
        """Beslutet 2026-07-28: slå INTE ihop dem. Olika modellbehov (vision vs
        billig text) är hela skälet att posterna finns."""
        persona = _workload(aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA)
        guide = _workload(aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE)
        self.assertNotEqual(persona["id"], guide["id"])
        self.assertNotEqual(
            persona["defaultModel"],
            guide["defaultModel"],
            "persona och guide har samma defaultModel — då är två poster meningslösa",
        )

    def test_wizard_never_reads_the_presentation_vision_workload(self) -> None:
        for workload_id in (
            aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA,
            aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE,
        ):
            self.assertNotEqual(workload_id, "analyze_presentation_vision")
        wizard_sources = (
            (REPO_ROOT / "backoffice" / "wizard_support.py").read_text(encoding="utf-8"),
            (REPO_ROOT / "backoffice" / "pages" / "scaffold_wizard.py").read_text(encoding="utf-8"),
            (REPO_ROOT / "backoffice" / "ai_workloads.py").read_text(encoding="utf-8"),
        )
        for text in wizard_sources:
            # Fällan: att låta wizarden ärva en annan features modellbeslut.
            # Nämnas i en förklarande kommentar är OK; läsas är det inte.
            self.assertNotIn(
                'load_workload(repo_root, "analyze_presentation_vision"',
                text,
            )
            self.assertNotIn('"analyze_presentation_vision")', text)

    def test_workload_codeentries_point_at_files_that_exist(self) -> None:
        for workload_id in ALL_WORKLOADS:
            for rel in _workload(workload_id).get("codeEntry", []):
                with self.subTest(workload_id=workload_id, rel=rel):
                    self.assertTrue((REPO_ROOT / rel).is_file(), f"{rel} finns inte")


class FallbackParityTests(unittest.TestCase):
    """Fallbacken får aldrig drifta från manifestet — då blir den en andra
    sanning i stället för en nödutgång."""

    def test_every_workload_has_a_non_empty_fallback(self) -> None:
        """Invariant som håller UI:t säkert: `st.selectbox` får aldrig en tom
        lista, så varje workload måste ha minst ett modell-id även när
        manifestet inte går att läsa."""
        for workload_id in ALL_WORKLOADS:
            with self.subTest(workload_id=workload_id):
                self.assertTrue(aw.MODEL_FALLBACKS.get(workload_id))
                self.assertTrue(aw.resolve_model_choices(REPO_ROOT, workload_id))

    def test_model_fallbacks_match_the_manifest(self) -> None:
        for workload_id, fallback in aw.MODEL_FALLBACKS.items():
            with self.subTest(workload_id=workload_id):
                entry = _workload(workload_id)
                expected = tuple(
                    dict.fromkeys([entry["defaultModel"], *entry.get("fallbackModels", [])])
                )
                self.assertEqual(fallback, expected)

    def test_vision_fallbacks_match_the_manifest(self) -> None:
        for workload_id, fallback in aw.VISION_FALLBACKS.items():
            with self.subTest(workload_id=workload_id):
                self.assertEqual(
                    fallback, frozenset(_workload(workload_id).get("visionModels", []))
                )

    def test_vision_models_are_a_subset_of_the_offered_models(self) -> None:
        """En vision-modell som inte går att välja i UI:t är död konfiguration."""
        for workload_id in ALL_WORKLOADS:
            entry = _workload(workload_id)
            offered = {entry["defaultModel"], *entry.get("fallbackModels", [])}
            with self.subTest(workload_id=workload_id):
                self.assertTrue(set(entry.get("visionModels", [])) <= offered)


class ResolveFromManifestTests(unittest.TestCase):
    def test_choices_come_from_the_manifest_in_order(self) -> None:
        for workload_id in ALL_WORKLOADS:
            entry = _workload(workload_id)
            expected = tuple(
                dict.fromkeys([entry["defaultModel"], *entry.get("fallbackModels", [])])
            )
            with self.subTest(workload_id=workload_id):
                self.assertEqual(aw.resolve_model_choices(REPO_ROOT, workload_id), expected)
                self.assertEqual(
                    aw.resolve_default_model(REPO_ROOT, workload_id), entry["defaultModel"]
                )

    def test_no_hardcoded_model_id_remains_in_the_surfaces(self) -> None:
        """Acceptanskriteriet: ingen backoffice-yta hårdkodar ett modell-id
        (utom den dokumenterade fallback-tabellen i ai_workloads.py)."""
        for rel in (
            "backoffice/wizard_support.py",
            "backoffice/pages/scaffold_wizard.py",
        ):
            text = (REPO_ROOT / rel).read_text(encoding="utf-8")
            for banned in ('"gpt-4o"', "'gpt-4o'", '"gpt-5.4-mini"', '"gpt-5.5"'):
                with self.subTest(rel=rel, banned=banned):
                    self.assertNotIn(
                        banned,
                        text,
                        f"{rel} hårdkodar {banned} — läs modellen ur manifestet i stället",
                    )

    def test_curate_script_reads_the_manifest_instead_of_a_literal(self) -> None:
        text = (REPO_ROOT / "scripts" / "dossiers" / "curate-from-reference.ts").read_text(
            encoding="utf-8"
        )
        self.assertNotIn('model: "gpt-4o-mini"', text)
        self.assertIn("model: args.model", text)
        self.assertIn(aw.WORKLOAD_DOSSIER_CURATION, text)


class ManifestMissingOrBrokenTests(unittest.TestCase):
    def _root_with_manifest(self, body: str | None) -> Path:
        root = Path(tempfile.mkdtemp())
        if body is not None:
            path = root / aw.MANIFEST_REL
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
        return root

    def test_missing_manifest_falls_back(self) -> None:
        root = self._root_with_manifest(None)
        for workload_id, fallback in aw.MODEL_FALLBACKS.items():
            with self.subTest(workload_id=workload_id):
                self.assertEqual(aw.resolve_model_choices(root, workload_id), fallback)

    def test_broken_json_falls_back(self) -> None:
        root = self._root_with_manifest("{ trasig json")
        self.assertEqual(
            aw.resolve_model_choices(root, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA),
            aw.MODEL_FALLBACKS[aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA],
        )
        self.assertEqual(
            aw.resolve_vision_models(root, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA),
            aw.VISION_FALLBACKS[aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA],
        )

    def test_workloads_not_a_list_falls_back(self) -> None:
        root = self._root_with_manifest(json.dumps({"workloads": {"nope": True}}))
        self.assertEqual(
            aw.resolve_model_choices(root, aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE),
            aw.MODEL_FALLBACKS[aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE],
        )

    def test_entry_without_models_falls_back(self) -> None:
        root = self._root_with_manifest(
            json.dumps({"workloads": [{"id": aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE}]})
        )
        self.assertEqual(
            aw.resolve_model_choices(root, aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE),
            aw.MODEL_FALLBACKS[aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE],
        )

    def test_unknown_workload_gets_empty_choices_not_a_guess(self) -> None:
        self.assertEqual(aw.resolve_model_choices(REPO_ROOT, "does_not_exist"), ())
        self.assertEqual(aw.resolve_default_model(REPO_ROOT, "does_not_exist"), "")

    def test_entry_without_vision_models_has_no_vision_path(self) -> None:
        root = self._root_with_manifest(
            json.dumps(
                {
                    "workloads": [
                        {
                            "id": aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA,
                            "defaultModel": "some-text-model",
                        }
                    ]
                }
            )
        )
        self.assertEqual(
            aw.resolve_vision_models(root, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA), frozenset()
        )
        self.assertFalse(
            aw.model_supports_vision(
                root, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA, "some-text-model"
            )
        )

    def test_non_string_entries_are_ignored(self) -> None:
        root = self._root_with_manifest(
            json.dumps(
                {
                    "workloads": [
                        {
                            "id": aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA,
                            "defaultModel": "a-model",
                            "fallbackModels": ["b-model", 42, "", "  "],
                            "visionModels": ["a-model", None],
                        }
                    ]
                }
            )
        )
        self.assertEqual(
            aw.resolve_model_choices(root, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA),
            ("a-model", "b-model"),
        )
        self.assertEqual(
            aw.resolve_vision_models(root, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA),
            frozenset({"a-model"}),
        )


class VisionGatingTests(unittest.TestCase):
    def test_manifest_marks_only_vision_models_as_vision_capable(self) -> None:
        persona = aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA
        vision = aw.resolve_vision_models(REPO_ROOT, persona)
        self.assertTrue(vision, "persona-posten saknar visionModels — gatingen blir tom")
        for model in vision:
            self.assertTrue(aw.model_supports_vision(REPO_ROOT, persona, model))
        self.assertFalse(aw.model_supports_vision(REPO_ROOT, persona, "gpt-5.4-mini"))

    def test_guide_workload_has_no_vision_path(self) -> None:
        guide = aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE
        self.assertEqual(aw.resolve_vision_models(REPO_ROOT, guide), frozenset())
        for model in aw.resolve_model_choices(REPO_ROOT, guide):
            self.assertFalse(aw.model_supports_vision(REPO_ROOT, guide, model))

    def test_image_is_only_attached_for_a_vision_capable_model(self) -> None:
        """Kärnan i gatingen: samma anrop, olika `vision_capable`, och bara det
        ena får en `image_url`-del i payloaden."""
        captured: list[dict] = []

        def fake_post(payload, api_key, *, timeout=180):  # noqa: ANN001, ARG001
            captured.append(payload)
            return json.dumps({"personaNotes": "ok", "recommendation": "new-variant"})

        original = wiz._post_openai_chat
        wiz._post_openai_chat = fake_post  # type: ignore[assignment]
        try:
            for vision_capable in (True, False):
                wiz.run_persona_analysis(
                    api_key="sk-test",
                    model="gpt-4o",
                    persona_prompt="persona",
                    template_meta={
                        "id": "t1",
                        "title": "Mall",
                        "stillImageUrl": "https://example.com/still.png",
                    },
                    repo_summary=None,
                    scaffold_options=[{"id": "landing-page", "label": "L", "description": "d"}],
                    vision_capable=vision_capable,
                )
        finally:
            wiz._post_openai_chat = original  # type: ignore[assignment]

        self.assertEqual(len(captured), 2)
        with_vision, without_vision = captured
        parts_with = with_vision["messages"][1]["content"]
        parts_without = without_vision["messages"][1]["content"]
        self.assertTrue(any(part.get("type") == "image_url" for part in parts_with))
        self.assertFalse(any(part.get("type") == "image_url" for part in parts_without))
        # Utan bild ska prompten säga det, så personan inte hittar på visuella
        # detaljer den inte kunnat se.
        text_without = next(p["text"] for p in parts_without if p.get("type") == "text")
        self.assertIn("Ingen stillbild bifogad", text_without)

    def test_vision_capable_has_no_default(self) -> None:
        """Gaten får inte kunna glömmas: utan `vision_capable` ska anropet
        falla med TypeError, inte tyst skicka bilden."""
        with self.assertRaises(TypeError):
            wiz.run_persona_analysis(
                api_key="sk-test",
                model="gpt-4o",
                persona_prompt="persona",
                template_meta={"id": "t1"},
                repo_summary=None,
                scaffold_options=[],
            )

    def test_no_image_part_when_the_template_lacks_a_still(self) -> None:
        captured: list[dict] = []

        def fake_post(payload, api_key, *, timeout=180):  # noqa: ANN001, ARG001
            captured.append(payload)
            return json.dumps({"recommendation": "new-variant"})

        original = wiz._post_openai_chat
        wiz._post_openai_chat = fake_post  # type: ignore[assignment]
        try:
            wiz.run_persona_analysis(
                api_key="sk-test",
                model="gpt-4o",
                persona_prompt="persona",
                template_meta={"id": "t1", "title": "Mall"},
                repo_summary=None,
                scaffold_options=[],
                vision_capable=True,
            )
        finally:
            wiz._post_openai_chat = original  # type: ignore[assignment]
        parts = captured[0]["messages"][1]["content"]
        self.assertFalse(any(part.get("type") == "image_url" for part in parts))


class ReasoningTokenBudgetTests(unittest.TestCase):
    """Vercel Agent Review på #656: guidens default gick från `gpt-4o` till
    `gpt-5.4-mini` i Fas D, men taket låg kvar på 500 `max_completion_tokens`.
    Reasoning-tokens räknas mot samma tak, så tänkandet kunde äta hela budgeten
    → tomt `content` → RuntimeError, alltså en guide som var trasig by default."""

    def _payload_for(self, fn, model: str) -> dict:
        captured: list[dict] = []

        def fake_post(payload, api_key, *, timeout=180):  # noqa: ANN001, ARG001
            captured.append(payload)
            return json.dumps({"recommendation": "new-variant"}) if fn is _PERSONA else "svar"

        original = wiz._post_openai_chat
        wiz._post_openai_chat = fake_post  # type: ignore[assignment]
        try:
            if fn is _PERSONA:
                wiz.run_persona_analysis(
                    api_key="sk-test",
                    model=model,
                    persona_prompt="p",
                    template_meta={"id": "t"},
                    repo_summary=None,
                    scaffold_options=[],
                    vision_capable=False,
                )
            else:
                wiz.ask_guide(
                    api_key="sk-test", model=model, step_context="ctx", question="fråga?"
                )
        finally:
            wiz._post_openai_chat = original  # type: ignore[assignment]
        return captured[0]

    def test_guide_gets_headroom_on_the_manifest_default(self) -> None:
        default_model = aw.resolve_default_model(REPO_ROOT, aw.WORKLOAD_SCAFFOLD_WIZARD_GUIDE)
        self.assertTrue(
            wiz._is_reasoning_model(default_model),
            "testet förutsätter att guidens default är en reasoning-modell",
        )
        reasoning = self._payload_for(_GUIDE, default_model)
        classic = self._payload_for(_GUIDE, "gpt-4o")
        self.assertGreater(
            reasoning["max_completion_tokens"], classic["max_completion_tokens"]
        )
        self.assertEqual(classic["max_completion_tokens"], 500)

    def test_persona_gets_headroom_when_the_operator_picks_a_reasoning_model(self) -> None:
        reasoning_choices = [
            m
            for m in aw.resolve_model_choices(REPO_ROOT, aw.WORKLOAD_SCAFFOLD_WIZARD_PERSONA)
            if wiz._is_reasoning_model(m)
        ]
        self.assertTrue(reasoning_choices, "persona-posten erbjuder ingen reasoning-modell")
        reasoning = self._payload_for(_PERSONA, reasoning_choices[0])
        classic = self._payload_for(_PERSONA, "gpt-4o")
        self.assertGreater(
            reasoning["max_completion_tokens"], classic["max_completion_tokens"]
        )
        # Reasoning-modeller får inte heller någon custom temperature (HTTP 400).
        self.assertNotIn("temperature", reasoning)
        self.assertIn("temperature", classic)


class StillImageHttpsGateTests(unittest.TestCase):
    """Cursor-bugbot (medium) på #656: UI:t sa "stillbilden skickas med" för en
    URL som anropet tystar bort, eftersom https-kravet bara fanns i anropet."""

    def test_only_https_urls_count_as_usable(self) -> None:
        for raw, expected in (
            ("https://blob.example/still.png", "https://blob.example/still.png"),
            ("http://blob.example/still.png", ""),
            ("/relativ/still.png", ""),
            ("  https://blob.example/x.png  ", "https://blob.example/x.png"),
            ("", ""),
            (None, ""),
        ):
            with self.subTest(raw=raw):
                self.assertEqual(
                    wiz.usable_still_image_url({"stillImageUrl": raw}), expected
                )

    def test_no_image_is_attached_for_a_non_https_url(self) -> None:
        captured: list[dict] = []

        def fake_post(payload, api_key, *, timeout=180):  # noqa: ANN001, ARG001
            captured.append(payload)
            return json.dumps({"recommendation": "new-variant"})

        original = wiz._post_openai_chat
        wiz._post_openai_chat = fake_post  # type: ignore[assignment]
        try:
            wiz.run_persona_analysis(
                api_key="sk-test",
                model="gpt-4o",
                persona_prompt="p",
                template_meta={"id": "t", "stillImageUrl": "http://insecure/still.png"},
                repo_summary=None,
                scaffold_options=[],
                vision_capable=True,
            )
        finally:
            wiz._post_openai_chat = original  # type: ignore[assignment]
        parts = captured[0]["messages"][1]["content"]
        self.assertFalse(any(p.get("type") == "image_url" for p in parts))
        text = next(p["text"] for p in parts if p.get("type") == "text")
        self.assertIn("Ingen stillbild bifogad", text)

    def test_the_wizard_page_uses_the_shared_helper(self) -> None:
        """Sidan får inte ha sin egen tolkning av "finns det en bild?" — det var
        just avvikelsen som gjorde rutan osann."""
        page = (REPO_ROOT / "backoffice" / "pages" / "scaffold_wizard.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("wiz.usable_still_image_url(template)", page)
        self.assertNotIn('still_url = str(template.get("stillImageUrl"', page)


class PersonaContractTests(unittest.TestCase):
    """Skärpt kontrakt (Fas D steg 4) — promptinnehåll, inte schema/validering."""

    def test_contract_demands_concrete_output(self) -> None:
        contract = wiz._OUTPUT_CONTRACT
        for needle in ("kebab-case", "signaturePatterns", "minst 2 rader", "minst 3 rader"):
            self.assertIn(needle, contract)

    def test_contract_bans_the_generic_value_words(self) -> None:
        contract = wiz._OUTPUT_CONTRACT.lower()
        for word in ("modern", "minimalistisk", "elegant", "professionell"):
            self.assertIn(word, contract, f"kontraktet nämner inte värdeordet {word!r}")


if __name__ == "__main__":
    unittest.main()
