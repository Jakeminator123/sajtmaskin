import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreGenerationContractContext } from "@/lib/gen/contract/pre-generation-contracts";
import type { ContractClarificationQuestion } from "@/lib/gen/contract/clarification";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import { createPreGenerationContractGateReadableStream } from "./pre-generation-contract-gate";

async function readStreamAsText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  out += dec.decode();
  return out;
}

function parseSseEvents(raw: string): Array<{ event: string; data: unknown }> {
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of blocks) {
    let event = "";
    let dataJson = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice("event: ".length);
      if (line.startsWith("data: ")) dataJson = line.slice("data: ".length);
    }
    if (event && dataJson) {
      events.push({ event, data: JSON.parse(dataJson) as unknown });
    }
  }
  return events;
}

const strategyMeta: PromptStrategyMeta = {
  strategy: "direct",
  promptType: "freeform",
  budgetTarget: 8000,
  originalLength: 10,
  optimizedLength: 10,
  reductionRatio: 0,
  reason: "test",
  phaseHints: [],
  complexityScore: 1,
  wasChanged: false,
};

const preGenContracts: PreGenerationContractContext = {
  contracts: {
    dataMode: "persisted",
    databaseProvider: "Supabase",
    integrations: [{ provider: "stripe", name: "Stripe", reason: "test", status: "chosen" }],
    envVars: [{ key: "DATABASE_URL", reason: "db" }],
  },
  unresolvedDecisions: [{ kind: "auth", reason: "unset" }],
  confirmedAnswers: [],
};

const clarification: ContractClarificationQuestion = {
  kind: "auth",
  question: "Vilken auth?",
  options: ["A", "B"],
  blocking: true,
  reason: "need auth",
};

const scaffold: ScaffoldManifest = {
  id: "sc_1",
  family: "saas-landing",
  label: "SaaS",
  description: "d",
  buildIntents: ["website"],
  tags: [],
  promptHints: [],
  files: [],
};

const capabilities: InferredCapabilities = {
  needsMotion: false,
  needs3D: false,
  needsCharts: false,
  needsDatabase: true,
  needsAuth: true,
  needsAppShell: false,
  needsDataUI: false,
  needsForms: false,
  needsEcommerce: false,
  needsCarousel: false,
  needsPremiumVisuals: false,
};

const buildSpec: BuildSpec = {
  buildIntent: "website",
  generationMode: "followUp",
  changeScope: "integration",
  scaffoldFamily: "saas-landing",
  routePlanSummary: "prompt:brochure:/,/pricing",
  stylePack: "saas",
  qualityTarget: "premium",
  previewPolicy: "fidelity2",
  verificationPolicy: "standard",
  contextPolicy: "heavy",
  referenceCategories: ["saas", "marketing-sites", "backend"],
  forbiddenPatterns: ["leave_bracket_placeholders", "compat_preview_primary"],
  tokenBudgets: {
    scaffoldChars: 25_000,
    refsChars: 12_000,
    systemContextChars: 36_000,
  },
};

describe("createPreGenerationContractGateReadableStream (golden SSE)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits stable event order and follow-up meta (no chatPrivacy / scaffoldLabel / capabilities)", async () => {
    const stream = createPreGenerationContractGateReadableStream({
      sseChatId: "chat_followup",
      assistantMessageId: "msg_a",
      contractClarification: clarification,
      preGenerationContracts: preGenContracts,
      engineModel: "gpt-test",
      resolvedModelTier: "pro",
      buildProfileId: "bp_pro",
      buildProfileLabel: "Pro",
      resolvedThinking: true,
      resolvedImageGenerations: false,
      resolvedScaffold: scaffold,
      strategyMeta,
      buildSpec,
      metaBriefApplied: true,
      customInstructionsLength: 0,
    });

    const raw = await readStreamAsText(stream);
    const events = parseSseEvents(raw);

    expect(events.map((e) => e.event)).toEqual([
      "chatId",
      "meta",
      "tool-call",
      "content",
      "done",
    ]);

    expect(events[0]?.data).toEqual({ id: "chat_followup" });

    const meta = events[1]?.data as Record<string, unknown>;
    expect(meta.enginePath).toBe("own-engine");
    expect(meta.chatPrivacy).toBeUndefined();
    expect(meta.scaffoldLabel).toBeUndefined();
    expect(meta.capabilities).toBeUndefined();
    expect(meta.contractDataMode).toBe("persisted");
    expect(meta.scaffoldId).toBe("sc_1");
    expect(meta.scaffoldFamily).toBe("saas-landing");
    expect(meta.buildSpec).toEqual(buildSpec);

    const toolCall = events[2]?.data as { toolName?: string; toolCallId?: string };
    expect(toolCall.toolName).toBe("askClarifyingQuestion");
    expect(toolCall.toolCallId).toBe("contracts-1577836800000");

    expect(events[3]?.data).toBe("Vilken auth?");

    expect(events[4]?.data).toMatchObject({
      chatId: "chat_followup",
      versionId: null,
      messageId: "msg_a",
      previewUrl: null,
      awaitingInput: true,
      awaitingInputPrompt: "Vilken auth?",
      reason: "pre_generation_contracts",
    });
  });

  it("new-chat meta includes chatPrivacy, scaffoldLabel, and capabilities", async () => {
    const stream = createPreGenerationContractGateReadableStream({
      sseChatId: "chat_new",
      assistantMessageId: null,
      contractClarification: clarification,
      preGenerationContracts: preGenContracts,
      engineModel: "gpt-test",
      resolvedModelTier: "pro",
      buildProfileId: "bp_pro",
      buildProfileLabel: "Pro",
      resolvedThinking: false,
      resolvedImageGenerations: true,
      resolvedScaffold: scaffold,
      strategyMeta,
      buildSpec,
      metaBriefApplied: false,
      customInstructionsLength: 12,
      chatPrivacy: "team",
      scaffoldLabel: "SaaS",
      capabilities,
    });

    const raw = await readStreamAsText(stream);
    const events = parseSseEvents(raw);
    const meta = events[1]?.data as Record<string, unknown>;

    expect(meta.chatPrivacy).toBe("team");
    expect(meta.scaffoldLabel).toBe("SaaS");
    expect(meta.capabilities).toEqual(capabilities);
    expect(meta.briefApplied).toBe(false);
    expect(meta.customInstructionsLength).toBe(12);
  });
});
