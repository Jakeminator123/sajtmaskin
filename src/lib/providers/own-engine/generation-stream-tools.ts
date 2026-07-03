import type { BuilderIntegrationEnvelope } from "@/lib/gen/stream/builder-stream-contract";
import {
  isGenericIntegrationName,
  normalizeIntegrationProviderKey,
  resolveIntegrationDisplayName,
  resolveIntegrationIdentityKey,
} from "@/lib/integrations/suggestion-display";
import type { PreviewLifecycleStage } from "@/lib/gen/preview/env-local";
import { formatSSEEvent } from "@/lib/streaming";
import { debugLog, warnLog } from "@/lib/utils/debug";

export type OwnEngineToolSseBridge = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
  toolCallNames: Set<string>;
  toolSignaledProviders: Set<string>;
  /** Set true when a tool implies we should not treat "no code" as hard failure */
  setBlockingToolCall: () => void;
  /**
   * F2 (`design`) hard-mutes env/integration tool surface so the chat
   * never asks the user to fill in env vars. F3 (`integrations`) lets
   * those tools through. See `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  lifecycleStage?: PreviewLifecycleStage;
};

const ENV_TOOLS_F2_BLOCKED = new Set(["suggestIntegration", "requestEnvVar"]);

/**
 * Maps AI SDK tool invocations from the codegen stream into builder-facing SSE
 * (`integration`, `tool-call`). Keeps `generation-stream.ts` focused on I/O loop.
 *
 * Blocking policy (see `docs/architecture/llm-pipeline.md` § Fas 2 — codegen-verktyg under create-chat init):
 * - `suggestIntegration` / `requestEnvVar`: informative only; emit SSE, do NOT call
 *   `setBlockingToolCall` — code must still generate in the same response.
 * - `askClarifyingQuestion`: blocking; calls `setBlockingToolCall` — real question
 *   requiring user input before the chain should continue.
 */
