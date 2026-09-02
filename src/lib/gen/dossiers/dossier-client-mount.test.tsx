/**
 * R8 (restlistan 2026-07-27): beteendetäckning per Kopplad (hard) dossier.
 *
 * Före den här filen fanns beteendetester för fyra dossiers i
 * `dossier-config-fallback.test.tsx`, men inget som **tvingade** en ny dossier
 * att få något. Vilka som var otestade — och varför — stod som prosa i en
 * kommentar, och en kommentar driftar: lägger någon till en Kopplad dossier med
 * en klientkomponent i morgon faller ingenting.
 *
 * Lärdomen från backoffice Fas C gäller här också: **när en regel bara finns i
 * en av flera skrivvägar är den inte en regel, den är en slump.** Därför är
 * täckningen härledd ur manifesten i stället för uppräknad i huvudet:
 *
 *  1. `COVERAGE GATE` läser varje hard-manifest, plockar ut alla `role: "client"`
 *     `.tsx`-filer och kräver att var och en står i **exakt en** av två listor —
 *     monterad (här eller i en namngiven svit) eller undantagen med ett skäl.
 *     En ny klientkomponent utan post fäller testet med sökvägen i felet.
 *  2. Monteringsfallen nedan täcker de komponenter som inte redan hade ett
 *     beteendetest. Kontraktet är detsamma för alla: **utan nycklar ska ytan
 *     rendera en lugn demo-/setup-yta, aldrig krascha och aldrig läcka en rå
 *     statuskod till besökaren.**
 *
 * Komponenterna importeras direkt från `data/dossiers/hard/**` — de är vanlig
 * TSX. `.ts`-filer under `role: "client"` (SDK-wrappers, `sentry.client.config`)
 * är inte komponenter och ligger utanför grinden med flit.
 */
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `usePathname` (visit-beacon) only works inside the App Router; the beacon
// tests drive the path through this mock.
const pathnameMock = vi.fn<() => string | null>(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));

import { BookingCalendar } from "../../../../data/dossiers/hard/calcom-booking/components/booking-calendar";
import { NewsletterForm } from "../../../../data/dossiers/hard/mailchimp-newsletter/components/newsletter-form";
import { DbConfigNotice } from "../../../../data/dossiers/hard/postgres-drizzle/components/db-config-notice";
import { MediaConfigNotice } from "../../../../data/dossiers/hard/vercel-blob-media/components/media-config-notice";
import { MediaGallery } from "../../../../data/dossiers/hard/vercel-blob-media/components/media-gallery";
import StatistikPage from "../../../../data/dossiers/hard/visitor-counter/app/statistik/page";
import { VisitBeacon } from "../../../../data/dossiers/hard/visitor-counter/components/visit-beacon";
import { VisitorStats } from "../../../../data/dossiers/hard/visitor-counter/components/visitor-stats";

const HARD_DIR = path.resolve(__dirname, "../../../../data/dossiers/hard");

/**
 * Klientkomponenter med ett beteendetest. Värdet säger VAR, så en läsare inte
 * behöver leta — och så en flyttad svit syns som ett trasigt värde.
 */
const MOUNTED: Record<string, string> = {
  "calcom-booking/components/booking-calendar.tsx": "denna fil",
  "mailchimp-newsletter/components/newsletter-form.tsx": "denna fil",
  "postgres-drizzle/components/db-config-notice.tsx": "denna fil",
  "vercel-blob-media/components/media-config-notice.tsx": "denna fil",
  "vercel-blob-media/components/media-gallery.tsx": "denna fil",
  "visitor-counter/components/visit-beacon.tsx": "denna fil",
  "visitor-counter/components/visitor-stats.tsx": "denna fil",
  "visitor-counter/app/statistik/page.tsx": "denna fil",
  "resend-contact-form/components/integration-config-notice.tsx":
    "denna fil (via kopie-vakten)",
  "clerk-auth/components/auth-buttons.tsx": "dossier-config-fallback.test.tsx",
  "resend-contact-form/components/contact-form.tsx": "dossier-config-fallback.test.tsx",
  "stripe-checkout/components/checkout-button.tsx": "dossier-config-fallback.test.tsx",
  "stripe-checkout/components/integration-config-notice.tsx":
    "dossier-config-fallback.test.tsx",
};

