import { formatSSEEvent } from "@/lib/streaming";
import { debugLog } from "@/lib/utils/debug";

export type OwnEngineToolSseBridge = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
  toolCallNames: Set<string>;
  toolSignaledProviders: Set<string>;
  /** Set true when a tool implies we should not treat "no code" as hard failure */
  setBlockingToolCall: () => void;
};

/**
 * Maps AI SDK tool invocations from the codegen stream into builder-facing SSE
 * (`integration`, `tool-call`). Keeps `generation-stream.ts` focused on I/O loop.
 */
export function emitOwnEngineToolCallSse(
  bridge: OwnEngineToolSseBridge,
  toolData: Record<string, unknown>,
): void {
  const toolName = typeof toolData?.toolName === "string" ? toolData.toolName : "";
  const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};
  if (toolName) bridge.toolCallNames.add(toolName);

  const { enc, safeEnqueue, toolSignaledProviders, setBlockingToolCall } = bridge;

  if (toolName === "suggestIntegration") {
    setBlockingToolCall();
    const envVars = Array.isArray(toolArgs.envVars) ? (toolArgs.envVars as string[]) : [];
    safeEnqueue(
      enc.encode(
        formatSSEEvent("integration", {
          items: [
            {
              key: typeof toolArgs.provider === "string" ? toolArgs.provider : "unknown",
              name: typeof toolArgs.name === "string" ? toolArgs.name : "Integration",
              provider: typeof toolArgs.provider === "string" ? toolArgs.provider : undefined,
              intent: "env_vars" as const,
              envVars,
              status: "Kräver konfiguration",
              reason: typeof toolArgs.reason === "string" ? toolArgs.reason : undefined,
              setupHint: typeof toolArgs.setupHint === "string" ? toolArgs.setupHint : undefined,
            },
          ],
        }),
      ),
    );
    const providerKey = typeof toolArgs.provider === "string" ? toolArgs.provider : "unknown";
    toolSignaledProviders.add(providerKey);
    debugLog("engine", "Tool: suggestIntegration", { provider: providerKey });
    return;
  }

  if (toolName === "requestEnvVar") {
    const envKey = typeof toolArgs.key === "string" ? toolArgs.key.trim() : "";
    if (!envKey) {
      debugLog("engine", "Tool: requestEnvVar skipped (missing key)", {});
      return;
    }
    setBlockingToolCall();
    safeEnqueue(
      enc.encode(
        formatSSEEvent("integration", {
          items: [
            {
              key: "custom-env",
              name: "Miljövariabel",
              intent: "env_vars" as const,
              envVars: [envKey],
              status:
                typeof toolArgs.description === "string"
                  ? toolArgs.description
                  : "Kräver konfiguration",
            },
          ],
        }),
      ),
    );
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