export function emitOwnEngineToolCallSse(
  bridge: OwnEngineToolSseBridge,
  toolData: Record<string, unknown>,
): void {
  const toolName = typeof toolData?.toolName === "string" ? toolData.toolName : "";
  const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};
  // Env-/integrationsverktygen registreras först EFTER argument-validering
  // (Codex P2, PR #375): en MALFORMAD signal som hamnar i `toolCallNames`
  // skulle trigga `tool_only_empty_generation`-prompten i chatten — en
  // spök-fråga utan något att konfigurera. Giltiga signaler registreras även
  // när de F2-mutas (se drop-grenen nedan).
  if (toolName && !ENV_TOOLS_F2_BLOCKED.has(toolName)) bridge.toolCallNames.add(toolName);

  const { enc, safeEnqueue, toolSignaledProviders, setBlockingToolCall } = bridge;
  const lifecycleStage: PreviewLifecycleStage = bridge.lifecycleStage ?? "design";

  // Defense-in-depth: even if env/integration tools accidentally leak into
  // the model's tool surface in F2 (e.g. via dossier instructions or a
  // forgotten gate), drop the resulting SSE events so they never reach
  // the chat. The tool exposure gates in `create-chat-stream-post.ts` and
  // `chat-message-stream-post.ts` are the primary defense; this is a net.
  if (
    lifecycleStage !== "integrations" &&
    ENV_TOOLS_F2_BLOCKED.has(toolName)
  ) {
    // F2-mutade men GILTIGA signaler registreras ändå som tool-call: en
    // tool-only-generation utan kod ska ge "kör igen eller fortsätt"-prompten
    // (tool_only_empty_generation), inte en generisk tom-output-failure.
    // Kontraktet pinnas av stream/route.test.ts.
    bridge.toolCallNames.add(toolName);
    warnLog("engine", "Dropped F2 env/integration tool-call (defense-in-depth)", {
      toolName,
      lifecycleStage,
    });
    return;
  }

  if (toolName === "suggestIntegration") {
    const providerRaw = typeof toolArgs.provider === "string" ? toolArgs.provider : null;
    const nameRaw = typeof toolArgs.name === "string" ? toolArgs.name : null;
    const providerKey = resolveIntegrationIdentityKey({
      provider: providerRaw,
      name: nameRaw,
    });
    const normalizedProvider = normalizeIntegrationProviderKey(providerRaw);
    const normalizedName = normalizeIntegrationProviderKey(nameRaw);
    const hasProvider = Boolean(normalizedProvider);
    const hasName = Boolean(normalizedName);
    const hasEnvVarsField = Array.isArray(toolArgs.envVars);
    const envVars = hasEnvVarsField ? (toolArgs.envVars as string[]) : [];
    const derivedDisplayName = resolveIntegrationDisplayName({
      provider: providerRaw,
      name: nameRaw,
      key: providerKey,
    });
    const missingProviderAndName = !hasProvider && !hasName;
    const missingEnvVarsAndGenericName =
      !hasEnvVarsField && isGenericIntegrationName(nameRaw) && !derivedDisplayName;

    if (missingProviderAndName || missingEnvVarsAndGenericName) {
      warnLog("engine", "Dropped malformed suggestIntegration tool-call (defense-in-depth)", {
        lifecycleStage,
        hasProvider,
        hasName,
        hasEnvVarsField,
        provider: providerRaw,
        name: nameRaw,
      });
      return;
    }

    // providerKey är kompakt identitetsform (dedupe); payload-nyckeln behåller
    // registry-stil (hyphenated slug) så konsumenter som slår upp t.ex.
    // "vercel-blob" inte bryts.
    const payloadKey = normalizedProvider ?? (providerKey ? normalizedName : null) ?? "custom-env";
    const integrationPayload: BuilderIntegrationEnvelope = {
      items: [
        {
          key: payloadKey,
          name: derivedDisplayName ?? undefined,
          provider: normalizedProvider ?? undefined,
          intent: "env_vars",
          envVars,
          status: "Kräver konfiguration",
          reason: typeof toolArgs.reason === "string" ? toolArgs.reason : undefined,
          setupHint: typeof toolArgs.setupHint === "string" ? toolArgs.setupHint : undefined,
        },
      ],
    };
    safeEnqueue(enc.encode(formatSSEEvent("integration", integrationPayload)));
    bridge.toolCallNames.add(toolName);
    if (providerKey) {
      toolSignaledProviders.add(providerKey);
    }
    debugLog("engine", "Tool: suggestIntegration", { provider: providerKey ?? "custom-env" });
    return;
  }

  if (toolName === "requestEnvVar") {
    const envKey = typeof toolArgs.key === "string" ? toolArgs.key.trim() : "";
    if (!envKey) {
      debugLog("engine", "Tool: requestEnvVar skipped (missing key)", {});
      return;
    }
    const integrationPayload: BuilderIntegrationEnvelope = {
      items: [
        {
          key: "custom-env",
          name: "Miljövariabel",
          intent: "env_vars",
          envVars: [envKey],
          status:
            typeof toolArgs.description === "string"
              ? toolArgs.description
              : "Kräver konfiguration",
        },
      ],
    };
    safeEnqueue(enc.encode(formatSSEEvent("integration", integrationPayload)));
    bridge.toolCallNames.add(toolName);
    return;
  }

  if (toolName === "askClarifyingQuestion") {
    setBlockingToolCall();
    safeEnqueue(
      enc.encode(
        formatSSEEvent("tool-call", {
          toolName: "askClarifyingQuestion",
          toolCallId:
            typeof toolData.toolCallId === "string" ? toolData.toolCallId : `q-${Date.now()}`,
          args: toolArgs,
        }),
      ),
    );
    return;
  }

  if (toolName === "emitPlanArtifact") {
    safeEnqueue(
      enc.encode(
        formatSSEEvent("tool-call", {
          toolName: "emitPlanArtifact",
          toolCallId:
            typeof toolData.toolCallId === "string"
              ? toolData.toolCallId
              : `plan-${Date.now()}`,
          args: toolArgs,
        }),
      ),
    );
  }
}
