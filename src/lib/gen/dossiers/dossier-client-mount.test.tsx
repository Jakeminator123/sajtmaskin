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

import { RealtimeConfigNotice } from "../../../../data/dossiers/hard/ably-realtime/components/realtime-config-notice";
import { NewsletterForm } from "../../../../data/dossiers/hard/mailchimp-newsletter/components/newsletter-form";
import { DbConfigNotice } from "../../../../data/dossiers/hard/neon-postgres/components/db-config-notice";
import { SubscriptionConfigNotice } from "../../../../data/dossiers/hard/paddle-billing/components/subscription-config-notice";
import { RagConfigNotice } from "../../../../data/dossiers/hard/rag-chat/components/rag-config-notice";

const HARD_DIR = path.resolve(__dirname, "../../../../data/dossiers/hard");

/**
 * Klientkomponenter med ett beteendetest. Värdet säger VAR, så en läsare inte
 * behöver leta — och så en flyttad svit syns som ett trasigt värde.
 */
const MOUNTED: Record<string, string> = {
  "ably-realtime/components/realtime-config-notice.tsx": "denna fil",
  "mailchimp-newsletter/components/newsletter-form.tsx": "denna fil",
  "mongodb-atlas/components/db-config-notice.tsx": "denna fil (via kopie-vakten)",
  "neon-postgres/components/db-config-notice.tsx": "denna fil",
  "paddle-billing/components/subscription-config-notice.tsx": "denna fil",
  "postgres-drizzle/components/db-config-notice.tsx": "denna fil (via kopie-vakten)",
  "rag-chat/components/rag-config-notice.tsx": "denna fil",
  "resend-contact-form/components/integration-config-notice.tsx":
    "denna fil (via kopie-vakten)",
  "clerk-auth/components/auth-buttons.tsx": "dossier-config-fallback.test.tsx",
  "resend-contact-form/components/contact-form.tsx": "dossier-config-fallback.test.tsx",
  "sanity-cms/components/sanity-config-notice.tsx": "dossier-config-fallback.test.tsx",
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
  "db-config-notice (seed-läge)": [
    "mongodb-atlas/components/db-config-notice.tsx",
    "neon-postgres/components/db-config-notice.tsx",
    "postgres-drizzle/components/db-config-notice.tsx",
  ],
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
  "ably-realtime/components/AblyClientProvider.tsx":
    "Öppnar en riktig Ably-websocket i en effekt via `@/lib/ably/client`. Att mocka klienten bort lämnar bara en provider som renderar children — noll kontraktsvärde. Demoytan testas via RealtimeConfigNotice nedan.",
  "clerk-auth/components/clerk-provider-shell.tsx":
    "Renderar `ClerkProvider` ur den genererade sajtens beroende; repots alias pekar på en inert stub (`tests/stubs/clerk-nextjs.tsx`), så en montering skulle bevisa stubben. Nyckelgrinden `isLikelyValidClerkPublishableKey` täcks via AuthButtons.",
  "openai-chat/components/chat-panel.tsx":
    "`useChat` från `@ai-sdk/react` kräver en transport och ett strömmande svar; det canned demo-svaret testas där det bor — på routen, i dossier-config-fallback.test.tsx.",
  "plausible-analytics/components/plausible-analytics.tsx":
    "Injicerar bara en `next/script`-tagg. Ingen användarsynlig yta att verifiera, och `mock` är tomt eftersom en analytics-beacon inte har någon demo.",
  "rag-chat/components/chat.tsx":
    "Samma `useChat`-beroende som openai-chat. Demoytan täcks av RagConfigNotice nedan.",
  "supabase-auth/components/supabase-auth-notice.tsx":
    "Importerar `@/lib/supabase/config`, som dossiern själv levererar — `@` pekar på repots `src/` här, så sökvägen finns inte. Env-grinden bakom notisen täcks av supabase-auth-guards.test.ts.",
  "vercel-analytics/components/analytics-providers.tsx":
    "Två beacon-komponenter från Vercel, ingen egen yta och ingen demoväg — samma skäl som plausible-analytics.",
};

interface DossierManifest {
  id: string;
  files?: { path: string; role?: string }[];
}

/**
 * Rollerna som ger en renderbar React-komponent. `shared` hör med: de rena
 * presentationsnotiserna (`integration-config-notice`, `sanity-config-notice`)
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

describe("DbConfigNotice — seed-läge (neon-postgres / mongodb-atlas / postgres-drizzle)", () => {
  it("säger att det är exempeldata, diskret och utan att låta som ett fel", () => {
    const { container } = render(<DbConfigNotice />);

    expect(screen.getByText(/Visar exempeldata/)).toBeTruthy();
    // Seed-läget ska läsa som "inte uppsatt ännu", inte som ett kraschat anrop.
    expect(container.innerHTML).not.toContain("destructive");
    expect(container.textContent).not.toMatch(/fel|error/i);
  });
});

describe("RealtimeConfigNotice — demoläge (ably-realtime, mock: visual)", () => {
  it("renderar setup-notisen när auth-routen svarar 503", async () => {
    mockFetchOnce(503);
    render(<RealtimeConfigNotice />);

    await waitFor(() => {
      expect(screen.getByRole("note")).toBeTruthy();
    });
    expect(screen.getByText("Realtid är inte kopplad ännu")).toBeTruthy();
    // Namnger nyckeln som behövs, aldrig ett värde.
    expect(screen.getByText("ABLY_API_KEY")).toBeTruthy();
    // Lugn ton: aldrig destruktiv styling för "inte uppsatt ännu".
    expect(screen.getByRole("note").className).not.toContain("destructive");
    expect(screen.queryByText(/503/)).toBeNull();
  });

  it("håller sig helt tyst när routen svarar OK (Ably är kopplat)", async () => {
    mockFetchOnce(200, {});
    const { container } = render(<RealtimeConfigNotice />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it("tolkar INTE ett nätverksfel som 'inte konfigurerad'", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<RealtimeConfigNotice />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // Ett tappat nät är inget bevis på saknad nyckel — annars skulle en
    // flygplansläges-blipp påstå att sajtens realtid inte är uppsatt.
    expect(container.firstChild).toBeNull();
  });
});

describe("SubscriptionConfigNotice — setup-yta (paddle-billing)", () => {
  it("namnger alla nycklar som behövs och håller lugn ton", () => {
    render(<SubscriptionConfigNotice />);

    expect(screen.getByText("Prenumerationer är inte aktiverade ännu")).toBeTruthy();
    for (const key of [
      "PADDLE_API_KEY",
      "PADDLE_NOTIFICATION_WEBHOOK_SECRET",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(screen.getByText(key), `saknar nyckelnamnet ${key}`).toBeTruthy();
    }
    expect(screen.getByRole("note").className).not.toContain("destructive");
    const link = screen.getByRole("link");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("RagConfigNotice — setup-yta (rag-chat, mock: canned)", () => {
  it("renderar utan att krascha och utan destruktiv styling", () => {
    const { container } = render(<RagConfigNotice />);

    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(container.innerHTML).not.toContain("destructive");
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
