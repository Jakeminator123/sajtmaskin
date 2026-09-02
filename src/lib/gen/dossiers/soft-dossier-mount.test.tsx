/**
 * Beteendetäckning per Fristående (soft) dossier.
 *
 * Täckningen är härledd ur manifesten i stället för uppräknad i huvudet:
 *
 *  1. `COVERAGE GATE` läser varje soft-manifest, plockar ut alla
 *     `role: "client"` / `role: "shared"` `.tsx`-filer och kräver att var
 *     och en står i **exakt en** av två listor — monterad (här eller i en
 *     namngiven svit) eller undantagen med ett skäl. En ny
 *     klientkomponent utan post fäller testet med sökvägen i felet.
 *  2. Monteringsfallen nedan täcker de komponenter som inte redan hade ett
 *     beteendetest i en syskonfil.
 *
 * Komponenterna importeras direkt från `data/dossiers/soft/**` — de är
 * vanlig TSX. `.ts`-filer under `role: "client"` / `shared` (hooks, seed,
 * specs) är inte komponenter och ligger utanför grinden med flit.
 *
 * Komponenter vars genererade-sajtsberoende saknas i det här repot listas
 * i `UNMOUNTABLE` med skälet. Dörren till att montera dem är en stub under
 * `tests/stubs/` (se README där).
 */
import fs from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "../../../../data/dossiers/soft/cmdk-command-palette/components/command-palette";
import { ChartCard } from "../../../../data/dossiers/soft/dashboard-charts/components/chart-card";
import { Carousel } from "../../../../data/dossiers/soft/embla-carousel/components/carousel";
import { GalleryLightbox } from "../../../../data/dossiers/soft/gallery-lightbox/components/gallery-lightbox";

const SOFT_DIR = path.resolve(__dirname, "../../../../data/dossiers/soft");

/**
 * Klientkomponenter med ett beteendetest. Värdet säger VAR, så en läsare inte
 * behöver leta — och så en flyttad svit syns som ett trasigt värde.
 */
const MOUNTED: Record<string, string> = {
  "cmdk-command-palette/components/command-palette.tsx": "denna fil",
  "gallery-lightbox/components/gallery-lightbox.tsx": "denna fil",
  "embla-carousel/components/carousel.tsx": "denna fil",
  "dashboard-charts/components/chart-card.tsx": "denna fil",
  "scroll-story-orchestrator/components/scroll-story.tsx":
    "scroll-story-dossier.test.tsx",
  "scroll-story-orchestrator/components/scroll-story-progress.tsx":
    "scroll-story-dossier.test.tsx",
  "matter-physics-2d/components/physics-stage.tsx":
    "matter-physics-2d-dossier.test.tsx",
  "xyflow-spatial-canvas/components/spatial-canvas.tsx":
    "xyflow-spatial-canvas-dossier.test.tsx",
  "xyflow-spatial-canvas/components/spatial-card-node.tsx":
    "xyflow-spatial-canvas-dossier.test.tsx",
};

/**
 * Klientkomponenter som medvetet INTE monteras, med skälet bevarat intill
 * posten så nästa läsare inte behöver gissa. Att lägga till en post här är ett
 * kontraktsval, inte en genväg: kan ytan monteras utan att fejka bort det som
 * testas, hör den i `MOUNTED`.
 */
const UNMOUNTABLE: Record<string, string> = {
  "dashboard-charts/components/visactor-chart.tsx":
    "`@visactor/react-vchart` är ett genererad-sajtsberoende som inte är installerat i det här repot och saknar stub; en montering skulle inte ens resolva.",
  "local-site-search/components/site-search.tsx":
    "`minisearch` är inte installerat i det här repot och saknar stub; comboboxen kan inte importeras utan paketet.",
  "maplibre-map/components/map-display.tsx":
    "`maplibre-gl` är inte installerat och kartan kräver WebGL/canvas som jsdom inte kan ge.",
  "three-fiber-canvas/components/three-canvas-shell.tsx":
    "R3F `<Canvas>` kräver en WebGL-kontext som jsdom inte kan ge, även om `three` och `@react-three/fiber` finns i repot.",
};

