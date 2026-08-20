import { describe, expect, it } from "vitest";
import {
  CHAT_COLLAPSE_STATUS_MAX_CHARS,
  resolveChatCollapseStatusText,
} from "./chat-collapse-status";

const NOTHING = {
  activeVersionStatus: null,
  f3Status: null,
} as const;

describe("resolveChatCollapseStatusText", () => {
  it("tiger när ingenting blockerar", () => {
    expect(resolveChatCollapseStatusText({ ...NOTHING })).toBeNull();
  });

  it("visar när versionen kontrolleras eller repareras", () => {
    expect(
      resolveChatCollapseStatusText({ ...NOTHING, activeVersionStatus: "verifying" }),
    ).toBe("Kontrollerar versionen");
    expect(
      resolveChatCollapseStatusText({ ...NOTHING, activeVersionStatus: "repairing" }),
    ).toBe("Reparerar versionen");
    expect(
      resolveChatCollapseStatusText({ ...NOTHING, activeVersionStatus: "ready" }),
    ).toBeNull();
  });

  it("visar preferred-headens kontroll även om den aktiva versionen är klar", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        activeVersionStatus: "ready",
        preferredVersionStatus: "verifying",
      }),
    ).toBe("Kontrollerar versionen");
  });

  it("visar en misslyckad version", () => {
    expect(
      resolveChatCollapseStatusText({ ...NOTHING, activeVersionStatus: "failed" }),
    ).toBe("Versionen misslyckades");
  });

  it("visar en version som en kontroll stoppat", () => {
    expect(
      resolveChatCollapseStatusText({ ...NOTHING, activeVersionStatus: "blocked" }),
    ).toBe("Versionen stoppades av en kontroll");
  });

  it("visar ett underkänt F3-utfall", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        f3Status: { tone: "error", title: "Integrationerna är inte klara." },
      }),
    ).toBe("Integrationerna är inte klara.");
  });

  it("visar ett varnande F3-utfall", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        f3Status: { tone: "warning", title: "Kontrollen hoppades över." },
      }),
    ).toBe("Kontrollen hoppades över.");
  });

  it("larmar inte om ett F3-utfall som inte är ett problem", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        f3Status: { tone: "success", title: "Integrationerna är klara." },
      }),
    ).toBeNull();
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        f3Status: { tone: "info", title: "Bygger integrationer." },
      }),
    ).toBeNull();
  });

  it("låter en misslyckad version gå före F3-utfall", () => {
    expect(
      resolveChatCollapseStatusText({
        activeVersionStatus: "failed",
        f3Status: { tone: "error", title: "Integrationerna är inte klara." },
      }),
    ).toBe("Versionen misslyckades");
  });

  it("släpper igenom F3-utfallet när versionen är klar", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        activeVersionStatus: "ready",
        f3Status: { tone: "error", title: "Integrationerna är inte klara." },
      }),
    ).toBe("Integrationerna är inte klara.");
  });

  it("kapar en F3-text som är för lång för raden", () => {
    const long = `Projektet måste sparas innan miljövariabler kan kopplas till bygget ${"x".repeat(40)}`;
    const result = resolveChatCollapseStatusText({
      ...NOTHING,
      f3Status: { tone: "error", title: long },
    });

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(CHAT_COLLAPSE_STATUS_MAX_CHARS);
    expect(result!.endsWith("…")).toBe(true);
  });
});
