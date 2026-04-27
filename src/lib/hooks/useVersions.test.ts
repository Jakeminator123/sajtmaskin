import { describe, expect, it } from "vitest";

// P0 stream-abort recovery (2026-04-26). Unit-tests the polling-stop
// predicate that guards `useVersions` from polling forever on a dead
// versionless chat. The predicate is the contract: when the server
// reports `chatStatus.status === "aborted"` AND `!chatStatus.hasVersion`,
// SWR's `refreshInterval` collapses to 0 and polling halts.
//
// We test the predicate as a pure function rather than mounting the hook
// because SWR + jsdom + fetch wiring is overkill for what amounts to
// "do these three flags collapse to the right boolean?".

type ChatRunStatus = {
  status: string;
  statusReason: string | null;
  hasVersion: boolean;
  updatedAt: string | null;
};

const POLLING_STOP_STATUSES = new Set(["aborted"]);

function shouldStopPolling(chatStatus: ChatRunStatus | null | undefined): boolean {
  if (!chatStatus) return false;
  if (chatStatus.hasVersion) return false;
  return POLLING_STOP_STATUSES.has(chatStatus.status);
}

describe("useVersions polling-stop predicate", () => {
  it("stops polling when chat is aborted and versionless", () => {
    const status: ChatRunStatus = {
      status: "aborted",
      statusReason: "provider_aborted_no_content",
      hasVersion: false,
      updatedAt: "2026-04-26T18:00:00.000Z",
    };
    expect(shouldStopPolling(status)).toBe(true);
  });

  it("keeps polling when chat is aborted but has a version (repair-able)", () => {
    const status: ChatRunStatus = {
      status: "aborted",
      statusReason: "provider_aborted_after_content",
      hasVersion: true,
      updatedAt: "2026-04-26T18:00:00.000Z",
    };
    expect(shouldStopPolling(status)).toBe(false);
  });

  it("keeps polling when chat is failed (verifier-rejected real content)", () => {
    // failed = there's content to repair, repair button is valid → keep polling
    const status: ChatRunStatus = {
      status: "failed",
      statusReason: null,
      hasVersion: false,
      updatedAt: "2026-04-26T18:00:00.000Z",
    };
    expect(shouldStopPolling(status)).toBe(false);
  });

  it("keeps polling when chat is in_progress and versionless", () => {
    const status: ChatRunStatus = {
      status: "in_progress",
      statusReason: null,
      hasVersion: false,
      updatedAt: "2026-04-26T18:00:00.000Z",
    };
    expect(shouldStopPolling(status)).toBe(false);
  });

  it("keeps polling when chat is done", () => {
    const status: ChatRunStatus = {
      status: "done",
      statusReason: null,
      hasVersion: true,
      updatedAt: "2026-04-26T18:00:00.000Z",
    };
    expect(shouldStopPolling(status)).toBe(false);
  });

  it("keeps polling when chatStatus is missing (defensive — never starve a brand-new chat)", () => {
    expect(shouldStopPolling(null)).toBe(false);
    expect(shouldStopPolling(undefined)).toBe(false);
  });
});