interface DossierManifest {
  id: string;
  files?: { path: string; role?: string }[];
}

/**
 * Rollerna som ger en renderbar React-komponent. `shared` hör med: rena
 * presentationsytor (t.ex. `chart-card`) saknar `"use client"` med flit men
 * renderar en användarsynlig yta och behöver samma täckning som en
 * `client`-komponent.
 */
const RENDERABLE_ROLES = new Set(["client", "shared"]);

/** Alla renderbara `.tsx`-filer i Fristående dossiers, som `<id>/<path>`. */
function readSoftRenderableComponents(): string[] {
  const found: string[] = [];
  for (const dir of fs.readdirSync(SOFT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const manifestPath = path.join(SOFT_DIR, dir.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as DossierManifest;
    for (const file of manifest.files ?? []) {
      if (!RENDERABLE_ROLES.has(file.role ?? "")) continue;
      if (!file.path.endsWith(".tsx")) continue;
      found.push(`${manifest.id}/${file.path}`);
    }
  }
  return found.sort();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("täckningsgrind: varje Fristående dossiers renderbara komponenter", () => {
  it("är antingen monterad eller undantagen med ett skäl", () => {
    const missing = readSoftRenderableComponents().filter(
      (key) => !(key in MOUNTED) && !(key in UNMOUNTABLE),
    );
    expect(
      missing,
      `Renderbar komponent i en Fristående dossier utan beteendetäckning:\n  ${missing.join(
        "\n  ",
      )}\nLägg ett monteringsfall i soft-dossier-mount.test.tsx och en post i MOUNTED, ` +
        "eller — om ytan inte kan monteras utan att fejka bort det som testas — en post i " +
        "UNMOUNTABLE med skälet skrivet ut.",
    ).toEqual([]);
  });

  it("har inga poster kvar för filer som inte längre finns (ingen död täckningslista)", () => {
    const actual = new Set(readSoftRenderableComponents());
    const stale = [...Object.keys(MOUNTED), ...Object.keys(UNMOUNTABLE)].filter(
      (key) => !actual.has(key),
    );
    expect(
      stale,
      `Post(er) i MOUNTED/UNMOUNTABLE pekar på en komponent som inte finns i något ` +
        `soft-manifest längre:\n  ${stale.join("\n  ")}\nTa bort posten — annars döljer ` +
        "listan att täckningen gäller en fil som är borta.",
    ).toEqual([]);
  });

  it("nämner varje undantag med ett icke-tomt skäl", () => {
    for (const [key, reason] of Object.entries(UNMOUNTABLE)) {
      expect(reason.trim().length, `Undantaget ${key} saknar skäl`).toBeGreaterThan(20);
    }
  });
});

describe("CommandPalette — kommandopalett (cmdk-command-palette)", () => {
  const groups = [
    {
      heading: "Navigering",
      items: [
        { label: "Gå hem", keywords: ["home"], onSelect: vi.fn(), shortcut: ["g"] },
        { label: "Logga ut", onSelect: vi.fn() },
      ],
    },
  ];

  function renderPalette() {
    return render(<CommandPalette groups={groups} emptyMessage="Inget matchade." />);
  }

  function openWithShortcut() {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  }

  it("är stängd som standard utan dialog eller listbox", () => {
    renderPalette();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("öppnas med ctrl+k och visar de givna posterna", () => {
    renderPalette();
    openWithShortcut();

    expect(screen.getByRole("dialog", { name: "Kommandopalett" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Gå hem/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Logga ut/ })).toBeTruthy();
  });

  it("filtrerar listan när man skriver", () => {
    renderPalette();
    openWithShortcut();

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hem" } });

    expect(screen.getByRole("option", { name: /Gå hem/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Logga ut/ })).toBeNull();
  });

  it("stänger med Escape", () => {
    renderPalette();
    openWithShortcut();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("använder svenska standardtexter för dialog, platshållare och tom lista", () => {
    render(<CommandPalette groups={groups} />);
    openWithShortcut();

    expect(screen.getByRole("dialog", { name: "Kommandopalett" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Sök kommando…")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "xyzzy" } });
    expect(screen.getByText("Inga träffar.")).toBeTruthy();
  });
});

describe("GalleryLightbox — bildgalleri (gallery-lightbox)", () => {
  const items = [
    { src: "/kok.jpg", alt: "Kök", caption: "Köket efter renovering" },
    { src: "/badrum.jpg", alt: "Badrum" },
    { src: "/tradgard.jpg", alt: "Trädgård" },
  ];

  function renderGallery() {
    return render(<GalleryLightbox items={items} title="Våra rum" />);
  }

  it("renderar en knapp och en bild per post med alt-text", () => {
    renderGallery();

    expect(screen.getByRole("heading", { name: "Våra rum" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Öppna bild: Kök" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Öppna bild: Badrum" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Öppna bild: Trädgård" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Kök" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Badrum" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Trädgård" })).toBeTruthy();
  });

  it("öppnar en dialog med den stora bilden vid klick", () => {
    renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Öppna bild: Kök" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Köket efter renovering");
    const large = within(dialog).getByRole("img", { name: "Kök" });
    expect(large.getAttribute("src")).toBe("/kok.jpg");
  });

  it("stänger med Escape och med stängknappen", () => {
    renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Öppna bild: Kök" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Öppna bild: Badrum" }));
    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("byter bild med ArrowRight och ArrowLeft", () => {
    renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Öppna bild: Kök" }));

    fireEvent.keyDown(document, { key: "ArrowRight" });
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe("/badrum.jpg");
    expect(within(dialog).getByRole("img").getAttribute("alt")).toBe("Badrum");

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe("/kok.jpg");
    expect(within(dialog).getByRole("img").getAttribute("alt")).toBe("Kök");
  });

  it("gatar hover-skalan bakom motion-safe och använder svenska styrknappar", () => {
    renderGallery();

    const thumb = screen.getByRole("img", { name: "Kök" });
    expect(thumb.className).toContain("motion-safe:group-hover:scale-105");
    expect(thumb.className).not.toMatch(/(?<!motion-safe:)group-hover:scale-105/);

    fireEvent.click(screen.getByRole("button", { name: "Öppna bild: Kök" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Stäng" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Föregående bild" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Nästa bild" })).toBeTruthy();
  });
});

describe("Carousel — bildkarusell (embla-carousel)", () => {
  function renderCarousel() {
    return render(
      <Carousel ariaLabel="Kundomdömen">
        <div>Ett</div>
        <div>Två</div>
        <div>Tre</div>
      </Carousel>,
    );
  }

  it("monterar regionen med svenska pilknappar utan att kräva autoplay", () => {
    renderCarousel();

    expect(screen.getByRole("region", { name: "Kundomdömen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Föregående bild i Kundomdömen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nästa bild i Kundomdömen" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "1 av 3" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "2 av 3" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "3 av 3" })).toBeTruthy();
  });

  it("byter bild med piltangenterna när karusellen har fokus", () => {
    renderCarousel();
    const region = screen.getByRole("region", { name: "Kundomdömen" });
    region.focus();
    fireEvent.keyDown(region, { key: "ArrowRight" });
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(region).toBeTruthy();
  });
});

describe("ChartCard — diagramkort (dashboard-charts)", () => {
  it("renderar titel, beskrivning och barn utan att dra in diagram-libbet", () => {
    render(
      <ChartCard title="Försäljning" description="Per månad">
        <p>Diagramyta</p>
      </ChartCard>,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Försäljning" })).toBeTruthy();
    expect(screen.getByText("Per månad")).toBeTruthy();
    expect(screen.getByText("Diagramyta")).toBeTruthy();
  });
});