/**
 * Notiskomponenter som med flit finns i flera exemplar. Duplikatet är
 * arkitekturen — en dossier får inte importera en fil ur en annan dossier, för
 * då kan capability B inte levereras utan A. Men **divergens** är inte
 * arkitekturen: driftar en kopia isär får två sajter olika demo-copy för samma
 * läge, och den som läser den ena filen tror att den beskriver alla.
 *
 * Kopie-vakten nedan monterar en av varje familj och kräver att de övriga är
 * byte-identiska. Ska en kopia medvetet skilja sig: bryt ut den ur familjen och
 * ge den ett eget monteringsfall.
 */
const IDENTICAL_COPY_FAMILIES: Record<string, string[]> = {
  // neon-postgres / mongodb-atlas parked 2026-08-06 — only postgres-drizzle
  // remains; no identical-copy family for db-config-notice anymore.
  "integration-config-notice": [
    "resend-contact-form/components/integration-config-notice.tsx",
    "stripe-checkout/components/integration-config-notice.tsx",
  ],
};

/**
 * Klientkomponenter som medvetet INTE monteras, med skälet bevarat intill
 * posten så nästa läsare inte behöver gissa. Att lägga till en post här är ett
 * kontraktsval, inte en genväg: kan ytan monteras utan att fejka bort det som
 * testas, hör den i `MOUNTED`.
 */
const UNMOUNTABLE: Record<string, string> = {
  "clerk-auth/components/clerk-provider-shell.tsx":
    "Renderar `ClerkProvider` ur den genererade sajtens beroende; repots alias pekar på en inert stub (`tests/stubs/clerk-nextjs.tsx`), så en montering skulle bevisa stubben. Nyckelgrinden `isLikelyValidClerkPublishableKey` täcks via AuthButtons.",
  "openai-chat/components/chat-panel.tsx":
    "`useChat` från `@ai-sdk/react` kräver en transport och ett strömmande svar; det canned demo-svaret testas där det bor — på routen, i dossier-config-fallback.test.tsx.",
  "supabase-auth/components/supabase-auth-notice.tsx":
    "Importerar `@/lib/supabase/config`, som dossiern själv levererar — `@` pekar på repots `src/` här, så sökvägen finns inte. Env-grinden bakom notisen täcks av supabase-auth-guards.test.ts.",
  "vercel-analytics/components/analytics-providers.tsx":
    "Två beacon-komponenter från Vercel, ingen egen användarsynlig yta och ingen demoväg — en analytics-beacon har inget att montera.",
};

interface DossierManifest {
  id: string;
  files?: { path: string; role?: string }[];
}

/**
 * Rollerna som ger en renderbar React-komponent. `shared` hör med: de rena
 * presentationsnotiserna (`integration-config-notice`, `db-config-notice`)
 * saknar `"use client"` med flit — de har inga hooks och fungerar som server-
 * komponenter också — men de renderar en användarsynlig setup-yta och behöver
 * därför exakt samma täckning som en `client`-komponent. Att bara grinda
 * `client` hade tystat två av de ytor som redan var testade.
 */
const RENDERABLE_ROLES = new Set(["client", "shared"]);

