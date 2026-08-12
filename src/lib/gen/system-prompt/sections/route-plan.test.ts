import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/config";
import type { RoutePlan } from "../../route-plan";

const renderRecurringFailuresBlockLinesMock = vi.hoisted(() => vi.fn());

vi.mock("../recurring-failures", () => ({
  renderRecurringFailuresBlockLines: renderRecurringFailuresBlockLinesMock,
}));

import {
  renderExistingRoutePagesBlock,
  renderRequiredImportsChecklistBlock,
  renderRoutePlanBlock,
} from "./routing-and-tooling";

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

  it("renders compact route plan mode for follow-up deltas", () => {
    mutableFlags.recurringPatternsInMainPrompt = false;
    mutableFlags.recurringPatternsInCreatePrompt = false;

    const lines = renderRoutePlanBlock({
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "brochure",
        reason: "fixture",
        routes: [
          { path: "/", name: "Home", intent: "Landing", required: true },
          { path: "/kontakt", name: "Kontakt", intent: "Contact", required: true },
        ],
      },
      buildSpec: null,
      isFollowUp: true,
      compactMode: true,
      chatId: "chat_compact",
      userPrompt: "Byt rubrik",
      resolvedScaffold: null,
    });

    const output = lines.join("\n");
    expect(output).toContain("## Route Plan");
    expect(output).toContain("**Routes in scope:**");
    expect(output).not.toContain("**Planning source:**");
    expect(output).toContain("### Canonical route paths (use these EXACTLY)");
  });

  it("keeps capability-critical checklist rows in compact mode", () => {
    const lines = renderRequiredImportsChecklistBlock({
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "fixture",
        routes: [{ path: "/dashboard", name: "Dashboard", intent: "Data", required: true }],
      },
      capabilityHints: "- forms requested\n- app shell requested",
      compactMode: true,
    });

    const output = lines.join("\n");
    expect(output).toContain("Sidebar");
    expect(output).toContain("Form");
  });

  it("keeps baseline checklist rows in compact mode even with many contextual groups", () => {
    const lines = renderRequiredImportsChecklistBlock({
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "fixture",
        routes: [
          { path: "/dashboard", name: "Dashboard", intent: "Data", required: true },
          { path: "/kontakt", name: "Kontakt", intent: "Contact", required: true },
          { path: "/search", name: "Search", intent: "Search", required: true },
        ],
      },
      capabilityHints: [
        "- forms requested",
        "- app shell requested",
        "- search/command palette requested",
        "- calendar/date selection requested",
        "- e-commerce requested",
      ].join("\n"),
      compactMode: true,
    });

    const output = lines.join("\n");
    expect(output).toContain("Button");
    expect(output).toContain("Card");
    expect(output).toContain("Badge");
  });
});

describe("renderExistingRoutePagesBlock", () => {
  it("renders existing route map and anti-duplicate rules on follow-up", () => {
    const lines = renderExistingRoutePagesBlock({
      isFollowUp: true,
      previousFilePaths: [
        "app/page.tsx",
        "app/priser/page.tsx",
        "app/terms/page.tsx",
        "components/site-nav.tsx",
        "lib/utils.ts",
      ],
    });

    const output = lines.join("\n");
    expect(output).toContain("## Existing Route Pages (do not duplicate)");
    expect(output).toContain("- `/`");
    expect(output).toContain("- `/priser`");
    expect(output).toContain("- `/terms`");
    // Non-page files must not leak into the route map.
    expect(output).not.toContain("site-nav");
    expect(output).toContain(
      "Only create NEW pages the user explicitly asked for in this request.",
    );
    expect(output).toContain(
      "Never create a route that semantically duplicates an existing or requested page in another language",
    );
    expect(output).toContain(
      "Do not remove or rename existing routes unless the user explicitly asked for it.",
    );
  });

  it("normalizes src/app paths, route groups and dynamic segments", () => {
    const lines = renderExistingRoutePagesBlock({
      isFollowUp: true,
      previousFilePaths: [
        "src/app/(marketing)/om-oss/page.tsx",
        "src/app/blogg/[slug]/page.tsx",
      ],
    });

    const output = lines.join("\n");
    expect(output).toContain("- `/om-oss`");
    expect(output).toContain("- `/blogg/[slug]`");
  });

  it("renders nothing on init", () => {
    expect(
      renderExistingRoutePagesBlock({
        isFollowUp: false,
        previousFilePaths: ["app/page.tsx", "app/priser/page.tsx"],
      }),
    ).toEqual([]);
  });

  it("renders nothing when the previous version has no route pages", () => {
    expect(
      renderExistingRoutePagesBlock({
        isFollowUp: true,
        previousFilePaths: ["components/site-nav.tsx"],
      }),
    ).toEqual([]);
    expect(
      renderExistingRoutePagesBlock({ isFollowUp: true, previousFilePaths: null }),
    ).toEqual([]);
  });
});
