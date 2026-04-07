/**
 * Builder QA Autoloop V2
 *
 * Simulates 10 fictional users going through the full builder flow:
 *   Phase 1: Generate site from compiled needs-analysis prompt
 *   Phase 2: Fix-loop — run QA checks, send fixes until 100% or max iterations
 *   Phase 3: Follow-up changes — send modification requests directly to engine
 *            (mirrors the "smart routing" in starter mode: build-intent → engine)
 *   Phase 4: Error handling — retry on failures, log everything
 *
 * Usage:
 *   npx tsx scripts/qa/autoloop.ts [options]
 *
 *   --personas N          Number of personas to run (default: 10)
 *   --persona-id N        Run only a specific persona (1-10)
 *   --max-fix-loops N     Max fix iterations per persona (default: 5)
 *   --max-followups N     Max follow-up changes (default: 3)
 *   --timeout-min N       Timeout per stream in minutes (default: 15)
 *   --skip-followups      Skip phase 3
 *   --output-dir PATH     Custom output directory
 *
 * Requires: local dev server running (npm run dev).
 * Output: output/qa-runs/ (gitignored).
 */

import http from "node:http";
import https from "node:https";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.SAJTMASKIN_URL ?? "http://localhost:3000";
const MAX_AWAITING_INPUT_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;
const MAX_STREAM_RETRIES = 3;
const STUCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 min no events = stuck (LLM reasoning can take 7+ min)

// ---------------------------------------------------------------------------
// Persona definitions
// ---------------------------------------------------------------------------

interface NeedsAnalysisAnswers {
  siteType: string;
  offer: string;
  existingSite: string;
  goal: string;
  audience: string;
  mustHave: string;
  style: string;
}

interface Persona {
  id: number;
  name: string;
  description: string;
  answers: NeedsAnalysisAnswers;
  followUpChanges: string[];
}

const FIELD_LABELS: Record<keyof NeedsAnalysisAnswers, string> = {
  siteType: "Sajttyp",
  offer: "Erbjudande eller idé",
  existingSite: "Befintlig hemsida",
  goal: "Huvudmål",
  audience: "Målgrupp",
  mustHave: "Måste finnas med",
  style: "Önskad känsla/stil",
};

const QUESTION_MAP: Record<keyof NeedsAnalysisAnswers, string> = {
  siteType: "Vilken typ av sajt vill du bygga?",
  offer: "Vad erbjuder du, eller vad handlar idén om?",
  existingSite: "Har du en befintlig hemsida vi ska utgå från?",
  goal: "Vad ska sajten främst hjälpa dig att få till?",
  audience: "Vilka besöker din sajt?",
  mustHave: "Vilka delar måste finnas med direkt från start?",
  style: "Vilken känsla vill du att sidan ska ge?",
};

