import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/config";
import type { RoutePlan } from "../../route-plan";

const renderRecurringFailuresBlockLinesMock = vi.hoisted(() => vi.fn());

vi.mock("../recurring-failures", () => ({
  renderRecurringFailuresBlockLines: renderRecurringFailuresBlockLinesMock,
}));

import { renderRoutePlanBlock } from "./routing-and-tooling";

function makeRoutePlan(): RoutePlan {
  return {
    provenance: { primarySource: "prompt", sources: ["prompt"] },
    siteType: "brochure",
    reason: "fixture",
    routes: [{ path: "/", name: "Home", intent: "Landing", required: true }],
  };
}

type MutableRecurringFlags = {
  recurringPatternsInMainPrompt: boolean;
  recurringPatternsInCreatePrompt: boolean;
};

describe("renderRoutePlanBlock recurring-pattern gating", () => {
  const mutableFlags = FEATURES as unknown as MutableRecurringFlags;
  const originalMain = mutableFlags.recurringPatternsInMainPrompt;
  const originalCreate = mutableFlags.recurringPatternsInCreatePrompt;

  beforeEach(() => {
    renderRecurringFailuresBlockLinesMock.mockReset();
  });

  afterEach(() => {
    mutableFlags.recurringPatternsInMainPrompt = originalMain;
    mutableFlags.recurringPatternsInCreatePrompt = originalCreate;
  });

  it("includes recurring patterns on follow-up when main flag is enabled", () => {
    mutableFlags.recurringPatternsInMainPrompt = true;
    mutableFlags.recurringPatternsInCreatePrompt = false;
    renderRecurringFailuresBlockLinesMock.mockReturnValue([
      "### Recurring failures on this site",
      "- `missing-h1` ×3",
    ]);

    const lines = renderRoutePlanBlock({
      routePlan: makeRoutePlan(),
      buildSpec: null,
      isFollowUp: true,
      chatId: "chat_123",
      userPrompt: "fix styles",
      resolvedScaffold: null,
    });

    expect(lines.join("\n")).toContain("### Recurring failures on this site");
    expect(renderRecurringFailuresBlockLinesMock).toHaveBeenCalledWith("chat_123");
  });

  it("includes recurring patterns on create when create-flag is enabled and chatId exists", () => {
    mutableFlags.recurringPatternsInMainPrompt = true;
    mutableFlags.recurringPatternsInCreatePrompt = true;
    renderRecurringFailuresBlockLinesMock.mockReturnValue([
      "### Recurring failures on this site",
    ]);

    const lines = renderRoutePlanBlock({
      routePlan: makeRoutePlan(),
      buildSpec: null,
      isFollowUp: false,
      chatId: "chat_456",
      userPrompt: "create page",
      resolvedScaffold: null,
    });

    expect(lines.join("\n")).toContain("### Recurring failures on this site");
    expect(renderRecurringFailuresBlockLinesMock).toHaveBeenCalledWith("chat_456");
  });

  it("does not include recurring patterns on create when create-flag is disabled", () => {
    mutableFlags.recurringPatternsInMainPrompt = true;
    mutableFlags.recurringPatternsInCreatePrompt = false;
    renderRecurringFailuresBlockLinesMock.mockReturnValue([
      "### Recurring failures on this site",
    ]);

    const lines = renderRoutePlanBlock({
      routePlan: makeRoutePlan(),
      buildSpec: null,
      isFollowUp: false,
      chatId: "chat_789",
      userPrompt: "create page",
      resolvedScaffold: null,
    });

    expect(lines.join("\n")).not.toContain("### Recurring failures on this site");
    expect(renderRecurringFailuresBlockLinesMock).not.toHaveBeenCalled();
  });
});
