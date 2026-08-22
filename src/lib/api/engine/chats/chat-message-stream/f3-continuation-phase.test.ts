/**
 * Phase B contract tests (M#li5, prod 2026-08-01 chat 7a4d609f): an
 * "Annat"/free-text reply to the pending F3 question consumes the marker and
 * runs as a design round — that handover must be EXPLICIT in the chat. The
 * observed prod flow left the user believing they were still in the
 * integrations flow while the round ran as F2 (tier-3 stub kept, F2 env
 * backstop at deploy). Binds: unrelated reply ⇒ one-line assistant notice
 * persisted; approve reply ⇒ no notice (the build round IS the answer).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionById: vi.fn(),
  consumeF3ContinuationMarker: vi.fn(),
  addMessage: vi.fn(),
  appendF3ApprovedToSnapshot: vi.fn(),
}));
vi.mock("@/lib/gen/version-manager", () => ({
  resolveChatPreferredVersionId: vi.fn(),
}));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn() }));

import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import { F3_CONTINUATION_DESIGN_ROUND_NOTICE } from "@/lib/gen/stream/f3-continuation";
import {
  buildFollowUpContract,
  mergePersistedOrchestrationSnapshots,
} from "@/lib/gen/orchestration-snapshot";
import { devLogAppend } from "@/lib/logging/dev-log";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import {
  consumeF3MarkerPhaseB,
  prepareF3ApprovalBuildRound,
  type F3ContinuationDecision,
} from "./f3-continuation-phase";

const CHAT_ID = "chat-f3-phase";

function makeEngineChat(): ChatWithMessages {
  return {
    id: CHAT_ID,
    project_id: null,
    orchestration_snapshot: null,
    messages: [],
  } as unknown as ChatWithMessages;
}

function makeParsedMeta(): ParsedChatRequestMeta {
  return {
    lifecycleStage: "design",
    parentVersionId: null,
  } as unknown as ParsedChatRequestMeta;
}

function makeDecision(
  replyIntent: F3ContinuationDecision["replyIntent"],
): F3ContinuationDecision {
  return {
    replyIntent,
    markerMessageId: "marker-msg-1",
    markerParentVersionId: "ver-parent",
    markerSuggestedProviders: [],
    markerRequestedEnvKeys: [],
    markerToolOnlyRounds: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chatRepo.consumeF3ContinuationMarker).mockResolvedValue(true);
  vi.mocked(chatRepo.addMessage).mockResolvedValue(
    undefined as unknown as Awaited<ReturnType<typeof chatRepo.addMessage>>,
  );
  vi.mocked(chatRepo.appendF3ApprovedToSnapshot).mockResolvedValue(true);
});

describe("consumeF3MarkerPhaseB — unrelated ('Annat') reply (M#li5)", () => {
  it("persists the explicit design-round notice when an unrelated reply consumes the marker", async () => {
    const parsedMeta = makeParsedMeta();
    const result = await consumeF3MarkerPhaseB({
      f3ContinuationDecision: makeDecision("unrelated"),
      engineChat: makeEngineChat(),
      chatId: CHAT_ID,
      parsedMeta,
    });

    expect(result).toBe(false);
    expect(chatRepo.consumeF3ContinuationMarker).toHaveBeenCalledWith(
      CHAT_ID,
      "marker-msg-1",
    );
    expect(chatRepo.addMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "assistant",
      F3_CONTINUATION_DESIGN_ROUND_NOTICE,
    );
    // The round itself still runs as design — the notice never flips stage.
    expect(parsedMeta.lifecycleStage).toBe("design");
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "f3.unrelated_reply_design_round_notice",
        chatId: CHAT_ID,
      }),
    );
  });

  it("skips the notice when the marker consume lost the race (a racing approve may own an F3 round)", async () => {
    vi.mocked(chatRepo.consumeF3ContinuationMarker).mockResolvedValue(false);
    const result = await consumeF3MarkerPhaseB({
      f3ContinuationDecision: makeDecision("unrelated"),
      engineChat: makeEngineChat(),
      chatId: CHAT_ID,
      parsedMeta: makeParsedMeta(),
    });

    // The round still runs as design, but this request did not end the
    // integrations flow — claiming so could be false during an approve race
    // (mirrors the reject path's neutral race copy).
    expect(result).toBe(false);
    expect(chatRepo.addMessage).not.toHaveBeenCalledWith(
      CHAT_ID,
      "assistant",
      F3_CONTINUATION_DESIGN_ROUND_NOTICE,
    );
  });

  it("does NOT fail the round when the notice write fails (best-effort)", async () => {
    vi.mocked(chatRepo.addMessage).mockRejectedValue(new Error("db down"));
    await expect(
      consumeF3MarkerPhaseB({
        f3ContinuationDecision: makeDecision("unrelated"),
        engineChat: makeEngineChat(),
        chatId: CHAT_ID,
        parsedMeta: makeParsedMeta(),
      }),
    ).resolves.toBe(false);
  });
});

describe("consumeF3MarkerPhaseB — approve reply (no notice)", () => {
  it("returns true on a confirmed approve consume and persists no notice", async () => {
    const parsedMeta = {
      lifecycleStage: "integrations",
      parentVersionId: "ver-parent",
    } as unknown as ParsedChatRequestMeta;
    const result = await consumeF3MarkerPhaseB({
      f3ContinuationDecision: makeDecision("approve"),
      engineChat: makeEngineChat(),
      chatId: CHAT_ID,
      parsedMeta,
    });

    expect(result).toBe(true);
    expect(chatRepo.addMessage).not.toHaveBeenCalled();
    expect(parsedMeta.lifecycleStage).toBe("integrations");
  });

  it("downgrades to design WITHOUT a notice on an unconfirmed approve consume (race copy differs)", async () => {
    vi.mocked(chatRepo.consumeF3ContinuationMarker).mockResolvedValue(false);
    const parsedMeta = {
      lifecycleStage: "integrations",
      parentVersionId: "ver-parent",
    } as unknown as ParsedChatRequestMeta;
    const result = await consumeF3MarkerPhaseB({
      f3ContinuationDecision: makeDecision("approve"),
      engineChat: makeEngineChat(),
      chatId: CHAT_ID,
      parsedMeta,
    });

    expect(result).toBe(false);
    expect(chatRepo.addMessage).not.toHaveBeenCalled();
    expect(parsedMeta.lifecycleStage).toBe("design");
    expect(parsedMeta.parentVersionId).toBeNull();
  });
});

describe("consumeF3MarkerPhaseB — no pending continuation", () => {
  it("is a no-op without a decision (no consume, no notice)", async () => {
    const result = await consumeF3MarkerPhaseB({
      f3ContinuationDecision: null,
      engineChat: makeEngineChat(),
      chatId: CHAT_ID,
      parsedMeta: makeParsedMeta(),
    });

    expect(result).toBe(false);
    expect(chatRepo.consumeF3ContinuationMarker).not.toHaveBeenCalled();
    expect(chatRepo.addMessage).not.toHaveBeenCalled();
  });
});

describe("prepareF3ApprovalBuildRound — database provider alignment (SM-030)", () => {
  it("persists and prompts only postgres-drizzle for an approved Mongo marker on the database capability", async () => {
    const decision = {
      ...makeDecision("approve"),
      markerSuggestedProviders: ["mongodb"],
    };
    const engineChat = {
      ...makeEngineChat(),
      orchestration_snapshot: {
        f3ApprovedCapabilities: ["database"],
        f3ApprovedProviders: ["MongoDB", "MongoDB-Atlas"],
      },
    } as ChatWithMessages;

    const result = await prepareF3ApprovalBuildRound({
      f3ApprovalBuildRound: true,
      f3ContinuationDecision: decision,
      engineChat,
      chatId: CHAT_ID,
      previousFiles: [],
      optimizedMessage: "Godkänn",
      promptStartedAt: Date.now(),
      req: new Request("http://localhost/stream"),
      attachSessionCookie: (response) => response,
    });

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.f3EffectiveApprovedProviders).toEqual(["postgres-drizzle"]);
      expect(result.optimizedMessage).toContain("Approved integration providers: postgres-drizzle.");
      expect(result.optimizedMessage).not.toContain("Approved integration providers: mongodb.");
    }
    expect(chatRepo.appendF3ApprovedToSnapshot).toHaveBeenCalledWith(
      CHAT_ID,
      ["database"],
      ["postgres-drizzle"],
      expect.arrayContaining(["mongodb", "mongodb-atlas"]),
    );
    expect(engineChat.orchestration_snapshot).toMatchObject({
      f3ApprovedCapabilities: ["database"],
      f3ApprovedProviders: ["postgres-drizzle"],
    });
    const finalSnapshotInput = buildFollowUpContract({
      snapshot: engineChat.orchestration_snapshot as Record<string, unknown>,
    });
    expect(finalSnapshotInput.f3ApprovedProviders).toEqual(["postgres-drizzle"]);
    const finalPersistedSnapshot = mergePersistedOrchestrationSnapshots(
      engineChat.orchestration_snapshot as Record<string, unknown>,
      {
        f3ApprovedCapabilities: finalSnapshotInput.f3ApprovedCapabilities,
        f3ApprovedProviders: finalSnapshotInput.f3ApprovedProviders,
      },
    );
    expect(finalPersistedSnapshot.f3ApprovedProviders).toEqual(["postgres-drizzle"]);
  });
});
