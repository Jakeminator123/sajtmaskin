import { describe, expect, it } from "vitest";
import {
  CHAT_COLLAPSE_STATUS_MAX_CHARS,
  resolveChatCollapseStatusText,
} from "./chat-collapse-status";

const NOTHING = {
  activeVersionStatus: null,
  deployBlocker: null,
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

  it("visar publiceringsspärrens rubrik", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        deployBlocker: {
          id: "missing-env",
          title: "Obligatoriska nycklar saknas.",
          detail: "Saknas: STRIPE_SECRET_KEY. Lägg till dem under Byggblock.",
        },
      }),
    ).toBe("Obligatoriska nycklar saknas.");
  });

  it("faller tillbaka på spärrens detalj när rubriken är tom", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        deployBlocker: { id: "version-draft", title: "   ", detail: "Kör klart kontrollerna." },
      }),
    ).toBe("Kör klart kontrollerna.");
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

  it("behandlar inte 'kom igång' som en blockerare", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        deployBlocker: {
          id: "no-version",
          title: "Ingen version är vald.",
          detail: "Generera eller välj en version först.",
        },
      }),
    ).toBeNull();
  });

  it("låter en misslyckad version gå före publiceringsspärr och F3-utfall", () => {
    expect(
      resolveChatCollapseStatusText({
        activeVersionStatus: "failed",
        deployBlocker: { id: "missing-env", title: "Obligatoriska nycklar saknas.", detail: null },
        f3Status: { tone: "error", title: "Integrationerna är inte klara." },
      }),
    ).toBe("Versionen misslyckades");
  });

  it("låter publiceringsspärren gå före F3-utfallet", () => {
    expect(
      resolveChatCollapseStatusText({
        activeVersionStatus: "ready",
        deployBlocker: { id: "missing-env", title: "Obligatoriska nycklar saknas.", detail: null },
        f3Status: { tone: "error", title: "Integrationerna är inte klara." },
      }),
    ).toBe("Obligatoriska nycklar saknas.");
  });

  it("släpper igenom F3-utfallet när spärren bara är 'kom igång'", () => {
    expect(
      resolveChatCollapseStatusText({
        ...NOTHING,
        deployBlocker: { id: "no-version", title: "Ingen version är vald.", detail: null },
        f3Status: { tone: "error", title: "Integrationerna är inte klara." },
      }),
    ).toBe("Integrationerna är inte klara.");
  });

  it("kapar en text som är för lång för raden", () => {
    const long = `Projektet måste sparas innan miljövariabler kan kopplas till bygget ${"x".repeat(40)}`;
    const result = resolveChatCollapseStatusText({
      ...NOTHING,
      deployBlocker: { id: "project-context-missing", title: long, detail: null },
    });

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(CHAT_COLLAPSE_STATUS_MAX_CHARS);
    expect(result!.endsWith("…")).toBe(true);
  });
});
