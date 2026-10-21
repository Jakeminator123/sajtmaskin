"""Sol 6.1 policy for small workloads. Dollar prices stay in the pricing docs."""

from __future__ import annotations

import json
import unittest

from backoffice import REPO_ROOT
from backoffice.shared_lib.models import (
    DEFAULT_PHASE_THINKING_BY_TIER,
    MODEL_LABELS,
    ROUTE_LOCAL_WORKLOAD_MODELS,
    human_model_label,
)


def _manifest() -> dict:
    path = REPO_ROOT / "config" / "ai_models" / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _workloads(manifest: dict) -> dict[str, dict]:
    return {entry["id"]: entry for entry in manifest["workloads"]}


class ModelPolicyContractTests(unittest.TestCase):
    def test_small_workloads_are_sol_medium_without_luna_fallbacks(self) -> None:
        workloads = _workloads(_manifest())
        expected = {
            "project_analyze": "gpt-6.1-sol",
            "text_analyze": "gpt-6.1-sol",
            "audit_structured_public": "openai/gpt-6.1-sol",
            "prompt_rewrite": "openai/gpt-6.1-sol",
            "analyze_presentation_vision": "gpt-6.1-sol",
            "backoffice_scaffold_wizard_guide": "gpt-6.1-sol",
            "backoffice_scaffold_wizard_persona": "gpt-6.1-sol",
            "backoffice_dossier_curation": "gpt-6.1-sol",
            "live_review": "gpt-6.1-sol",
            "qa_short_circuit": "gpt-6.1-sol",
            "shadcn_describe_queries": "openai/gpt-6.1-sol",
            "shadcn_describe_ranking": "openai/gpt-6.1-sol",
        }
        for workload_id, model in expected.items():
            entry = workloads[workload_id]
            self.assertEqual(entry["defaultModel"], model, workload_id)
            self.assertEqual(entry["reasoningEffort"], "medium", workload_id)
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
            "live_review",
        ):
            self.assertEqual(
                workloads[workload_id]["visionModels"],
                ["gpt-6.1-sol", "gpt-6-luna"],
            )
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
        self.assertEqual(manifest["buildProfiles"]["defaults"]["ultra"], "gpt-6-astra")

    def test_display_labels_follow_the_forward_policy(self) -> None:
        self.assertIn("GPT-6.1 Sol", MODEL_LABELS["gpt-4o-mini"])
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


if __name__ == "__main__":
    unittest.main()
