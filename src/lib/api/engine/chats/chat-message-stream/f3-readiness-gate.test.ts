/**
 * Regressionstest för F3-lineage (Codex P2 på #352): gaten måste returnera
 * det RESOLVADE bas-versions-id:t (`f3ResolvedBaseVersionId`) så codegen-turn
 * persisterar lineage från samma resolution som gate/build — inte den råa
 * klient-`parentVersionId`:n, som kan peka på en version som aldrig var
 * byggbas när callern skickar enbart `parentVersionId`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionById: vi.fn(),
  consumeF3ContinuationMarker: vi.fn(),
  addMessage: vi.fn(),
}));
vi.mock("@/lib/gen/version-manager", () => ({
  resolveChatPreferredVersionId: vi.fn(),
}));
vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  checkTier3ReadinessForVersion: vi.fn(),
}));
vi.mock("@/lib/gen/orchestration-snapshot", () => ({
  readF3ApprovedFromSnapshot: vi.fn(() => ({ providers: [] })),
}));
vi.mock("@/lib/logging/devLog", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn() }));

import * as chatRepo from "@/lib/db/chat-repository-pg";
import { resolveChatPreferredVersionId } from "@/lib/gen/version-manager";
import { checkTier3ReadinessForVersion } from "@/lib/integrations/tier3-readiness-gate";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import { runF3ReadinessGate } from "./f3-readiness-gate";

const CHAT_ID = "chat-1";

function makeEngineChat(): ChatWithMessages {
  return {
    id: CHAT_ID,
    project_id: null,
    orchestration_snapshot: null,
    messages: [],
  } as unknown as ChatWithMessages;
}

function makeParsedMeta(parentVersionId: string | null): ParsedChatRequestMeta {
  return {
    lifecycleStage: "integrations",
    parentVersionId,
  } as unknown as ParsedChatRequestMeta;
}

/** Gate passes with a real-build-key spec → no deterministic-release branch. */
function mockGatePass(): void {
  vi.mocked(checkTier3ReadinessForVersion).mockResolvedValue({
    ok: true,
    spec: {
      requirements: [
        { key: "stripe", requiredRealEnvKeys: ["STRIPE_SECRET_KEY"] },
      ],
    },
  } as unknown as Awaited<ReturnType<typeof checkTier3ReadinessForVersion>>);
}

function gateParams(overrides: {
  parsedMeta: ParsedChatRequestMeta;
  metaEngineBaseVersionId: string | null;
}) {
  return {
    chatId: CHAT_ID,
    message: "bygg integrationer",
    engineChat: makeEngineChat(),
    parsedMeta: overrides.parsedMeta,
    metaPlanMode: false,
    metaEngineBaseVersionId: overrides.metaEngineBaseVersionId,
    f3ContinuationDecision: null,
    previousFiles: [],
    attachSessionCookie: (response: Response) => response,
  };
}

describe("runF3ReadinessGate — f3ResolvedBaseVersionId (lineage source)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves preferred (NOT the raw parentVersionId) when only parentVersionId is sent", async () => {
    mockGatePass();
    vi.mocked(resolveChatPreferredVersionId).mockResolvedValue("v-preferred");

    const result = await runF3ReadinessGate(
      gateParams({
        parsedMeta: makeParsedMeta("v-stale-parent"),
        metaEngineBaseVersionId: null,
      }),
    );

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("unreachable");
    expect(result.f3ResolvedBaseVersionId).toBe("v-preferred");
    // The gate inspected the same version it reports as lineage base.
    expect(vi.mocked(checkTier3ReadinessForVersion)).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: "v-preferred" }),
    );
    // The stale client id never reached the gate.
    expect(vi.mocked(chatRepo.getVersionById)).not.toHaveBeenCalled();
  });

  it("resolves the explicit chat-scoped engineBaseVersionId when provided", async () => {
    mockGatePass();
    vi.mocked(chatRepo.getVersionById).mockResolvedValue({
      id: "v-explicit",
      chat_id: CHAT_ID,
    } as unknown as Awaited<ReturnType<typeof chatRepo.getVersionById>>);

    const result = await runF3ReadinessGate(
      gateParams({
        parsedMeta: makeParsedMeta("v-explicit"),
        metaEngineBaseVersionId: "v-explicit",
      }),
    );

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("unreachable");
    expect(result.f3ResolvedBaseVersionId).toBe("v-explicit");
    expect(vi.mocked(resolveChatPreferredVersionId)).not.toHaveBeenCalled();
  });

  it("still refuses a mismatched engineBaseVersionId/parentVersionId pair with 409", async () => {
    const result = await runF3ReadinessGate(
      gateParams({
        parsedMeta: makeParsedMeta("v-other"),
        metaEngineBaseVersionId: "v-explicit",
      }),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("unreachable");
    expect(result.status).toBe(409);
    const body = (await result.json()) as { error: string };
    expect(body.error).toBe("f3_base_mismatch");
  });

  it("returns null outside integrations rounds", async () => {
    const result = await runF3ReadinessGate(
      gateParams({
        parsedMeta: {
          lifecycleStage: "design",
          parentVersionId: "v-any",
        } as unknown as ParsedChatRequestMeta,
        metaEngineBaseVersionId: null,
      }),
    );

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("unreachable");
    expect(result.f3ResolvedBaseVersionId).toBeNull();
  });
});