/** Alla renderbara `.tsx`-filer i Kopplade dossiers, som `<id>/<path>`. */
function readHardRenderableComponents(): string[] {
  const found: string[] = [];
  for (const dir of fs.readdirSync(HARD_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const manifestPath = path.join(HARD_DIR, dir.name, "manifest.json");
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

function mockFetchOnce(status: number, body?: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  pathnameMock.mockReset();
  pathnameMock.mockReturnValue("/");
  window.sessionStorage.clear();
});

describe("täckningsgrind: varje Kopplad dossiers renderbara komponenter", () => {
  it("är antingen monterad eller undantagen med ett skäl", () => {
    const missing = readHardRenderableComponents().filter(
      (key) => !(key in MOUNTED) && !(key in UNMOUNTABLE),
    );
    expect(
      missing,
      `Renderbar komponent i en Kopplad dossier utan beteendetäckning:\n  ${missing.join(
        "\n  ",
      )}\nLägg ett monteringsfall i dossier-client-mount.test.tsx och en post i MOUNTED, ` +
        "eller — om ytan inte kan monteras utan att fejka bort det som testas — en post i " +
        "UNMOUNTABLE med skälet skrivet ut.",
    ).toEqual([]);
  });

  it("har inga poster kvar för filer som inte längre finns (ingen död täckningslista)", () => {
    const actual = new Set(readHardRenderableComponents());
    const stale = [...Object.keys(MOUNTED), ...Object.keys(UNMOUNTABLE)].filter(
      (key) => !actual.has(key),
    );
    expect(
      stale,
      `Post(er) i MOUNTED/UNMOUNTABLE pekar på en komponent som inte finns i något ` +
        `hard-manifest längre:\n  ${stale.join("\n  ")}\nTa bort posten — annars döljer ` +
        "listan att täckningen gäller en fil som är borta.",
    ).toEqual([]);
  });

  it("nämner varje undantag med ett icke-tomt skäl", () => {
    for (const [key, reason] of Object.entries(UNMOUNTABLE)) {
      expect(reason.trim().length, `Undantaget ${key} saknar skäl`).toBeGreaterThan(20);
    }
  });
});

describe("kopie-vakt: avsiktligt duplicerade notiser får inte drifta isär", () => {
  it.each(Object.entries(IDENTICAL_COPY_FAMILIES))(
    "%s är byte-identisk i alla dossiers som levererar den",
    (family, members) => {
      const contents = members.map((member) => ({
        member,
        text: fs.readFileSync(path.join(HARD_DIR, member), "utf8"),
      }));
      const [first, ...rest] = contents;
      for (const other of rest) {
        expect(
          other.text,
          `${family}: ${other.member} skiljer sig från ${first.member}. ` +
            "Duplikatet finns för att dossiers ska vara självbärande, men kopiorna ska " +
            "vara identiska — antingen synka dem, eller bryt ut den avvikande ur " +
            "IDENTICAL_COPY_FAMILIES och ge den ett eget monteringsfall.",
        ).toBe(first.text);
      }
    },
  );
});

describe("BookingCalendar — Cal.com visual demo fallback", () => {
  const ENV_KEY = "NEXT_PUBLIC_CALCOM_LINK";
  const savedValue = process.env[ENV_KEY];

  afterEach(() => {
    if (savedValue === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedValue;
  });

  it("renders a complete demo surface and never pretends to reserve a time", async () => {
    delete process.env[ENV_KEY];
    render(<BookingCalendar />);

    expect(screen.getByRole("heading", { name: "Boka en tid" })).toBeTruthy();
    expect(screen.getByText(/Demoläge/)).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "09:00" });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.getAttribute("aria-labelledby")).toBe("booking-demo-title");
    expect(screen.getByText(/Ingen tid reserverades/)).toBeTruthy();
    expect(screen.queryByTestId("calcom-embed")).toBeNull();

    const closeButton = screen.getByRole("button", { name: "Stäng" });
    trigger.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.click(closeButton);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("treats a full URL, domain prefix or preview placeholder as unconfigured", () => {
    for (const invalid of [
      "https://cal.com/anna/30min",
      "//cal.com/anna/30min",
      "cal.com/anna/30min",
      "next_public_calcom_link_placeholder_preview_not_real",
    ]) {
      process.env[ENV_KEY] = invalid;
      const { unmount } = render(<BookingCalendar />);
      expect(screen.queryByTestId("calcom-embed")).toBeNull();
      expect(screen.getByText(/Demoläge/)).toBeTruthy();
      unmount();
    }
  });

  it("mounts the official embed and safe hosted fallback for a valid event path", () => {
    process.env[ENV_KEY] = "anna/30min";
    render(<BookingCalendar layout="week_view" />);

    const embed = screen.getByTestId("calcom-embed");
    expect(embed.getAttribute("data-cal-link")).toBe("anna/30min");
    expect(embed.getAttribute("data-cal-namespace")).toBe("booking");
    expect(embed.getAttribute("data-cal-config")).toContain("week_view");
    expect(screen.getByRole("link", { name: /boka direkt hos Cal.com/ }).getAttribute("href")).toBe(
      "https://cal.com/anna/30min",
    );
  });
});

describe("DbConfigNotice — seed-läge (postgres-drizzle)", () => {
  it("säger att det är exempeldata, diskret och utan att låta som ett fel", () => {
    const { container } = render(<DbConfigNotice />);

    expect(screen.getByText(/Visar exempeldata/)).toBeTruthy();
    // Seed-läget ska läsa som "inte uppsatt ännu", inte som ett kraschat anrop.
    expect(container.innerHTML).not.toContain("destructive");
    expect(container.textContent).not.toMatch(/fel|error/i);
  });
});

describe("MediaGallery — seed-läge (vercel-blob-media, mock: seed)", () => {
  const items = [
    { id: "seed/a", kind: "image", url: "https://example.test/a.jpg", title: "Kök", alt: "Kök" },
    { id: "seed/v", kind: "video", url: "https://example.test/v.mp4", title: "Film" },
  ];

  it("renderar exempelmedia med den diskreta notisen i demoläge", async () => {
    mockFetchOnce(200, { ok: true, demo: true, items });
    const { container } = render(<MediaGallery />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Kök" })).toBeTruthy();
    });
    expect(container.querySelector("video source")?.getAttribute("src")).toBe(
      "https://example.test/v.mp4",
    );
    expect(screen.getByText(/Visar exempelbilder och -filmer/)).toBeTruthy();
    // Seed-läget ska läsa som "inte kopplat ännu", inte som ett fel.
    expect(container.textContent).not.toMatch(/fel|error/i);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/media");
  });

  it("visar INGEN notis när biblioteket är riktigt kopplat, och skickar mappen som query", async () => {
    mockFetchOnce(200, { ok: true, demo: false, items });
    render(<MediaGallery folder="vara-arbeten" />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Kök" })).toBeTruthy();
    });
    expect(screen.queryByText(/mediabiblioteket är inte kopplat/)).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/media?folder=vara-arbeten");
  });

  it("visar tomläget när biblioteket är kopplat men saknar filer", async () => {
    mockFetchOnce(200, { ok: true, demo: false, items: [] });
    render(<MediaGallery emptyText="Inget här ännu." />);

    await waitFor(() => {
      expect(screen.getByText("Inget här ännu.")).toBeTruthy();
    });
  });

  it("visar en lugn 'Försök igen' utan statuskod när listningen fallerar", async () => {
    mockFetchOnce(502, { ok: false, error: "media-list-failed" });
    render(<MediaGallery />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeTruthy();
    expect(screen.queryByText(/502/)).toBeNull();
  });
});

describe("MediaConfigNotice — seed-läge (vercel-blob-media)", () => {
  it("säger att det är exempelmedia, diskret och utan att låta som ett fel", () => {
    const { container } = render(<MediaConfigNotice />);

    expect(screen.getByText(/Visar exempelbilder och -filmer/)).toBeTruthy();
    expect(container.innerHTML).not.toContain("destructive");
    expect(container.textContent).not.toMatch(/fel|error/i);
  });
});

// visitor-counter (2026-09-02): the owner-visible analytics default. Contract:
// the beacon counts exactly once per navigation, never on /statistik, and the
// stats page is honest about demo numbers without ever looking broken.
describe("VisitBeacon — en träff per navigation (visitor-counter)", () => {
  function postedBodies(): Array<{ newVisitor: boolean }> {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    return fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
  }

  it("postar en träff med newVisitor=true första gången i sessionen, sedan false", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    pathnameMock.mockReturnValue("/");
    const { rerender } = render(<VisitBeacon />);
    // Re-render without a route change must NOT count again.
    rerender(<VisitBeacon />);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/visits");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);

    pathnameMock.mockReturnValue("/kontakt");
    rerender(<VisitBeacon />);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(postedBodies()).toEqual([{ newVisitor: true }, { newVisitor: false }]);
  });

  it("räknar aldrig statistiksidan själv", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    pathnameMock.mockReturnValue("/statistik");
    render(<VisitBeacon />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("renderar ingenting synligt och överlever ett misslyckat anrop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { container } = render(<VisitBeacon />);
    expect(container.innerHTML).toBe("");
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  });
});

describe("VisitorStats — seed-läge (visitor-counter, mock: seed)", () => {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(1 + i).padStart(2, "0")}`,
    views: 10 + i,
    visitors: 5 + i,
  }));
  const stats = {
    today: days[days.length - 1],
    total: { views: 1234, visitors: 567 },
    days,
    demo: true,
  };

  it("visar dagens siffror, totaler, stapeldiagram och den ärliga demo-notisen", async () => {
    mockFetchOnce(200, { ok: true, demo: true, stats });
    const { container } = render(<VisitorStats />);

    await waitFor(() => {
      expect(screen.getByText("Besökare idag")).toBeTruthy();
    });
    expect(screen.getByText("18")).toBeTruthy();
    expect(screen.getByText("567")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Besökare per dag" }).children).toHaveLength(14);
    expect(screen.getByRole("note").textContent).toMatch(/Demoläge/);
    // Seed-läget ska läsa som "inte kopplat ännu", inte som ett fel.
    expect(container.textContent).not.toMatch(/fel|error/i);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/visits", { cache: "no-store" });
  });

  it("visar INGEN demo-notis när lagringen är riktigt kopplad", async () => {
    mockFetchOnce(200, { ok: true, demo: false, stats: { ...stats, demo: false } });
    render(<VisitorStats />);

    await waitFor(() => {
      expect(screen.getByText("Besökare idag")).toBeTruthy();
    });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("visar en lugn 'Försök igen' utan statuskod när läsningen fallerar", async () => {
    mockFetchOnce(502, { ok: false, error: "visits-read-failed" });
    render(<VisitorStats />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeTruthy();
    expect(screen.queryByText(/502/)).toBeNull();
  });
});

describe("StatistikPage — den standardiserade statistiksidan (visitor-counter)", () => {
  it("renderar rubriken och monterar VisitorStats", async () => {
    mockFetchOnce(200, {
      ok: true,
      demo: true,
      stats: {
        today: { date: "2026-09-02", views: 3, visitors: 2 },
        total: { views: 3, visitors: 2 },
        days: [{ date: "2026-09-02", views: 3, visitors: 2 }],
        demo: true,
      },
    });
    render(<StatistikPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Besöksstatistik" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Besökare idag")).toBeTruthy();
    });
  });
});

describe("NewsletterForm — demoläge (mailchimp-newsletter, mock: success)", () => {
  function submit(email: string): void {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
  }

  it("byter till setup-texten när routen svarar 503", async () => {
    mockFetchOnce(503, { ok: false, error: "newsletter-not-configured" });
    render(<NewsletterForm />);
    submit("anna@example.com");

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    expect(screen.getByText("MAILCHIMP_API_KEY")).toBeTruthy();
    expect(screen.getByText("MAILCHIMP_AUDIENCE_ID")).toBeTruthy();
    expect(screen.queryByText(/503/)).toBeNull();
  });

  it("är ärlig om att demo-prenumerationen inte registrerades", async () => {
    mockFetchOnce(200, { ok: true, status: "subscribed", demo: true });
    render(<NewsletterForm />);
    submit("anna@example.com");

    await waitFor(() => {
      expect(screen.getByText(/Thanks! Check your inbox/)).toBeTruthy();
    });
    // Demoläget får aldrig se ut som en riktig prenumeration.
    expect(screen.getByText(/prenumerationen registrerades inte på riktigt/)).toBeTruthy();
  });

  it("visar INGEN demo-notis på ett riktigt lyckat svar", async () => {
    mockFetchOnce(200, { ok: true, status: "subscribed" });
    render(<NewsletterForm />);
    submit("anna@example.com");

    await waitFor(() => {
      expect(screen.getByText(/Thanks! Check your inbox/)).toBeTruthy();
    });
    expect(screen.queryByText(/registrerades inte på riktigt/)).toBeNull();
  });

  it("skickar inget alls för en ogiltig adress", () => {
    mockFetchOnce(200, { ok: true });
    render(<NewsletterForm />);
    submit("inte-en-adress");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
