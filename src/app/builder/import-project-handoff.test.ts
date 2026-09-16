import { describe, expect, it } from "vitest";
import {
  planImportedProjectHandoff,
  shouldApplyUrlChatId,
  shouldClearPendingChatHandoff,
  shouldSkipFreshEntryChatReset,
} from "./import-project-handoff";
import type { ImportInitSuccess } from "@/lib/import/import-init-contract";

const success = (overrides: Partial<ImportInitSuccess> = {}): ImportInitSuccess => ({
  success: true,
  id: "chat_new",
  chatId: "chat_new",
  projectId: "proj_new",
  versionId: "ver_new",
  previewUrl: "https://preview.test/new",
  preview: { status: "starting", runtimeReady: false, retryable: true },
  source: "github",
  lockedFiles: [],
  ...overrides,
});

describe("planImportedProjectHandoff", () => {
  it("uses the returned project id instead of the currently open project", () => {
    const plan = planImportedProjectHandoff(success());
    expect(plan.nextProjectId).toBe("proj_new");
    expect(plan.nextChatId).toBe("chat_new");
    expect(plan.nextVersionId).toBe("ver_new");
    expect(plan.shouldClearOldPreview).toBe(true);
  });

  it("clears preview URL when persist succeeded but preview failed", () => {
    const plan = planImportedProjectHandoff(
      success({
        previewUrl: null,
        preview: { status: "failed", runtimeReady: false, retryable: true },
      }),
    );
    expect(plan.nextPreviewUrl).toBeNull();
  });

  it("keeps the imported chat before the new chatId reaches the URL", () => {
    expect(
      shouldSkipFreshEntryChatReset({
        chatIdParam: null,
        isCreatingChat: false,
        pendingImportedChatId: "chat_new",
        currentChatId: "chat_new",
      }),
    ).toBe(true);
    expect(
      shouldSkipFreshEntryChatReset({
        chatIdParam: null,
        isCreatingChat: false,
        pendingImportedChatId: "chat_new",
        currentChatId: "chat_old",
      }),
    ).toBe(false);
  });
});

describe("shouldApplyUrlChatId", () => {
  it("blocks a stale URL chat while state already holds the pending handoff target", () => {
    expect(
      shouldApplyUrlChatId({
        chatIdParam: "chat_old",
        currentChatId: "chat_new",
        pendingHandoffChatId: "chat_new",
      }),
    ).toBe(false);
  });

  it("does not apply when URL already matches the pending target", () => {
    expect(
      shouldApplyUrlChatId({
        chatIdParam: "chat_new",
        currentChatId: "chat_new",
        pendingHandoffChatId: "chat_new",
      }),
    ).toBe(false);
  });

  it("applies normal URL navigation when no handoff is pending", () => {
    expect(
      shouldApplyUrlChatId({
        chatIdParam: "chat_new",
        currentChatId: "chat_old",
      }),
    ).toBe(true);
    expect(
      shouldApplyUrlChatId({
        chatIdParam: "chat_other",
        currentChatId: "chat_old",
        pendingHandoffChatId: null,
      }),
    ).toBe(true);
  });

  it("does not apply an empty URL chatId", () => {
    expect(
      shouldApplyUrlChatId({
        chatIdParam: null,
        currentChatId: "chat_new",
        pendingHandoffChatId: "chat_new",
      }),
    ).toBe(false);
  });
});

describe("shouldClearPendingChatHandoff", () => {
  it("releases the latch when the URL has landed on the pending target", () => {
    expect(
      shouldClearPendingChatHandoff({
        chatIdParam: "chat_new",
        pendingHandoffChatId: "chat_new",
      }),
    ).toBe(true);
  });

  it("keeps the latch while the URL still shows the previous chat", () => {
    expect(
      shouldClearPendingChatHandoff({
        chatIdParam: "chat_old",
        pendingHandoffChatId: "chat_new",
      }),
    ).toBe(false);
  });
});
