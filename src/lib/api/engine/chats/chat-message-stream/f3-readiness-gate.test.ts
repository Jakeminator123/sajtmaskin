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
const logTier3MissingEnvBlockedDetached = vi.hoisted(() => vi.fn());
const readF3ApprovedFromSnapshot = vi.hoisted(() =>
  vi.fn(
    (): { providers: string[]; capabilities: string[] } => ({
      providers: [],
      capabilities: [],
    }),
  ),
);
vi.mock("@/lib/integrations/log-tier3-missing-env", () => ({
  logTier3MissingEnvBlockedDetached,
}));
vi.mock("@/lib/gen/orchestration-snapshot", () => ({
  // Both fields: the real reader always returns them, and the approve path maps
  // over `capabilities` (f3-approve-round.ts), so a providers-only stub throws
  // and the gate answers `tier3_readiness_unavailable` instead of its verdict.
  readF3ApprovedFromSnapshot,
}));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
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

beforeEach(() => {
  readF3ApprovedFromSnapshot.mockReturnValue({ providers: [], capabilities: [] });
});

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

/**
 * The deterministic-release 409 writes the user row only on the approve
 * continuation, so the response has to say which case it is: the client uses it
 * to tell an optimistic ghost bubble from a persisted turn, and it cannot infer
 * it from the payload otherwise (Vercel Agent + bugbot on #610, reporting the
 * two opposite failure modes).
 */
describe("runF3ReadinessGate — deterministic release reports user-row persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Readiness passes with NO real-key requirements → deterministic-release branch. */
  function mockDeterministicRelease(): void {
    vi.mocked(checkTier3ReadinessForVersion).mockResolvedValue({
      ok: true,
      spec: { requirements: [] },
    } as unknown as Awaited<ReturnType<typeof checkTier3ReadinessForVersion>>);
  }

  async function runDeterministic(
    f3ContinuationDecision: Record<string, unknown> | null,
  ): Promise<{ error: string; userTurnPersisted: boolean }> {
    mockDeterministicRelease();
    vi.mocked(resolveChatPreferredVersionId).mockResolvedValue("v-parent");
    const result = await runF3ReadinessGate({
      ...gateParams({
        parsedMeta: makeParsedMeta("v-parent"),
        metaEngineBaseVersionId: null,
      }),
      f3ContinuationDecision,
    } as unknown as Parameters<typeof runF3ReadinessGate>[0]);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("unreachable");
    expect(result.status).toBe(409);
    return (await result.json()) as { error: string; userTurnPersisted: boolean };
  }

  it("reports false on the auto-kick path, where no user row is written", async () => {
    const body = await runDeterministic(null);

    expect(body.error).toBe("f3_deterministic_release_required");
    expect(body.userTurnPersisted).toBe(false);
    expect(vi.mocked(chatRepo.addMessage)).not.toHaveBeenCalled();
  });

  it("allows the LLM round when an approved dossier is still absent from the parent", async () => {
    readF3ApprovedFromSnapshot.mockReturnValue({
      providers: ["stripe-checkout"],
      capabilities: ["payments"],
    });
    mockDeterministicRelease();
    vi.mocked(resolveChatPreferredVersionId).mockResolvedValue("v-parent");

    const result = await runF3ReadinessGate({
      ...gateParams({
        parsedMeta: makeParsedMeta("v-parent"),
        metaEngineBaseVersionId: null,
      }),
      previousFiles: [
        { path: "app/page.tsx", content: "F2 exact", language: "tsx" },
      ],
    });

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("unreachable");
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingApprovedDossierIds: ["stripe-checkout"],
      }),
    );
  });

  it("reports true once the approve continuation persisted the row", async () => {
    vi.mocked(chatRepo.consumeF3ContinuationMarker).mockResolvedValue(
      true as unknown as Awaited<ReturnType<typeof chatRepo.consumeF3ContinuationMarker>>,
    );
    vi.mocked(chatRepo.addMessage).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof chatRepo.addMessage>>,
    );

    const body = await runDeterministic({
      replyIntent: "approve",
      markerMessageId: "marker-1",
      markerSuggestedProviders: [],
    });

    expect(body.userTurnPersisted).toBe(true);
    expect(vi.mocked(chatRepo.addMessage)).toHaveBeenCalledTimes(1);
  });

  // The persist is deliberately best-effort (a consumed marker must not
  // dead-end the approval), so a failed insert must report false — otherwise the
  // client keeps a bubble that no reload will show and discards the draft.
  it("reports false when the best-effort persist fails", async () => {
    vi.mocked(chatRepo.consumeF3ContinuationMarker).mockResolvedValue(
      true as unknown as Awaited<ReturnType<typeof chatRepo.consumeF3ContinuationMarker>>,
    );
    vi.mocked(chatRepo.addMessage).mockRejectedValue(new Error("insert failed"));

    const body = await runDeterministic({
      replyIntent: "approve",
      markerMessageId: "marker-1",
      markerSuggestedProviders: [],
    });

    expect(body.error).toBe("f3_deterministic_release_required");
    expect(body.userTurnPersisted).toBe(false);
  });
});

describe("runF3ReadinessGate — R7 missing-env observation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a durable observation before returning 412", async () => {
    vi.mocked(resolveChatPreferredVersionId).mockResolvedValue("v-preferred");
    vi.mocked(checkTier3ReadinessForVersion).mockResolvedValue({
      ok: false,
      reason: "missing_env",
      readiness: {
        ready: false,
        missingByIntegration: [
          { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof checkTier3ReadinessForVersion>>);

    const result = await runF3ReadinessGate(
      gateParams({
        parsedMeta: makeParsedMeta("v-preferred"),
        metaEngineBaseVersionId: null,
      }),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("unreachable");
    expect(result.status).toBe(412);
    expect(logTier3MissingEnvBlockedDetached).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: CHAT_ID,
        versionId: "v-preferred",
        source: "stream",
        missingByIntegration: [
          { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
        ],
      }),
    );
  });
});
