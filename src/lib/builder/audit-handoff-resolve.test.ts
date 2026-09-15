import { beforeEach, describe, expect, it, vi } from "vitest";

const getPromptHandoffByIdForOwner = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getPromptHandoffByIdForOwner,
}));

import { extractAuditHandoffPayload } from "./audit-handoff";
import { resolveAuditHandoffForOwner } from "./audit-handoff-resolve";
import type { AuditResult } from "@/types/audit";

function payload() {
  return extractAuditHandoffPayload({
    audit_type: "website_audit",
    company: "Granit",
    domain: "granit.se",
    cost: { tokens: 1, sek: 0, usd: 0 },
  } satisfies AuditResult);
}

describe("resolveAuditHandoffForOwner", () => {
  beforeEach(() => {
    getPromptHandoffByIdForOwner.mockReset();
  });

  it("returns null without an owner scope", async () => {
    await expect(
      resolveAuditHandoffForOwner({
        promptHandoffId: "handoff_1",
        userId: null,
        sessionId: null,
      }),
    ).resolves.toBeNull();
    expect(getPromptHandoffByIdForOwner).not.toHaveBeenCalled();
  });

  it("reads the consumed row through the same owner-scope helper as GET", async () => {
    getPromptHandoffByIdForOwner.mockResolvedValue({
      id: "handoff_1",
      prompt: "Bygg en förbättrad sajt för granit.se",
      source: "audit",
      payload: payload(),
      consumed_at: new Date().toISOString(),
    });

    const resolved = await resolveAuditHandoffForOwner({
      promptHandoffId: "handoff_1",
      userId: "user_1",
      sessionId: "sess_1",
    });

    expect(getPromptHandoffByIdForOwner).toHaveBeenCalledWith("handoff_1", {
      userId: "user_1",
      sessionId: "sess_1",
    });
    expect(resolved?.domain).toBe("granit.se");
  });

  it("returns null for another owner's row", async () => {
    getPromptHandoffByIdForOwner.mockResolvedValue(null);
    await expect(
      resolveAuditHandoffForOwner({
        promptHandoffId: "handoff_1",
        userId: "other-user",
        sessionId: null,
      }),
    ).resolves.toBeNull();
  });
});
