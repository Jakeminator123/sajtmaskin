import { describe, expect, it } from "vitest";
import { matchScaffold } from "./matcher";

describe("matchScaffold", () => {
  it("returns landing-page for generic Swedish business prompt under website intent", () => {
    const result = matchScaffold("Vi är ett byggföretag i Stockholm som vill ha en hemsida", "website");
    expect(result?.id).toBe("landing-page");
  });

  it("returns app-shell for prompts with interactive signals under website intent", () => {
    const result = matchScaffold(
      "Jag vill ha ett bokningssystem med kalender och filter för mina kunder",
      "website",
    );
    expect(result?.family).toBe("app-shell");
  });

  it("returns dashboard for prompts with dashboard keywords at app intent", () => {
    const result = matchScaffold(
      "Bygg en instrumentpanel med analys och statistik",
      "app",
    );
    expect(result?.family).toBe("dashboard");
  });

  it("returns app-shell for explicit app intent even without strong keywords", () => {
    const result = matchScaffold("Bygg en enkel plattform", "app");
    expect(result?.family).toBe("app-shell");
  });

  it("returns dashboard for app intent with dashboard keywords", () => {
    const result = matchScaffold("Bygg en instrumentpanel med statistik och nyckeltal", "app");
    expect(result?.family).toBe("dashboard");
  });

  it("returns auth-pages for auth-heavy prompts", () => {
    const result = matchScaffold("Skapa en inloggning och registrering med lösenord", "website");
    expect(result?.family).toBe("auth-pages");
  });

  it("returns ecommerce for shop prompts", () => {
    const result = matchScaffold("En e-handel med produkter och varukorg", "website");
    expect(result?.family).toBe("ecommerce");
  });

  it("returns blog for blog prompts", () => {
    const result = matchScaffold("En blogg med artiklar och nyhetsbrev", "website");
    expect(result?.family).toBe("blog");
  });

  it("returns portfolio for creative prompts", () => {
    const result = matchScaffold("Portfolio för en fotograf med case studies", "website");
    expect(result?.family).toBe("portfolio");
  });

  it("returns base-nextjs as final fallback for non-website/non-template intents", () => {
    const result = matchScaffold("gör något", undefined);
    expect(result?.family).toBe("base-nextjs");
  });

  it("promotes to app-shell when prompt mentions workflow and internal tools", () => {
    const result = matchScaffold(
      "Bygg ett internt verktyg med arbetsflöde och godkännande",
      "website",
    );
    expect(result?.family).toBe("app-shell");
  });
});
