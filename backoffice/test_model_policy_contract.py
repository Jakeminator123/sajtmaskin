"""Default model and effort contracts for text and vision workloads."""

from __future__ import annotations

import json
import re
import unittest

from backoffice import REPO_ROOT
from backoffice.shared_lib.models import (
    DEFAULT_PHASE_THINKING_BY_TIER,
    MODEL_LABELS,
    AVAILABLE_PHASE_MODELS,
    active_phase_model,
    phase_model_display_label,
    resolve_phase_models_for_dashboard,
    ROUTE_LOCAL_WORKLOAD_MODELS,
    human_model_label,
)


def _manifest() -> dict:
    path = REPO_ROOT / "config" / "ai_models" / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _workloads(manifest: dict) -> dict[str, dict]:
    return {entry["id"]: entry for entry in manifest["workloads"]}


class ModelPolicyContractTests(unittest.TestCase):
    def test_saved_astra_dispatches_to_current_phase_option(self) -> None:
        for legacy in ("gpt-6-astra", "openai/gpt-6-astra", "gpt-6.1-astra", "openai/gpt-6.1-astra"):
            self.assertNotIn(legacy, AVAILABLE_PHASE_MODELS)
            self.assertEqual(active_phase_model(legacy), "gpt-6.2-astra")
        manifest = _manifest()
        manifest["phaseRouting"]["defaultByTier"]["ultra"]["verifier"] = "gpt-6-astra"
        self.assertEqual(resolve_phase_models_for_dashboard(manifest, "verifier")["ultra"], "gpt-6.2-astra")
        self.assertEqual(phase_model_display_label("gpt-6-astra", "ultra", {}), "GPT-6.2 Astra")
        self.assertIn("gpt-6.2-astra", AVAILABLE_PHASE_MODELS)
        self.assertEqual(human_model_label("gpt-6-astra"), "GPT-6 Astra (→ GPT-6.2 Astra)")

    def test_small_workloads_use_selected_models_and_efforts(self) -> None:
        workloads = _workloads(_manifest())
        expected = {
            "project_analyze": ("gpt-6.2-sol", "medium"),
            "text_analyze": ("gpt-6.2-sol", "medium"),
            "audit_structured_public": ("openai/gpt-6.2-sol", "medium"),
            "prompt_rewrite": ("openai/gpt-6.2-sol", "low"),
            "analyze_presentation_vision": ("gpt-6.1-terra", "medium"),
            "backoffice_scaffold_wizard_guide": ("gpt-6.2-sol", "low"),
            "backoffice_scaffold_wizard_persona": ("gpt-6.1-terra", "medium"),
            "backoffice_dossier_curation": ("gpt-6.2-sol", "medium"),
            "live_review": ("gpt-6.2-sol", "medium"),
            "qa_short_circuit": ("gpt-6.2-sol", "medium"),
            "shadcn_describe_queries": ("openai/gpt-6.2-sol", "low"),
            "shadcn_describe_ranking": ("openai/gpt-6.2-sol", "low"),
        }
        for workload_id, (model, effort) in expected.items():
            entry = workloads[workload_id]
            self.assertEqual(entry["defaultModel"], model, workload_id)
            self.assertEqual(entry["reasoningEffort"], effort, workload_id)
        for entry in workloads.values():
            for model in entry.get("fallbackModels") or []:
                self.assertNotIn("luna", str(model).lower(), entry["id"])
        self.assertEqual(
            workloads["audit_structured"]["fallbackModels"],
            ["openai/gpt-5.6-sol"],
        )
        for workload_id in (
            "analyze_presentation_vision",
            "backoffice_scaffold_wizard_persona",
        ):
            self.assertEqual(
                workloads[workload_id]["visionModels"],
                ["gpt-6.1-terra", "gpt-6.2-sol"],
            )
        self.assertEqual(workloads["live_review"]["visionModels"], ["gpt-6.2-sol", "gpt-6.2-astra"])
        self.assertNotIn("fallbackModels", workloads["live_review"])
        self.assertNotIn("defaultModel", workloads["runtime_embeddings_query"])
        self.assertNotIn("defaultModel", workloads["transcribe"])
        self.assertEqual(
            workloads["qa_short_circuit"]["codeEntry"],
            ["src/lib/api/engine/chats/chat-message-stream/qa-short-circuit.ts"],
        )
        self.assertEqual(workloads["qa_short_circuit"]["authEnv"], ["OPENAI_API_KEY"])
        self.assertEqual(workloads["qa_short_circuit"]["invocation"], "ai_sdk_generateText")
        self.assertEqual(
            workloads["shadcn_describe_queries"]["codeEntry"],
            ["src/lib/shadcn/describe.ts"],
        )
        self.assertEqual(
            workloads["shadcn_describe_ranking"]["codeEntry"],
            ["src/lib/shadcn/describe.ts"],
        )
        self.assertEqual(
            workloads["shadcn_describe_queries"]["authEnv"],
            ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
        )
        self.assertEqual(workloads["shadcn_describe_queries"]["invocation"], "ai_generateObject")

    def test_openai_verifiers_and_low_deploy_assistant_are_medium(self) -> None:
        manifest = _manifest()
        thinking = manifest["phaseRouting"]["thinkingByTier"]
        for tier in ("premium", "pro", "max", "codex", "ultra"):
            self.assertEqual(thinking[tier]["verifier"]["reasoningEffort"], "medium")
            self.assertFalse(thinking[tier]["verifier"]["thinking"])
            self.assertEqual(
                DEFAULT_PHASE_THINKING_BY_TIER[tier]["verifier"]["reasoningEffort"],
                "medium",
            )
        self.assertEqual(thinking["pro"]["deploy-assistant"]["reasoningEffort"], "medium")
        self.assertEqual(
            DEFAULT_PHASE_THINKING_BY_TIER["pro"]["deploy-assistant"]["reasoningEffort"],
            "medium",
        )
        self.assertEqual(thinking["premium"]["generator"]["reasoningEffort"], "xhigh")
        self.assertEqual(thinking["pro"]["generator"]["reasoningEffort"], "medium")
        self.assertEqual(thinking["ultra"]["planner"]["reasoningEffort"], "high")
        self.assertEqual(thinking["ultra"]["generator"]["reasoningEffort"], "high")
        self.assertEqual(thinking["premium"]["fixer"]["reasoningEffort"], "high")
        self.assertEqual(manifest["buildProfiles"]["defaults"]["ultra"], "gpt-6.2-astra")

    def test_display_labels_follow_the_forward_policy(self) -> None:
        self.assertIn("GPT-6.2 Sol", MODEL_LABELS["gpt-4o-mini"])
        self.assertNotIn("Luna", MODEL_LABELS["gpt-4o-mini"])
        self.assertEqual(MODEL_LABELS["whisper-1"], "OpenAI Whisper-1")
        self.assertEqual(MODEL_LABELS["gpt-transcribe"], "gpt-transcribe")
        self.assertEqual(human_model_label("gpt-transcribe"), "gpt-transcribe")
        model_id, source, _note = ROUTE_LOCAL_WORKLOAD_MODELS["transcribe"]
        self.assertEqual(model_id, "gpt-transcribe")
        self.assertEqual(source, "route-local constant")
        self.assertEqual(
            ROUTE_LOCAL_WORKLOAD_MODELS["runtime_embeddings_query"][0],
            "text-embedding-3-small",
        )

    def test_route_local_models_match_their_source_files(self) -> None:
        transcribe = (REPO_ROOT / "src/app/api/transcribe/route.ts").read_text(encoding="utf-8")
        self.assertEqual(
            sorted(set(re.findall(r'\bmodel: "([^"]+)"', transcribe))),
            [ROUTE_LOCAL_WORKLOAD_MODELS["transcribe"][0]],
        )
        search = (REPO_ROOT / "src/lib/templates/template-search.ts").read_text(encoding="utf-8")
        match = re.search(r'const EMBEDDING_MODEL = "([^"]+)"', search)
        self.assertIsNotNone(match, "EMBEDDING_MODEL not found in template-search.ts")
        self.assertEqual(match.group(1), ROUTE_LOCAL_WORKLOAD_MODELS["runtime_embeddings_query"][0])


if __name__ == "__main__":
    unittest.main()
