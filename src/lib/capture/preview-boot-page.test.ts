import { describe, expect, it } from "vitest";
import {
  PreviewHostBootPageError,
  isPreviewHostBootPage,
  isPreviewHostBootPageError,
} from "./preview-boot-page";

describe("isPreviewHostBootPage", () => {
  it("detects the preview-host starting / recovering placeholder", () => {
    expect(
      isPreviewHostBootPage({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText: "Preview-host bygger projektet och startar Next.js i bakgrunden.",
      }),
    ).toBe(true);
    expect(
      isPreviewHostBootPage({
        title: "Startar om preview",
        h1: "Startar om preview",
        bodyText: "Preview-runtimen startar om i bakgrunden. Sidan laddar om automatiskt.",
      }),
    ).toBe(true);
    expect(
      isPreviewHostBootPage({
        title: "Preview kunde inte starta",
        h1: "Preview kunde inte starta",
        bodyText: "Uppstarten misslyckades.",
      }),
    ).toBe(true);
  });

  it("detects Status: warm_project on the placeholder body", () => {
    expect(
      isPreviewHostBootPage({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText:
          "Preview-host bygger projektet och startar Next.js i bakgrunden.\n" +
          "Chat: 8aeac552-f309-4610-b9c0-6be7309d5c38\n" +
          "Status: warm_project",
      }),
    ).toBe(true);
    // Status pill alone is enough — that exact label only exists on the host page.
    expect(
      isPreviewHostBootPage({
        title: "",
        h1: null,
        bodyText: "Status: warm_project",
      }),
    ).toBe(true);
  });

  it("does not treat a real site heading as a boot page", () => {
    expect(
      isPreviewHostBootPage({
        title: "Jakob & Johan Stays",
        h1: "Exklusiva semesterbostäder",
        bodyText: "Handplockade premiumboenden i Palma.",
      }),
    ).toBe(false);
    expect(isPreviewHostBootPage({ title: "", h1: null, bodyText: "" })).toBe(true);
    expect(
      isPreviewHostBootPage({
        title: "Home",
        h1: null,
        bodyText: "",
      }),
    ).toBe(false);
  });
});

describe("isPreviewHostBootPageError", () => {
  it("matches the dedicated error and stage-wrapped causes", () => {
    const direct = new PreviewHostBootPageError();
    expect(isPreviewHostBootPageError(direct)).toBe(true);
    expect(
      isPreviewHostBootPageError(
        new Error('Thumbnail capture failed at stage "boot-page-check": x', { cause: direct }),
      ),
    ).toBe(true);
    expect(isPreviewHostBootPageError(new Error("net::ERR_TIMED_OUT"))).toBe(false);
  });
});