const PERSONAS: Persona[] = [
  {
    id: 1,
    name: "Klipp & Stil",
    description: "Frisörsalong i Göteborg",
    answers: {
      siteType: "Företag / Tjänster",
      offer: "Vi driver en frisörsalong som heter Klipp & Stil i Göteborg. Vi erbjuder klippning, färgning, styling och skäggvård.",
      existingSite: "Börja från noll",
      goal: "Få fler kunder att boka tid",
      audience: "Kvinnor 25-55 år, lokala kunder i Göteborg",
      mustHave: "Bokning online, Bildgalleri, Priser och paket",
      style: "Varmt och personligt",
    },
    followUpChanges: [
      "Ändra färgschemat till rosa och guld istället.",
      "Lägg till en sektion med kundrecensioner på startsidan.",
      "Byt ut telefonnumret till 031-123 45 67 överallt.",
    ],
  },
  {
    id: 2,
    name: "TechPartner AB",
    description: "IT-konsultfirma i Stockholm",
    answers: {
      siteType: "Företag / Tjänster",
      offer: "TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm.",
      existingSite: "Vi har en WordPress-sajt idag men vill byta",
      goal: "Samla leads och bygga förtroende",
      audience: "Företag / B2B, CTO:er och IT-chefer",
      mustHave: "Kontaktformulär, Priser och paket",
      style: "Skandinavisk och stilren",
    },
    followUpChanges: [
      "Lägg till en FAQ-sektion på prissidan.",
      "Ändra hero-rubriken till 'Moderna IT-lösningar för framtidens företag'.",
    ],
  },
  {
    id: 3,
    name: "Sjöstaden Bistro",
    description: "Restaurang i Malmö",
    answers: {
      siteType: "Restaurang",
      offer: "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Vi har lunch, à la carte och catering.",
      existingSite: "Börja från noll",
      goal: "Få fler kunder att boka bord och beställa catering",
      audience: "Alla målgrupper, matälskare i Malmö",
      mustHave: "Bokning online, Kontaktformulär",
      style: "Mörkt och lyxigt",
    },
    followUpChanges: [
      "Lägg till en sektion med veckans lunch på startsidan.",
      "Ändra öppettiderna till Mån-Fre 11-22, Lör-Sön 12-23.",
      "Byt bakgrundsfärgen på menysidan till mörkare.",
    ],
  },
  {
    id: 4,
    name: "Silverträdet",
    description: "Webshop för handgjorda smycken",
    answers: {
      siteType: "Webshop",
      offer: "Silverträdet säljer handgjorda silversmycken online. Ringar, halsband, armband och örhängen.",
      existingSite: "Vi har bara sociala medier",
      goal: "Sälja produkter direkt",
      audience: "Kvinnor 25-45 år som gillar unika smycken",
      mustHave: "Bildgalleri, Priser och paket",
      style: "Ljust och minimalistiskt",
    },
    followUpChanges: [
      "Lägg till en 'Nytt in'-sektion på startsidan med de senaste produkterna.",
      "Ändra typsnittsfärgen på produktkorten till mörkgrå.",
    ],
  },
  {
    id: 5,
    name: "Anna Lindqvist Foto",
    description: "Fotografportfolio i Uppsala",
    answers: {
      siteType: "Portfolio",
      offer: "Jag är fotograf och filmare i Uppsala. Specialiserad på bröllopsfoto, företagsfoto och porträtt.",
      existingSite: "Börja från noll",
      goal: "Bygga förtroende och visa upp mitt arbete",
      audience: "Par som ska gifta sig, företag som behöver bilder, privatpersoner",
      mustHave: "Bildgalleri, Kontaktformulär",
      style: "Rent och modernt",
    },
    followUpChanges: [
      "Dela upp galleriet i tre kategorier: Bröllop, Företag och Porträtt.",
      "Lägg till en prislista med tre paket.",
      "Ändra hero-bilden till en mörk bakgrund med vit text.",
    ],
  },
  {
    id: 6,
    name: "FitTrack",
    description: "Landningssida för ny träningsapp",
    answers: {
      siteType: "Landningssida",
      offer: "FitTrack är en ny app för träningsplanering och kostuppföljning. Vi lanserar snart.",
      existingSite: "Börja från noll",
      goal: "Samla leads inför lansering",
      audience: "Unga vuxna 18-35 år som tränar regelbundet",
      mustHave: "Kontaktformulär",
      style: "Lekfullt med mycket färg",
    },
    followUpChanges: [
      "Lägg till en nedräkningstimer till lanseringsdatumet.",
      "Ändra CTA-knappen till 'Anmäl dig till betatestet'.",
    ],
  },
  {
    id: 7,
    name: "Advokatfirman Bergström & Co",
    description: "Advokatbyrå i Linköping",
    answers: {
      siteType: "Företag / Tjänster",
      offer: "Advokatfirman Bergström & Co i Linköping specialiserar sig på affärsjuridik, arbetsrätt och fastighetsrätt.",
      existingSite: "Ja, vi har en enkel sida",
      goal: "Bygga förtroende",
      audience: "Företag / B2B, VD:ar och HR-chefer",
      mustHave: "Kontaktformulär",
      style: "Skandinavisk och stilren",
    },
    followUpChanges: [
      "Lägg till bilder och korta bios för alla tre partners.",
      "Ändra färgschemat till mörkblått och guld.",
      "Lägg till en sida med 'Våra klienter' och logotyper.",
    ],
  },
  {
    id: 8,
    name: "Bryggkajen",
    description: "Café med catering i Helsingborg",
    answers: {
      siteType: "Restaurang",
      offer: "Bryggkajen är ett café i Helsingborg med hembakat fika, lunch och cateringtjänster för events.",
      existingSite: "Vi har bara sociala medier",
      goal: "Få fler kunder att boka tid för catering",
      audience: "Lokala kunder, kontor som vill beställa lunch",
      mustHave: "Priser och paket, Kontaktformulär, Bokning online",
      style: "Varmt och personligt",
    },
    followUpChanges: [
      "Lägg till en sektion med cateringmenyn och priser.",
      "Byt hero-bilden till en bild på färska kanelbullar.",
    ],
  },
  {
    id: 9,
    name: "Hälsokällan",
    description: "Blogg om hälsa och träning",
    answers: {
      siteType: "Blogg",
      offer: "Hälsokällan är en blogg om hälsa, träning och välmående. Jag skriver om kost, yoga och mental hälsa.",
      existingSite: "Börja från noll",
      goal: "Bygga förtroende och samla en publik",
      audience: "Alla målgrupper, hälsomedvetna personer 25-50 år",
      mustHave: "Kontaktformulär",
      style: "Rent och modernt",
    },
    followUpChanges: [
      "Lägg till ett nyhetsbrev-formulär i sidofältet.",
      "Ändra kategorisidan så den visar artiklar i ett rutnät istället för lista.",
      "Lägg till sociala delningsknappar på varje blogginlägg.",
    ],
  },
  {
    id: 10,
    name: "Svensson Bygg AB",
    description: "Byggfirma i Norrköping",
    answers: {
      siteType: "Företag / Tjänster",
      offer: "Svensson Bygg AB i Norrköping utför nybyggnation, renovering, tillbyggnader och badrumsrenoveringar.",
      existingSite: "Börja från noll",
      goal: "Få fler kunder att boka tid för offert",
      audience: "Lokala kunder, villaägare i Norrköping",
      mustHave: "Bildgalleri, Kontaktformulär, Kundrecensioner",
      style: "Mörkt och lyxigt",
    },
    followUpChanges: [
      "Lägg till en referenssida med före- och efterbilder.",
      "Ändra kontaktnumret till 011-234 56 78.",
      "Lägg till ROT-avdrag information på prissidan.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SseEvent {
  event: string;
  data: unknown;
}

interface StreamResult {
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  done: Record<string, unknown>;
  awaitingInput: boolean;
  awaitingQuestion: string | null;
  awaitingOptions: string[];
  errors: string[];
  progressSteps: string[];
  durationMs: number;
  contentChunks: number;
}

interface QaCheck {
  name: string;
  passed: boolean;
  message: string;
}

interface GeneratedFile {
  name: string;
  content: string;
}

interface PhaseResult {
  phase: string;
  success: boolean;
  iterations: IterationResult[];
  errors: string[];
  durationMs: number;
}

interface IterationResult {
  index: number;
  stream: StreamResult;
  files: GeneratedFile[];
  checks: QaCheck[];
  score: number;
  messageSent: string;
}

interface PersonaReport {
  persona: Persona;
  projectId: string;
  chatId: string | null;
  phases: PhaseResult[];
  finalScore: number;
  totalDurationMs: number;
  fatalError: string | null;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let cookies: string[] = [];

function resetCookies(): void {
  cookies = [];
}

function mergeCookies(headers: http.IncomingHttpHeaders): void {
  const raw = headers["set-cookie"];
  if (!raw) return;
  for (const c of raw) {
    const name = c.split("=")[0];
    cookies = cookies.filter((existing) => !existing.startsWith(`${name}=`));
    cookies.push(c.split(";")[0]);
  }
}

function cookieHeader(): string {
  return cookies.join("; ");
}

function jsonRequest(
  method: string,
  urlPath: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, BASE_URL);
    const isHttps = fullUrl.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;

    const req = lib.request(
      fullUrl,
      {
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
          Cookie: cookieHeader(),
        },
      },
      (res) => {
        mergeCookies(res.headers);
        let buf = "";
        res.on("data", (chunk: Buffer) => (buf += chunk.toString()));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 500, data: buf ? JSON.parse(buf) : {} });
          } catch {
            resolve({ status: res.statusCode ?? 500, data: { raw: buf } });
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sseStream(
  urlPath: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<SseEvent[]> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, BASE_URL);
    const isHttps = fullUrl.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = JSON.stringify(body);

    let lastEventTime = Date.now();
    const events: SseEvent[] = [];
    let settled = false;

    const stuckCheck = setInterval(() => {
      if (Date.now() - lastEventTime > STUCK_TIMEOUT_MS) {
        clearInterval(stuckCheck);
        clearTimeout(absoluteTimeout);
        if (!settled) {
          settled = true;
          req.destroy();
          reject(new Error(`Stream stuck — no events for ${STUCK_TIMEOUT_MS / 1000}s`));
        }
      }
    }, 30_000);

    const absoluteTimeout = setTimeout(() => {
      clearInterval(stuckCheck);
      if (!settled) {
        settled = true;
        req.destroy();
        reject(new Error(`Stream timeout after ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);

    const req = lib.request(
      fullUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Cookie: cookieHeader(),
        },
      },
      (res) => {
        mergeCookies(res.headers);

        if (res.statusCode && res.statusCode >= 400) {
          console.warn(`      [sse] HTTP error: ${res.statusCode}`);
          let errBuf = "";
          res.on("data", (chunk: Buffer) => (errBuf += chunk.toString()));
          res.on("end", () => {
            clearInterval(stuckCheck);
            clearTimeout(absoluteTimeout);
            if (!settled) {
              settled = true;
              reject(new Error(`HTTP ${res.statusCode}: ${errBuf.slice(0, 500)}`));
            }
          });
          return;
        }

        let buf = "";
        let chunkCount = 0;
        let eventCount = 0;
        const streamStart = Date.now();
        console.log(`      [sse] HTTP ${res.statusCode}, streaming...`);
        const progressLog = setInterval(() => {
          const elapsed = ((Date.now() - streamStart) / 1000).toFixed(0);
          console.log(`      [sse] ${elapsed}s elapsed, ${chunkCount} chunks, ${eventCount} events`);
        }, 60_000);
        res.on("data", (chunk: Buffer) => {
          lastEventTime = Date.now();
          chunkCount++;
          buf += chunk.toString();
          const parts = buf.split("\n\n");
          buf = parts.pop()!;
          for (const block of parts) {
            if (!block.trim()) continue;
            let ev = "message";
            let dataStr: string | null = null;
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
            }
            if (dataStr === null) continue;
            eventCount++;
            if (ev !== "content" && ev !== "message") {
              console.log(`      [sse] event: ${ev}`);
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              parsed = dataStr;
            }
            events.push({ event: ev, data: parsed });
          }
        });
        res.on("close", () => clearInterval(progressLog));
        res.on("end", () => {
          clearInterval(stuckCheck);
          clearTimeout(absoluteTimeout);
          clearInterval(progressLog);
          console.log(`      [sse] Stream ended: ${eventCount} events, ${chunkCount} chunks, ${((Date.now() - streamStart) / 1000).toFixed(0)}s`);
          if (buf.trim()) {
            for (const block of (buf + "\n\n").split("\n\n")) {
              if (!block.trim()) continue;
              let ev = "message";
              let dataStr: string | null = null;
              for (const line of block.split("\n")) {
                if (line.startsWith("event:")) ev = line.slice(6).trim();
                else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
              }
              if (dataStr === null) continue;
              let parsed: unknown;
              try {
                parsed = JSON.parse(dataStr);
              } catch {
                parsed = dataStr;
              }
              events.push({ event: ev, data: parsed });
            }
          }
          if (!settled) {
            settled = true;
            resolve(events);
          }
        });
      },
    );
    req.on("error", (err) => {
      clearInterval(stuckCheck);
      clearTimeout(absoluteTimeout);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Prompt compilation (offline — mirrors buildNeedsAnalysisPrompt)
// ---------------------------------------------------------------------------

function compilePrompt(persona: Persona): string {
  const a = persona.answers;
  const summary = (Object.keys(FIELD_LABELS) as (keyof NeedsAnalysisAnswers)[]).map(
    (field) => `- ${FIELD_LABELS[field]}: ${a[field]}`,
  );

  const isRestaurant = a.siteType.toLowerCase().includes("restaurang");
  const isEcommerce = a.siteType.toLowerCase().includes("webshop");
  const isPortfolio = a.siteType.toLowerCase().includes("portfolio");
  const hasPrices = a.mustHave.toLowerCase().includes("pris");
  const hasGallery = a.mustHave.toLowerCase().includes("galleri") || isPortfolio;
  const hasBooking = a.mustHave.toLowerCase().includes("bokning");

  const pages: string[] = [];

  pages.push(
    "### Startsida (`app/page.tsx`)",
    "1. Hero med rubrik, underrubrik och primär CTA",
    isRestaurant
      ? "2. Meny-höjdpunkter eller populära rätter (3-4 kort)"
      : isEcommerce
        ? "2. Utvalda produkter (3-4 kort)"
        : "2. Tjänster/erbjudanden (3-4 kort med ikon och kort beskrivning)",
    "3. Kort om oss (2-3 meningar + bild eller ikon)",
    "4. Socialt bevis (2-3 kundcitat med namn och roll/företag)",
    "5. CTA-banner (tydlig uppmaning med kontrasterande bakgrund)",
    "6. Kontaktsektion (adress, telefon, e-post, eventuellt karta)",
  );

  pages.push("", "### Om oss (`app/om-oss/page.tsx`)", "1. Rubrik och inledning", "2. Vår historia / bakgrund", "3. Teamet (om relevant) — namn, roll, kort bio", "4. Värderingar eller arbetssätt");

  if (isRestaurant) {
    pages.push("", "### Meny (`app/meny/page.tsx`)", "1. Menykategorier (förrätter, varmrätter, desserter, drycker)", "2. Varje rätt: namn, kort beskrivning, pris", "3. Allergeninformation");
  }

  if (hasPrices) {
    pages.push("", "### Priser (`app/priser/page.tsx`)", "1. Prispaket (2-3 nivåer i kolumner)", "2. Vad som ingår per paket (checkmarks)", "3. CTA under varje paket", "4. FAQ om priser");
  }

  if (hasGallery) {
    pages.push("", "### Galleri / Portfolio (`app/galleri/page.tsx`)", "1. Bildrutnät (responsivt grid, 2-3 kolumner)", "2. Filterkategorier om relevant", "3. Lightbox vid klick");
  }

  if (hasBooking) {
    pages.push("", "### Boka tid (`app/boka/page.tsx`)", "1. Rubrik och kort beskrivning", "2. Bokningsformulär (namn, e-post, telefon, datum, tid, meddelande)", "3. Bekräftelsemeddelande efter submit");
  }

  pages.push(
    "",
    "### Kontakt (`app/kontakt/page.tsx`)",
    "1. Kontaktformulär (namn, e-post, telefon, meddelande)",
    "2. Direktkontaktinfo (telefon, e-post, adress)",
    isRestaurant ? "3. Öppettider" : "3. Besöksadress / karta",
    "4. Sociala medier-länkar",
  );

  return [
    "## Starter intake",
    "Använd underlaget nedan när du bygger den första versionen.",
    "",
    "## Sammanfattad behovsanalys",
    ...summary,
    "",
    "## Användarens egna formuleringar",
    `1. ${a.offer}`,
    "",
    "## Sidstruktur",
    "Bygg följande sidor med dessa sektioner:",
    "",
    ...pages,
    "",
    "## Instruktion",
    "- Bygg direkt utifrån underlaget ovan. Följ sidstrukturen exakt.",
    "- Ta trygga designbeslut när detaljer saknas.",
    "- Prioritera tydlig struktur, ett starkt första intryck och en relevant CTA.",
    "- VIKTIGT: Varje sida ska ha MINST 3-4 sektioner med verkligt innehåll.",
    "- Undersidor ska vara innehållsrika — inte bara en rubrik.",
    "",
    "## Heading-hierarki och bildhantering",
    "- Exakt EN `<h1>` per sida. Aldrig fler.",
    "- Headings i strikt hierarki: h1 → h2 → h3. Hoppa aldrig över nivåer.",
    "- Alla bilder via `next/image` med `alt`-text på svenska.",
    "- Hero-bilder: `priority` och `fill` eller explicit bredd/höjd.",
    "- Footer: kontaktinfo, öppettider (om relevant), sociala medier-ikoner, copyright-text.",
    "",
    "## SEO-metadata",
    `- title: "${persona.name} — ${a.offer.split(".")[0]}" (anpassa per sida)`,
    "- description: 150-160 tecken, på svenska.",
    "- keywords: relevanta svenska sökord som `string[]` — ALDRIG `as const`.",
    "- Open Graph: title och description på svenska.",
    "",
    "## Språk och ton (svenska)",
    "All text ska vara på svenska (å, ä, ö). Inga emojis. Inga engelska placeholder.",
    "Skriv riktiga stycken (2-3 meningar). Autentiska svenska namn och adresser.",
    "Navigation: Hem, Om oss, Tjänster, Kontakt, Priser. Knappar: Kom igång, Läs mer, Kontakta oss, Boka tid.",
    "Telefonnummer: 070-123 45 67. Adress: Storgatan 12, 411 38 Göteborg.",
    'Footer-copyright: "© 2025 Företagsnamn" (INTE "All rights reserved").',
    "Metadata-arrayer: ALDRIG `as const` — TypeScript kräver mutable `string[]`.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Core flow helpers
// ---------------------------------------------------------------------------

async function ensureProject(label: string): Promise<string> {
  const name = `qa-autoloop: ${label} ${new Date().toISOString().slice(0, 19)}`;
  const { status, data } = await jsonRequest("POST", "/api/projects", { name });
  if (status >= 400) throw new Error(`Create project failed (${status}): ${JSON.stringify(data)}`);
  const project = (data as Record<string, unknown>).project as Record<string, unknown> | undefined;
  if (!project?.id) throw new Error(`Unexpected project response: ${JSON.stringify(data)}`);
  return String(project.id);
}

function parseStreamResult(events: SseEvent[], startMs: number): StreamResult {
  const result: StreamResult = {
    chatId: null,
    versionId: null,
    previewUrl: null,
    done: {},
    awaitingInput: false,
    awaitingQuestion: null,
    awaitingOptions: [],
    errors: [],
    progressSteps: [],
    durationMs: Date.now() - startMs,
    contentChunks: 0,
  };

  for (const { event, data } of events) {
    if (event === "content") {
      result.contentChunks++;
      continue;
    }
    if (typeof data !== "object" || data === null) continue;
    const d = data as Record<string, unknown>;

    switch (event) {
      case "chatId":
        if (typeof d.id === "string") result.chatId = d.id;
        break;
      case "done":
        result.done = d;
        if (typeof d.versionId === "string") result.versionId = d.versionId;
        if (d.awaitingInput) {
          result.awaitingInput = true;
          if (typeof d.question === "string") result.awaitingQuestion = d.question;
          if (Array.isArray(d.options)) result.awaitingOptions = d.options.map(String);
        }
        break;
      case "sandbox-ready":
        if (typeof d.sandboxUrl === "string") result.previewUrl = d.sandboxUrl;
        break;
      case "progress": {
        const step = d.step ?? d.phase ?? "";
        if (step) result.progressSteps.push(String(step));
        break;
      }
      case "error":
        result.errors.push(JSON.stringify(d));
        break;
    }
  }

  return result;
}

async function fetchFiles(chatId: string, versionId: string): Promise<GeneratedFile[]> {
  const q = `/api/engine/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`;
  const { status, data } = await jsonRequest("GET", q);
  if (status >= 400) {
    console.warn(`    [warn] Fetch files failed (${status})`);
    return [];
  }
  const files = (data as Record<string, unknown>).files;
  if (!Array.isArray(files)) return [];
  return files
    .filter(
      (f): f is { name: string; content: string } =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Record<string, unknown>).name === "string" &&
        typeof (f as Record<string, unknown>).content === "string",
    )
    .map((f) => ({ name: f.name, content: f.content }));
}

async function streamWithRetry(
  urlPath: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  label: string,
): Promise<{ events: SseEvent[]; retries: number }> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_STREAM_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`    [retry ${attempt}/${MAX_STREAM_RETRIES}] ${label}...`);
        await sleep(RETRY_DELAY_MS);
      }
      const events = await sseStream(urlPath, body, timeoutMs);
      return { events, retries: attempt - 1 };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`    [error] ${label}: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("Stream failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Quality checks (18 checks)
// ---------------------------------------------------------------------------

function runChecks(files: GeneratedFile[]): QaCheck[] {
  const checks: QaCheck[] = [];
  const paths = files.map((f) => f.name);
  const allContent = files.map((f) => f.content).join("\n");

  // 1. File count
  checks.push({
    name: "file-count",
    passed: files.length >= 4,
    message: `${files.length} files generated`,
  });

  // 2. Required files
  const required = ["app/page.tsx", "app/layout.tsx"];
  const missing = required.filter((r) => !paths.some((p) => p.endsWith(r)));
  checks.push({
    name: "required-files",
    passed: missing.length === 0,
    message: missing.length === 0 ? "All required files present" : `Missing: ${missing.join(", ")}`,
  });

  // 3. Swedish content
  const hasSwedish = /[åäöÅÄÖ]/.test(allContent);
  checks.push({
    name: "swedish-characters",
    passed: hasSwedish,
    message: hasSwedish ? "Swedish characters found" : "No å, ä, ö detected",
  });

  // 4. No emojis
  const emojiPattern =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const hasEmojis = emojiPattern.test(allContent);
  checks.push({
    name: "no-emojis",
    passed: !hasEmojis,
    message: hasEmojis ? "Emojis found in generated code" : "No emojis",
  });

  // 5. No `as const` on metadata
  const asConstMeta =
    /keywords.*as\s+const|authors.*as\s+const|metadata\s*=.*as\s+const/i.test(allContent);
  checks.push({
    name: "no-as-const-metadata",
    passed: !asConstMeta,
    message: asConstMeta ? "`as const` on metadata arrays detected" : "No `as const` on metadata",
  });

  // 6. Swedish navigation
  const swedishNav = ["Hem", "Om oss", "Kontakt", "Tjänster"].filter((label) =>
    allContent.includes(label),
  );
  checks.push({
    name: "swedish-navigation",
    passed: swedishNav.length >= 2,
    message: `Found ${swedishNav.length}/4 Swedish nav labels: ${swedishNav.join(", ") || "none"}`,
  });

  // 7. No English navigation
  const englishNav = ["Home", "About", "Services", "Contact"].filter((label) =>
    new RegExp(`[>"']${label}[<"']`, "i").test(allContent),
  );
  checks.push({
    name: "no-english-navigation",
    passed: englishNav.length === 0,
    message:
      englishNav.length === 0
        ? "No English navigation labels"
        : `English labels: ${englishNav.join(", ")}`,
  });

  // 8. Heading hierarchy
  let headingOk = true;
  for (const file of files) {
    if (!file.name.endsWith("page.tsx")) continue;
    const h1Count = (file.content.match(/<h1[\s>]/g) || []).length;
    if (h1Count > 1) {
      checks.push({
        name: "heading-hierarchy",
        passed: false,
        message: `${file.name} has ${h1Count} h1 tags (should be 1)`,
      });
      headingOk = false;
    }
  }
  if (headingOk) {
    checks.push({ name: "heading-hierarchy", passed: true, message: "Heading hierarchy OK" });
  }

  // 9. Multiple pages
  const pageFiles = paths.filter((p) => p.endsWith("page.tsx"));
  checks.push({
    name: "multiple-pages",
    passed: pageFiles.length >= 2,
    message: `${pageFiles.length} page files`,
  });

  // 10. Footer present
  const hasFooter = allContent.toLowerCase().includes("footer");
  checks.push({
    name: "footer-present",
    passed: hasFooter,
    message: hasFooter ? "Footer component/section found" : "No footer detected",
  });

  // 11. Content density
  const thinPages = files.filter(
    (f) => f.name.endsWith("page.tsx") && f.content.split("\n").length < 20,
  );
  checks.push({
    name: "content-density",
    passed: thinPages.length === 0,
    message:
      thinPages.length === 0
        ? "All pages have sufficient content"
        : `Thin pages: ${thinPages.map((f) => f.name).join(", ")}`,
  });

  // 12. No merge markers
  const hasMergeMarkers = files.some(
    (f) => f.name.endsWith(".tsx") && (f.content.includes("<<<<<<") || f.content.includes(">>>>>>")),
  );
  checks.push({
    name: "no-merge-markers",
    passed: !hasMergeMarkers,
    message: hasMergeMarkers ? "Merge conflict markers detected" : "No merge markers",
  });

  // 13. No Lorem ipsum
  const hasLorem = /lorem ipsum/i.test(allContent);
  checks.push({
    name: "no-lorem-ipsum",
    passed: !hasLorem,
    message: hasLorem ? "Lorem ipsum placeholder text found" : "No Lorem ipsum",
  });

  // 14. Contact form elements
  const kontaktPage = files.find(
    (f) => f.name.includes("kontakt") && f.name.endsWith("page.tsx"),
  );
  const hasFormElements =
    kontaktPage && /<(form|input|textarea)\b/i.test(kontaktPage.content);
  checks.push({
    name: "contact-form",
    passed: !!hasFormElements || !kontaktPage,
    message: hasFormElements
      ? "Contact form elements found"
      : kontaktPage
        ? "Contact page missing form elements"
        : "No contact page (OK if merged elsewhere)",
  });

  // 15. Meta description
  const pagesWithMeta = files.filter(
    (f) => f.name.endsWith("page.tsx") && /description\s*[:=]/i.test(f.content),
  );
  checks.push({
    name: "meta-description",
    passed: pagesWithMeta.length >= 1,
    message: `${pagesWithMeta.length} pages with meta description`,
  });

  // 16. Responsive classes
  const hasResponsive = /\b(md:|lg:|sm:)\w/.test(allContent);
  checks.push({
    name: "responsive-classes",
    passed: hasResponsive,
    message: hasResponsive ? "Responsive Tailwind classes found" : "No responsive classes detected",
  });

  // 17. Import validity
  const brokenImports = files.filter(
    (f) =>
      f.name.endsWith(".tsx") &&
      /from\s+["'][.]{2,}\/[.]{2,}\/[.]{2,}\/[.]{2,}/.test(f.content),
  );
  checks.push({
    name: "import-validity",
    passed: brokenImports.length === 0,
    message:
      brokenImports.length === 0
        ? "Import paths OK"
        : `Deep relative imports: ${brokenImports.map((f) => f.name).join(", ")}`,
  });

  // 18. Swedish phone format
  const phonePattern = /\b0\d{2,3}-\d{2,3}\s?\d{2}\s?\d{2}\b/;
  const hasSwedishPhone = phonePattern.test(allContent);
  checks.push({
    name: "swedish-phone-format",
    passed: hasSwedishPhone,
    message: hasSwedishPhone ? "Swedish phone format found" : "No Swedish phone format detected",
  });

  // 19. CTA presence (buttons/links with action text)
  const ctaPatterns = /\b(Boka|Kontakta|Läs mer|Kom igång|Beställ|Ring oss|Få offert)\b/;
  const hasCta = ctaPatterns.test(allContent);
  checks.push({
    name: "cta-presence",
    passed: hasCta,
    message: hasCta ? "CTA text found" : "No Swedish CTA text detected",
  });

  // 20. No English body text
  const englishPhrases = /\b(Welcome to|Learn more|Get started|Read more|Our services|About us)\b/;
  const hasEnglishBody = englishPhrases.test(allContent);
  checks.push({
    name: "no-english-body-text",
    passed: !hasEnglishBody,
    message: hasEnglishBody ? "English body text found" : "No English body text",
  });

  // 21. Proper paragraph structure (at least some <p> tags)
  const pTagCount = (allContent.match(/<p[\s>]/g) || []).length;
  checks.push({
    name: "paragraph-structure",
    passed: pTagCount >= 3,
    message: `${pTagCount} paragraph tags found`,
  });

  return checks;
}

function buildFollowUpMessage(checks: QaCheck[]): string | null {
  const failed = checks.filter((c) => !c.passed);
  if (failed.length === 0) return null;

  const lines = ["Förbättra sajten baserat på dessa problem:\n"];

  for (const check of failed) {
    switch (check.name) {
      case "swedish-characters":
        lines.push("- All text ska vara på svenska med korrekt å, ä, ö.");
        break;
      case "no-emojis":
        lines.push("- Ta bort alla emojis. Inga emojis i rubriker, text eller knappar.");
        break;
      case "no-as-const-metadata":
        lines.push(
          "- Ta bort `as const` från metadata-arrayer (keywords, authors). Använd vanlig `string[]`.",
        );
        break;
      case "swedish-navigation":
        lines.push("- Byt ut navigationen till svenska: Hem, Om oss, Tjänster, Kontakt, Priser.");
        break;
      case "no-english-navigation":
        lines.push("- Byt ut engelska labels (Home, About, etc.) till svenska.");
        break;
      case "heading-hierarchy":
        lines.push(`- Fixa rubrikhierarkin: ${check.message}.`);
        break;
      case "content-density":
        lines.push(`- ${check.message}. Lägg till mer innehåll — minst 3-4 sektioner per sida.`);
        break;
      case "footer-present":
        lines.push("- Lägg till en komplett footer med kontaktinfo och copyright.");
        break;
      case "multiple-pages":
        lines.push("- Skapa fler undersidor: Om oss, Tjänster/Meny, Kontakt.");
        break;
      case "no-lorem-ipsum":
        lines.push("- Ersätt alla Lorem ipsum med riktig svensk text.");
        break;
      case "contact-form":
        lines.push(
          "- Kontaktsidan saknar formulärelement. Lägg till ett formulär med namn, e-post och meddelande.",
        );
        break;
      case "meta-description":
        lines.push(
          "- Lägg till metadata med description på varje sida. 150-160 tecken, på svenska.",
        );
        break;
      case "responsive-classes":
        lines.push(
          "- Lägg till responsiva Tailwind-klasser (md:, lg:) för att sajten ska fungera på alla skärmar.",
        );
        break;
      case "swedish-phone-format":
        lines.push("- Lägg till ett svenskt telefonnummer i formatet 070-123 45 67.");
        break;
      default:
        lines.push(`- ${check.name}: ${check.message}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-persona execution
// ---------------------------------------------------------------------------

async function runPersona(
  persona: Persona,
  config: RunConfig,
): Promise<PersonaReport> {
  const startMs = Date.now();
  resetCookies();
  const phases: PhaseResult[] = [];
  let chatId: string | null = null;
  let projectId = "";
  let fatalError: string | null = null;
  let latestScore = 0;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`PERSONA ${persona.id}: ${persona.name} — ${persona.description}`);
  console.log(`${"=".repeat(70)}`);

  try {
    projectId = await ensureProject(persona.name);
    console.log(`  Project: ${projectId}`);

    // ---- PHASE 1: Generate ----
    console.log(`\n  --- Phase 1: Generate ---`);
    const phase1Start = Date.now();
    const prompt = compilePrompt(persona);
    const phase1Iterations: IterationResult[] = [];
    const phase1Errors: string[] = [];

    const body = {
      message: prompt,
      projectId,
      modelId: "max",
      thinking: true,
      imageGenerations: true,
      meta: {
        modelTier: "max",
        buildIntent: "website",
        scaffoldMode: "auto",
        appProjectId: projectId,
      },
    };

    console.log(`    Streaming generation (prompt: ${prompt.length} chars)...`);
    const { events, retries } = await streamWithRetry(
      "/api/engine/chats/stream",
      body,
      config.timeoutMs,
      "initial generation",
    );
    if (retries > 0) phase1Errors.push(`Required ${retries} retries for initial stream`);

    let stream = parseStreamResult(events, phase1Start);
    chatId = stream.chatId;
    console.log(`    Chat: ${chatId}, Version: ${stream.versionId ?? "none"}, Duration: ${stream.durationMs}ms`);

    let awaitingRetries = 0;
    while (stream.awaitingInput && awaitingRetries < MAX_AWAITING_INPUT_RETRIES && chatId) {
      awaitingRetries++;
      const answer = stream.awaitingOptions[0] ?? "Fortsätt med det du har";
      console.log(`    Awaiting input: "${stream.awaitingQuestion}" → "${answer}"`);
      const followUpEvents = await streamWithRetry(
        `/api/engine/chats/${encodeURIComponent(chatId)}/stream`,
        { message: answer, projectId },
        config.timeoutMs,
        `awaiting-input answer #${awaitingRetries}`,
      );
      stream = parseStreamResult(followUpEvents.events, Date.now());
      if (stream.chatId) chatId = stream.chatId;
    }

    let files: GeneratedFile[] = [];
    if (chatId && stream.versionId) {
      files = await fetchFiles(chatId, stream.versionId);
      console.log(`    Files: ${files.length}`);
    }

    const checks = runChecks(files);
    latestScore = checks.length > 0 ? checks.filter((c) => c.passed).length / checks.length : 0;
    logChecks(checks, latestScore);

    phase1Iterations.push({
      index: 0,
      stream,
      files,
      checks,
      score: latestScore,
      messageSent: "[initial generation]",
    });

    phases.push({
      phase: "generate",
      success: files.length > 0,
      iterations: phase1Iterations,
      errors: phase1Errors,
      durationMs: Date.now() - phase1Start,
    });

    // ---- PHASE 2: Fix-loop ----
    if (latestScore < 1.0 && chatId) {
      console.log(`\n  --- Phase 2: Fix-loop (max ${config.maxFixLoops} iterations) ---`);
      const phase2Start = Date.now();
      const phase2Iterations: IterationResult[] = [];
      const phase2Errors: string[] = [];

      for (let fix = 1; fix <= config.maxFixLoops; fix++) {
        const fixMsg = buildFollowUpMessage(
          phase1Iterations.length > 0
            ? (phase2Iterations.length > 0
                ? phase2Iterations[phase2Iterations.length - 1].checks
                : phase1Iterations[phase1Iterations.length - 1].checks)
            : [],
        );
        if (!fixMsg) {
          console.log(`    No fixes needed — score is 100%`);
          break;
        }

        console.log(`    Fix iteration ${fix}/${config.maxFixLoops}...`);
        try {
          const fixEvents = await streamWithRetry(
            `/api/engine/chats/${encodeURIComponent(chatId)}/stream`,
            { message: fixMsg, projectId },
            config.timeoutMs,
            `fix iteration ${fix}`,
          );
          const fixStream = parseStreamResult(fixEvents.events, Date.now());
          if (fixStream.versionId) {
            const fixFiles = await fetchFiles(chatId, fixStream.versionId);
            const fixChecks = runChecks(fixFiles);
            latestScore =
              fixChecks.length > 0
                ? fixChecks.filter((c) => c.passed).length / fixChecks.length
                : 0;
            logChecks(fixChecks, latestScore);

            phase2Iterations.push({
              index: fix,
              stream: fixStream,
              files: fixFiles,
              checks: fixChecks,
              score: latestScore,
              messageSent: fixMsg,
            });

            if (latestScore >= 1.0) {
              console.log(`    All checks passed after ${fix} fix(es)!`);
              break;
            }
          } else {
            phase2Errors.push(`Fix ${fix}: no versionId in response`);
            console.warn(`    [warn] Fix ${fix}: no versionId`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          phase2Errors.push(`Fix ${fix}: ${msg}`);
          console.error(`    [error] Fix ${fix}: ${msg}`);
        }
      }

      phases.push({
        phase: "fix-loop",
        success: latestScore >= 1.0,
        iterations: phase2Iterations,
        errors: phase2Errors,
        durationMs: Date.now() - phase2Start,
      });
    }

    // ---- PHASE 3: Follow-up changes ----
    if (!config.skipFollowups && chatId) {
      const changesToSend = persona.followUpChanges.slice(0, config.maxFollowups);
      console.log(`\n  --- Phase 3: Follow-up changes (${changesToSend.length}) ---`);
      const phase3Start = Date.now();
      const phase3Iterations: IterationResult[] = [];
      const phase3Errors: string[] = [];

      for (let ci = 0; ci < changesToSend.length; ci++) {
        const changeMsg = changesToSend[ci];
        console.log(`    Change ${ci + 1}/${changesToSend.length}: "${changeMsg}"`);
        try {
          const changeEvents = await streamWithRetry(
            `/api/engine/chats/${encodeURIComponent(chatId)}/stream`,
            { message: changeMsg, projectId },
            config.timeoutMs,
            `follow-up change ${ci + 1}`,
          );
          const changeStream = parseStreamResult(changeEvents.events, Date.now());

          let changeAwaitRetries = 0;
          let currentStream = changeStream;
          while (
            currentStream.awaitingInput &&
            changeAwaitRetries < MAX_AWAITING_INPUT_RETRIES &&
            chatId
          ) {
            changeAwaitRetries++;
            const ans = currentStream.awaitingOptions[0] ?? "Ja, gör det";
            console.log(`      Awaiting: "${currentStream.awaitingQuestion}" → "${ans}"`);
            const ansEvents = await streamWithRetry(
              `/api/engine/chats/${encodeURIComponent(chatId)}/stream`,
              { message: ans, projectId },
              config.timeoutMs,
              `follow-up awaiting ${changeAwaitRetries}`,
            );
            currentStream = parseStreamResult(ansEvents.events, Date.now());
          }

          if (currentStream.versionId) {
            const changeFiles = await fetchFiles(chatId, currentStream.versionId);
            const changeChecks = runChecks(changeFiles);
            latestScore =
              changeChecks.length > 0
                ? changeChecks.filter((c) => c.passed).length / changeChecks.length
                : 0;
            console.log(`      Score: ${(latestScore * 100).toFixed(0)}%, Files: ${changeFiles.length}`);

            phase3Iterations.push({
              index: ci,
              stream: currentStream,
              files: changeFiles,
              checks: changeChecks,
              score: latestScore,
              messageSent: changeMsg,
            });
          } else {
            phase3Errors.push(`Change ${ci + 1}: no versionId`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          phase3Errors.push(`Change ${ci + 1}: ${msg}`);
          console.error(`    [error] Change ${ci + 1}: ${msg}`);
        }
      }

      phases.push({
        phase: "follow-ups",
        success: phase3Errors.length === 0,
        iterations: phase3Iterations,
        errors: phase3Errors,
        durationMs: Date.now() - phase3Start,
      });
    }
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
    console.error(`\n  [FATAL] Persona ${persona.id}: ${fatalError}`);
  }

  return {
    persona,
    projectId,
    chatId,
    phases,
    finalScore: latestScore,
    totalDurationMs: Date.now() - startMs,
    fatalError,
  };
}

function logChecks(checks: QaCheck[], score: number): void {
  console.log(`    Score: ${(score * 100).toFixed(0)}% (${checks.filter((c) => c.passed).length}/${checks.length})`);
  for (const c of checks) {
    if (!c.passed) {
      console.log(`      FAIL ${c.name}: ${c.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function writePersonaReport(report: PersonaReport, outDir: string): void {
  const lines: string[] = [
    `# QA Report: ${report.persona.name}`,
    "",
    `**Persona:** ${report.persona.description}`,
    `**Date:** ${new Date().toISOString()}`,
    `**Final Score:** ${(report.finalScore * 100).toFixed(0)}%`,
    `**Duration:** ${(report.totalDurationMs / 1000).toFixed(0)}s`,
    `**Project:** ${report.projectId}`,
    `**Chat:** ${report.chatId ?? "none"}`,
    report.fatalError ? `**FATAL ERROR:** ${report.fatalError}` : "",
    "",
  ];

  for (const phase of report.phases) {
    lines.push(`## Phase: ${phase.phase}`);
    lines.push(`- Success: ${phase.success}`);
    lines.push(`- Duration: ${(phase.durationMs / 1000).toFixed(0)}s`);
    lines.push(`- Iterations: ${phase.iterations.length}`);
    if (phase.errors.length > 0) {
      lines.push(`- Errors: ${phase.errors.join("; ")}`);
    }
    lines.push("");

    for (const iter of phase.iterations) {
      lines.push(`### Iteration ${iter.index}`);
      lines.push(`- Score: ${(iter.score * 100).toFixed(0)}%`);
      lines.push(`- Files: ${iter.files.length}`);
      lines.push(`- Message: ${iter.messageSent.slice(0, 200)}`);
      lines.push("");
      for (const c of iter.checks) {
        lines.push(`- ${c.passed ? "PASS" : "FAIL"} **${c.name}**: ${c.message}`);
      }
      lines.push("");
    }
  }

  writeFileSync(path.join(outDir, "report.md"), lines.join("\n"), "utf-8");
}

function writeAggregateReport(reports: PersonaReport[], outDir: string): void {
  const lines: string[] = [
    "# QA Autoloop V2 — Aggregate Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Personas tested:** ${reports.length}`,
    `**Total duration:** ${(reports.reduce((s, r) => s + r.totalDurationMs, 0) / 1000 / 60).toFixed(1)} minutes`,
    "",
    "## Per-persona summary",
    "",
    "| # | Name | Score | Duration | Phases | Fatal |",
    "|---|------|-------|----------|--------|-------|",
  ];

  for (const r of reports) {
    lines.push(
      `| ${r.persona.id} | ${r.persona.name} | ${(r.finalScore * 100).toFixed(0)}% | ${(r.totalDurationMs / 1000).toFixed(0)}s | ${r.phases.length} | ${r.fatalError ? "YES" : "-"} |`,
    );
  }

  // Aggregate failing checks
  const failCounts = new Map<string, number>();
  for (const r of reports) {
    for (const phase of r.phases) {
      for (const iter of phase.iterations) {
        for (const c of iter.checks) {
          if (!c.passed) {
            failCounts.set(c.name, (failCounts.get(c.name) ?? 0) + 1);
          }
        }
      }
    }
  }

  if (failCounts.size > 0) {
    lines.push("");
    lines.push("## Most common failures");
    lines.push("");
    const sorted = [...failCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      lines.push(`- **${name}**: ${count} occurrences`);
    }
  }

  // Fatal errors
  const fatals = reports.filter((r) => r.fatalError);
  if (fatals.length > 0) {
    lines.push("");
    lines.push("## Fatal errors");
    lines.push("");
    for (const r of fatals) {
      lines.push(`- **${r.persona.name}**: ${r.fatalError}`);
    }
  }

  lines.push("");
  lines.push("## Identified improvements / bugs");
  lines.push("");

  const avgScore = reports.reduce((s, r) => s + r.finalScore, 0) / reports.length;
  if (avgScore < 0.8) {
    lines.push("- CRITICAL: Average score below 80% — generation quality needs attention");
  }
  if (failCounts.has("no-as-const-metadata")) {
    lines.push("- BUG: `as const` on metadata arrays still occurring — strengthen prompt rules");
  }
  if (failCounts.has("swedish-characters")) {
    lines.push("- BUG: Some sites missing Swedish characters — check language enforcement");
  }
  if (failCounts.has("no-emojis")) {
    lines.push("- BUG: Emojis still appearing — add stronger emoji prohibition");
  }
  if (failCounts.has("content-density")) {
    lines.push("- IMPROVEMENT: Some pages too thin — increase minimum section requirements");
  }
  if (fatals.length > 0) {
    lines.push(
      `- RELIABILITY: ${fatals.length}/${reports.length} personas hit fatal errors — investigate stream stability`,
    );
  }

  writeFileSync(path.join(outDir, "aggregate-report.md"), lines.join("\n"), "utf-8");

  writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(
      reports.map((r) => ({
        personaId: r.persona.id,
        name: r.persona.name,
        finalScore: r.finalScore,
        totalDurationMs: r.totalDurationMs,
        phases: r.phases.map((p) => ({
          phase: p.phase,
          success: p.success,
          iterations: p.iterations.length,
          errors: p.errors.length,
        })),
        fatalError: r.fatalError,
      })),
      null,
      2,
    ),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RunConfig {
  personaCount: number;
  personaId: number | null;
  maxFixLoops: number;
  maxFollowups: number;
  timeoutMs: number;
  skipFollowups: boolean;
  outputDir: string | null;
}

function parseArgs(): RunConfig {
  const args = process.argv.slice(2);
  const config: RunConfig = {
    personaCount: 10,
    personaId: null,
    maxFixLoops: 5,
    maxFollowups: 3,
    timeoutMs: 15 * 60 * 1000,
    skipFollowups: false,
    outputDir: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--personas":
        config.personaCount = parseInt(args[++i], 10);
        break;
      case "--persona-id":
        config.personaId = parseInt(args[++i], 10);
        break;
      case "--max-fix-loops":
        config.maxFixLoops = parseInt(args[++i], 10);
        break;
      case "--max-followups":
        config.maxFollowups = parseInt(args[++i], 10);
        break;
      case "--timeout-min":
        config.timeoutMs = parseInt(args[++i], 10) * 60 * 1000;
        break;
      case "--skip-followups":
        config.skipFollowups = true;
        break;
      case "--output-dir":
        config.outputDir = args[++i];
        break;
    }
  }

  return config;
}

async function main(): Promise<void> {
  const config = parseArgs();

  const personas =
    config.personaId !== null
      ? PERSONAS.filter((p) => p.id === config.personaId)
      : PERSONAS.slice(0, config.personaCount);

  if (personas.length === 0) {
    console.error("No matching personas found.");
    process.exit(1);
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const baseOutDir = config.outputDir ?? path.join(process.cwd(), "output", "qa-runs", ts);

  console.log(`\nBuilder QA Autoloop V2`);
  console.log(`Personas: ${personas.length}`);
  console.log(`Max fix loops: ${config.maxFixLoops}`);
  console.log(`Max follow-ups: ${config.maxFollowups}`);
  console.log(`Timeout: ${config.timeoutMs / 1000 / 60} min`);
  console.log(`Output: ${baseOutDir}`);
  console.log(`Base URL: ${BASE_URL}`);

  const reports: PersonaReport[] = [];

  for (const persona of personas) {
    const personaDir = path.join(baseOutDir, `persona-${persona.id}-${slugify(persona.name)}`);
    if (!existsSync(personaDir)) mkdirSync(personaDir, { recursive: true });

    try {
      const report = await runPersona(persona, config);
      reports.push(report);
      writePersonaReport(report, personaDir);

      // Save last iteration's files
      const allIters = report.phases.flatMap((p) => p.iterations);
      const lastFiles = allIters[allIters.length - 1]?.files ?? [];
      if (lastFiles.length > 0) {
        const filesDir = path.join(personaDir, "files");
        for (const f of lastFiles) {
          const rel = f.name.replace(/\\/g, "/").replace(/^\//, "");
          const dest = path.join(filesDir, ...rel.split("/"));
          const parent = path.dirname(dest);
          if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
          writeFileSync(dest, f.content, "utf-8");
        }
      }

      // Save compiled prompt
      writeFileSync(
        path.join(personaDir, "compiled-prompt.md"),
        compilePrompt(persona),
        "utf-8",
      );
    } catch (err) {
      console.error(`\n[FATAL] Persona ${persona.id}: ${err}`);
      reports.push({
        persona,
        projectId: "",
        chatId: null,
        phases: [],
        finalScore: 0,
        totalDurationMs: 0,
        fatalError: String(err),
      });
    }
  }

  if (!existsSync(baseOutDir)) mkdirSync(baseOutDir, { recursive: true });
  writeAggregateReport(reports, baseOutDir);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`COMPLETE — ${reports.length} personas tested`);
  console.log(
    `Average score: ${(reports.reduce((s, r) => s + r.finalScore, 0) / reports.length * 100).toFixed(0)}%`,
  );
  console.log(`Fatals: ${reports.filter((r) => r.fatalError).length}`);
  console.log(`Output: ${baseOutDir}`);
  console.log(`${"=".repeat(70)}`);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
