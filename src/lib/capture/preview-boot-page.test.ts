import { describe, expect, it } from "vitest";
import {
  PREVIEW_HOST_BOOT_MARKER_NAME,
  PreviewHostBootPageError,
  PreviewProbeUnreadableError,
  classifyPreviewPageProbe,
  collectPreviewHostBootPageProbe,
  isPreviewHostBootPage,
  isPreviewHostBootPageError,
  isPreviewProbeUnreadableError,
} from "./preview-boot-page";

describe("classifyPreviewPageProbe", () => {
  it("treats the explicit host boot marker as the primary boot_page signal", () => {
    expect(
      classifyPreviewPageProbe({
        title: "Startar preview",
        h1: "Sajten startar",
        bodyText: "Preview byggs och startas.",
        bootMarker: "starting",
      }),
    ).toBe("boot_page");
    expect(
      classifyPreviewPageProbe({
        title: "Startar om preview",
        h1: "Sajten startas om",
        bodyText: "Preview startas om.",
        bootMarker: "recovering",
      }),
    ).toBe("boot_page");
    expect(
      classifyPreviewPageProbe({
        title: "Preview kunde inte starta",
        h1: "Preview kunde inte starta",
        bodyText: "Uppstarten misslyckades.",
        bootMarker: "error",
      }),
    ).toBe("boot_page");
    expect(
      classifyPreviewPageProbe({
        title: "",
        h1: null,
        bodyText: "",
        bootMarker: "starting",
      }),
    ).toBe("boot_page");
    expect(
      classifyPreviewPageProbe({
        title: "Jakob & Johan Stays",
        h1: "Hero",
        bodyText: "Handplockade.",
        bootMarker: "nope",
      }),
    ).toBe("live");
  });

  it("detects the preview-host starting / recovering placeholder as boot_page", () => {
    expect(
      classifyPreviewPageProbe({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText: "Preview-host bygger projektet och startar Next.js i bakgrunden.",
      }),
    ).toBe("boot_page");
    expect(
      classifyPreviewPageProbe({
        title: "Startar om preview",
        h1: "Startar om preview",
        bodyText: "Preview-runtimen startar om i bakgrunden. Sidan laddar om automatiskt.",
      }),
    ).toBe("boot_page");
    expect(
      classifyPreviewPageProbe({
        title: "Preview kunde inte starta",
        h1: "Preview kunde inte starta",
        bodyText: "Uppstarten misslyckades.",
      }),
    ).toBe("boot_page");
  });

  it("detects Status: warm_project on the placeholder body as boot_page", () => {
    expect(
      classifyPreviewPageProbe({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText:
          "Preview-host bygger projektet och startar Next.js i bakgrunden.\n" +
          "Chat: 8aeac552-f309-4610-b9c0-6be7309d5c38\n" +
          "Status: warm_project",
      }),
    ).toBe("boot_page");
    // Status pill alone is enough — that exact label only exists on the host page.
    expect(
      classifyPreviewPageProbe({
        title: "",
        h1: null,
        bodyText: "Status: warm_project",
      }),
    ).toBe("boot_page");
  });

  it("does not treat a real site heading as a boot page", () => {
    expect(
      classifyPreviewPageProbe({
        title: "Jakob & Johan Stays",
        h1: "Exklusiva semesterbostäder",
        bodyText: "Handplockade premiumboenden i Palma.",
      }),
    ).toBe("live");
  });

  it("classifies empty or missing probes as unreadable, not boot_page", () => {
    expect(classifyPreviewPageProbe({ title: "", h1: null, bodyText: "" })).toBe("unreadable");
    expect(classifyPreviewPageProbe(null)).toBe("unreadable");
    expect(classifyPreviewPageProbe(undefined)).toBe("unreadable");
    expect(
      classifyPreviewPageProbe({
        title: "Home",
        h1: null,
        bodyText: "",
      }),
    ).toBe("unreadable");
    expect(isPreviewHostBootPage({ title: "", h1: null, bodyText: "" })).toBe(false);
    expect(
      isPreviewHostBootPage({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText: "Preview-host bygger projektet och startar Next.js i bakgrunden.",
      }),
    ).toBe(true);
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
    expect(isPreviewHostBootPageError(new PreviewProbeUnreadableError())).toBe(false);
  });
});

describe("isPreviewProbeUnreadableError", () => {
  it("matches the dedicated error and does not claim a boot page", () => {
    const direct = new PreviewProbeUnreadableError();
    expect(direct.code).toBe("preview_probe_unreadable");
    expect(direct.message).not.toMatch(/preview-host|startsidan|Startar preview/i);
    expect(isPreviewProbeUnreadableError(direct)).toBe(true);
    expect(
      isPreviewProbeUnreadableError(
        new Error('Thumbnail capture failed at stage "boot-page-check": x', { cause: direct }),
      ),
    ).toBe(true);
    expect(isPreviewProbeUnreadableError(new PreviewHostBootPageError())).toBe(false);
    expect(isPreviewHostBootPageError(direct)).toBe(false);
  });
});

describe("collectPreviewHostBootPageProbe", () => {
  it("is self-contained for Playwright evaluate and reads data/meta markers", () => {
    expect(collectPreviewHostBootPageProbe.toString()).toContain(PREVIEW_HOST_BOOT_MARKER_NAME);
    document.documentElement.setAttribute(`data-${PREVIEW_HOST_BOOT_MARKER_NAME}`, "starting");
    document.head.innerHTML = `<meta name="${PREVIEW_HOST_BOOT_MARKER_NAME}" content="starting"><title>Startar preview</title>`;
    document.body.innerHTML = "<h1>Sajten startar</h1><p>Preview byggs och startas.</p>";
    const probe = collectPreviewHostBootPageProbe();
    expect(probe.title).toBe("Startar preview");
    expect(probe.h1).toBe("Sajten startar");
    expect(probe.bootMarker).toBe("starting");
    // jsdom leaves `innerText` empty; Playwright fills `bodyText` in capture.
    document.documentElement.removeAttribute(`data-${PREVIEW_HOST_BOOT_MARKER_NAME}`);
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });
});
