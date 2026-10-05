import { describe, expect, it } from "vitest";
import { parseChatRequestMeta } from "./parse-chat-request-meta";
import { orchestratePromptMessage } from "@/lib/builder/prompt-orchestration";
import { ORCHESTRATION_SOFT_TARGET_APP_CHARS } from "@/lib/builder/prompt-limits";

describe("effective request build intent before briefing and generation", () => {
  it.each(["dashboard", "app-shell"])(
    "manual %s reaches early prompt strategy as app",
    (scaffoldId) => {
      const parsed = parseChatRequestMeta({
        buildMethod: " FREEFORM ",
        buildIntent: " WEBSITE ",
        buildIntentExplicit: true,
        scaffoldMode: "manual",
        scaffoldId,
      });
      expect(parsed.buildMethod).toBe("freeform");
      expect(parsed.buildIntent).toBe("app");
      expect(parsed.buildIntentExplicit).toBe(true);
      const prompt = orchestratePromptMessage({
        message: "Bygg en intern arbetsyta",
        buildMethod: parsed.buildMethod,
        buildIntent: parsed.buildIntent,
        isFirstPrompt: true,
        attachmentsCount: 0,
      });
      expect(prompt.strategyMeta.budgetTarget).toBe(ORCHESTRATION_SOFT_TARGET_APP_CHARS);
    },
  );

  it.each([
    ["category", "template"],
    ["audit", "website"],
    ["kostnadsfri", "website"],
  ])(
    "%s retains its existing method override even with manual dashboard",
    (buildMethod, expected) => {
      expect(
        parseChatRequestMeta({
          buildMethod,
          buildIntent: "app",
          scaffoldMode: "manual",
          scaffoldId: "dashboard",
        }).buildIntent,
      ).toBe(expected);
    },
  );

  it.each([
    { scaffoldMode: "auto", scaffoldId: "dashboard" },
    { scaffoldMode: "off", scaffoldId: "app-shell" },
    { scaffoldMode: "manual", scaffoldId: "projekt-bas-app" },
    { scaffoldMode: "manual", scaffoldId: "landing-page" },
  ])("does not promote website for $scaffoldMode/$scaffoldId", (selection) => {
    expect(
      parseChatRequestMeta({ buildIntent: "website", buildMethod: "freeform", ...selection })
        .buildIntent,
    ).toBe("website");
  });

  it("keeps default and unrelated metadata boundaries intact", () => {
    const parsed = parseChatRequestMeta({
      buildIntent: "bogus",
      buildMethod: "fritext",
      lifecycleStage: "integrations",
      parentVersionId: " parent ",
      promptHandoffId: " handoff ",
      promptSourcePreservePayload: true,
    });
    expect(parsed.buildIntent).toBe("website");
    expect(parsed.buildMethod).toBeNull();
    expect(parsed.lifecycleStage).toBe("integrations");
    expect(parsed.parentVersionId).toBe("parent");
    expect(parsed.promptHandoffId).toBe("handoff");
    expect(parsed.promptSourcePreservePayload).toBe(true);
  });
});
