/**
 * Browser QA Autoloop — Playwright Edition
 *
 * Drives a real Chromium browser through the full Starter builder flow
 * for fictional personas. Each persona:
 *   1. Authenticates (email/password via API)
 *   2. Navigates to the landing page → types description
 *   3. Walks through onboarding popups (site type, template, must-have, images)
 *   4. Waits for generation (with extended timeout)
 *   5. Scrolls the full generated site, takes detailed screenshots
 *   6. Navigates sub-pages in the preview and screenshots those
 *   7. Sends follow-up changes via chat
 *   8. Evaluates quality and suggests prompt improvements
 *   9. Writes per-persona + aggregate report
 *
 * Usage:
 *   npx tsx scripts/qa/browser-autoloop.ts [--personas N] [--persona-id N] [--headful]
 *
 * Env:
 *   SAJTMASKIN_URL    — base URL (default: http://localhost:3000)
 *   QA_EMAIL          — login email for authenticated sessions
 *   QA_PASSWORD       — login password
 *
 * Requires: local dev server (npm run dev) on localhost:3000
 * Output:   output/qa-browser-runs/TIMESTAMP/
 */

import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.SAJTMASKIN_URL ?? "http://localhost:3000";
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;
const STEP_TIMEOUT_MS = 30_000;
const PAUSE_BETWEEN_PERSONAS_MS = 120_000;

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

interface Persona {
  id: number;
  name: string;
  business: string;
  knowledge: string;
  description: string;
  siteTypes: string[];
  mustHaves: string[];
  existingUrl: string | null;
  followUps: string[];
}

const PERSONAS: Persona[] = [
  {
    id: 1,
    name: "Anna",
    business: "Frisörsalong i Göteborg",
    knowledge: "Non-technical",
    description:
      "Jag driver en frisörsalong som heter Salong Bella i Göteborg. Vi erbjuder klippning, färgning och styling. Jag vill ha en enkel och snygg hemsida där kunder kan boka tid.",
    siteTypes: ["Salong / Skönhet"],
    mustHaves: ["Bokning online", "Bildgalleri", "Kontaktformulär"],
    existingUrl: null,
    followUps: [
      "Ändra färgschemat till rosa och guld istället",
      "Lägg till en sektion med kundrecensioner",
    ],
  },
  {
    id: 2,
    name: "Erik",
    business: "IT-konsult i Stockholm",
    knowledge: "Technical, impatient",
    description:
      "NordTech Solutions är ett IT-konsultföretag i Stockholm. Vi erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag.",
    siteTypes: ["Konsult / Byrå"],
    mustHaves: ["Kontaktformulär", "Priser och paket"],
    existingUrl: "https://www.techbuddy.se",
    followUps: [
      "Lägg till en FAQ-sektion på startsidan",
      "Ändra hero-rubriken till 'Moderna IT-lösningar för framtidens företag'",
    ],
  },
  {
    id: 3,
    name: "Fatima",
    business: "Restaurang i Malmö",
    knowledge: "Mobile-first, basic",
    description:
      "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Vi har lunch, à la carte och catering.",
    siteTypes: ["Restaurang / Café"],
    mustHaves: ["Meny / Matsedel", "Bokning online", "Kontaktformulär"],
    existingUrl: null,
    followUps: [
      "Lägg till en sektion med veckans lunch",
      "Ändra öppettiderna till Mån-Fre 11-22, Lör-Sön 12-23",
    ],
  },
  {
    id: 4,
    name: "Mohammed",
    business: "Bilverkstad i Västerås",
    knowledge: "Basic smartphone",
    description:
      "Mohammeds Bilservice i Västerås erbjuder bilreparationer, service, däckbyten och besiktningsförberedelser till bra priser.",
    siteTypes: ["Företag / Tjänster"],
    mustHaves: ["Priser och paket", "Kontaktformulär", "Karta / Hitta hit"],
    existingUrl: "https://www.mekonomen.se",
    followUps: ["Byt telefonnumret till 021-123 45 67 på alla sidor"],
  },
  {
    id: 5,
    name: "Linnea",
    business: "Yoga-studio i Lund",
    knowledge: "Creative, Mac user",
    description:
      "Balans Yoga i Lund erbjuder yogaklasser, meditation och retreats. Vi har allt från nybörjare till avancerade yogis.",
    siteTypes: ["Gym / Tränare"],
    mustHaves: ["Bokning online", "Priser och paket", "Bildgalleri"],
    existingUrl: null,
    followUps: [
      "Lägg till ett schema med veckans klasser",
      "Ändra färgschemat till grönt och beige",
    ],
  },
  {
    id: 6,
    name: "Oskar",
    business: "Advokatbyrå i Linköping",
    knowledge: "Corporate polish",
    description:
      "Advokatfirman Bergström & Co i Linköping specialiserar sig på affärsjuridik, arbetsrätt och fastighetsrätt för företag.",
    siteTypes: ["Juridik / Advokat"],
    mustHaves: ["Kontaktformulär", "Vårt team"],
    existingUrl: "https://www.delphi.se",
    followUps: [
      "Lägg till bilder och korta bios för alla tre partners",
      "Ändra färgschemat till mörkblått och guld",
    ],
  },
  {
    id: 7,
    name: "Mei",
    business: "Second-hand butik i Uppsala",
    knowledge: "Social media savvy",
    description:
      "Gröna Garderoben i Uppsala säljer hållbart second-hand mode. Vi köper och säljer kvalitetskläder, skor och accessoarer.",
    siteTypes: ["Företag / Tjänster"],
    mustHaves: ["Bildgalleri", "Kontaktformulär", "Sociala medier-länkar"],
    existingUrl: null,
    followUps: [
      "Lägg till en Instagram-feed på startsidan",
      "Ändra typsnittsfärgen till mörkgrön",
    ],
  },
  {
    id: 8,
    name: "Björn",
    business: "Takläggeri i Norrköping",
    knowledge: "iPad only, 60 years",
    description:
      "Björns Tak & Fasad i Norrköping erbjuder takläggning, fasadrenovering och plåtarbeten. Vi har 30 års erfarenhet.",
    siteTypes: ["Bygg / Hantverk"],
    mustHaves: ["Bildgalleri", "Kontaktformulär", "Kundrecensioner"],
    existingUrl: "https://www.taklaggarna.se",
    followUps: [
      "Lägg till en referenssida med före- och efterbilder",
      "Lägg till ROT-avdrag information",
    ],
  },
  {
    id: 9,
    name: "Saga",
    business: "Influencer/content i Malmö",
    knowledge: "Instagram-level expectations",
    description:
      "Jag är Saga, content creator och influencer i Malmö. Jag vill ha en portfolio-sajt som visar mina samarbeten, bilder och kontaktinfo för varumärken.",
    siteTypes: ["Portfolio / CV"],
    mustHaves: ["Bildgalleri", "Kontaktformulär", "Sociala medier-länkar"],
    existingUrl: null,
    followUps: [
      "Dela upp galleriet i kategorier: Mode, Resor och Livsstil",
      "Ändra hero-bilden till en mörk bakgrund med vit text",
    ],
  },
  {
    id: 10,
    name: "Lars",
    business: "Pensionär hobby blogg",
    knowledge: "Very slow with tech, 67",
    description:
      "Jag heter Lars och är pensionerad snickare. Jag vill starta en blogg om träslöjd och snickeri där jag delar tips, projekt och instruktioner.",
    siteTypes: ["Blogg / Magasin"],
    mustHaves: ["Kontaktformulär", "Bildgalleri"],
    existingUrl: null,
    followUps: [
      "Lägg till ett nyhetsbrev-formulär i sidofältet",
      "Ändra rubrikerna till ett mer lättläst typsnitt",
    ],
  },
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface PromptSuggestion {
  area: string;
  current: string;
  suggestion: string;
}

async function evaluatePreview(page: Page): Promise<{ checks: EvalCheck[]; suggestions: PromptSuggestion[] }> {
  const checks: EvalCheck[] = [];
  const suggestions: PromptSuggestion[] = [];

  const iframeCount = await page.locator("iframe").count();
  if (iframeCount === 0) {
    checks.push({ name: "iframe-accessible", passed: false, detail: "No iframe present — preview VM not provisioned" });
    suggestions.push({
      area: "preview",
      current: "Preview iframe not available",
      suggestion: "Check preview_host (Fly.io VM) health and sandbox-preview route for errors",
    });
    return { checks, suggestions };
  }

  const iframe = page.frameLocator("iframe").first();

  let bodyText = "";
  try {
    bodyText = (await iframe.locator("body").innerText({ timeout: 10_000 })) ?? "";
  } catch {
    checks.push({ name: "iframe-accessible", passed: false, detail: "Could not read iframe body (iframe exists but no content)" });
    return { checks, suggestions };
  }
  checks.push({ name: "iframe-accessible", passed: true, detail: "OK" });

  const hasSwedishChars = /[åäöÅÄÖ]/.test(bodyText);
  checks.push({
    name: "swedish-characters",
    passed: hasSwedishChars,
    detail: hasSwedishChars ? "Found å/ä/ö" : "No Swedish characters found in body",
  });
  if (!hasSwedishChars) {
    suggestions.push({
      area: "language",
      current: "Site generated without Swedish characters",
      suggestion: "Explicitly mention 'på svenska' in the description to ensure Swedish output",
    });
  }

  const englishPhrases = ["Welcome to", "About Us", "Our Services", "Get Started", "Learn More", "Subscribe", "Contact Us"];
  const foundEnglish = englishPhrases.filter((p) => bodyText.includes(p));
  checks.push({
    name: "no-english-body",
    passed: foundEnglish.length === 0,
    detail: foundEnglish.length === 0 ? "No English phrases" : `Found: ${foundEnglish.join(", ")}`,
  });
  if (foundEnglish.length > 0) {
    suggestions.push({
      area: "language",
      current: `English phrases detected: ${foundEnglish.join(", ")}`,
      suggestion: "Add 'Allt ska vara på svenska' to the prompt to force Swedish-only content",
    });
  }

  const hasLorem = /lorem ipsum/i.test(bodyText);
  checks.push({
    name: "no-lorem-ipsum",
    passed: !hasLorem,
    detail: hasLorem ? "Lorem ipsum found" : "Clean",
  });
  if (hasLorem) {
    suggestions.push({
      area: "content",
      current: "Lorem ipsum placeholder text detected",
      suggestion: "Include more specific business details in the prompt to give the AI enough content to generate real copy",
    });
  }

  const h1Count = await iframe.locator("h1").count();
  checks.push({
    name: "has-heading",
    passed: h1Count > 0,
    detail: h1Count > 0 ? `${h1Count} H1(s)` : "No H1 found",
  });

  let h1Text = "";
  if (h1Count > 0) {
    try {
      h1Text = await iframe.locator("h1").first().innerText({ timeout: 3_000 });
    } catch { /* ignore */ }
  }

  const hasCTA = await iframe.locator("a, button").filter({ hasText: /kontakt|boka|ring|offert|beställ|läs mer|se mer/i }).count() > 0;
  checks.push({
    name: "has-cta",
    passed: hasCTA,
    detail: hasCTA ? "Swedish CTA found" : "No Swedish CTA button found",
  });
  if (!hasCTA) {
    suggestions.push({
      area: "cta",
      current: "No clear Swedish call-to-action button",
      suggestion: "Specify the desired CTA text in the prompt, e.g. 'med en tydlig Boka tid-knapp'",
    });
  }

  const imgCount = await iframe.locator("img").count();
  checks.push({
    name: "has-images",
    passed: imgCount > 0,
    detail: imgCount > 0 ? `${imgCount} images` : "No images",
  });

  const hasFooter = await iframe.locator("footer").count() > 0;
  checks.push({
    name: "has-footer",
    passed: hasFooter,
    detail: hasFooter ? "Footer present" : "No footer found",
  });

  const hasNav = await iframe.locator("nav").count() > 0;
  checks.push({
    name: "has-navigation",
    passed: hasNav,
    detail: hasNav ? "Nav present" : "No nav found",
  });

  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  checks.push({
    name: "content-density",
    passed: wordCount >= 100,
    detail: `${wordCount} words`,
  });
  if (wordCount < 100) {
    suggestions.push({
      area: "content",
      current: `Only ${wordCount} words generated`,
      suggestion: "Provide more details about services, team, and unique selling points in the prompt",
    });
  }

  const sectionCount = await iframe.locator("section").count();
  checks.push({
    name: "has-sections",
    passed: sectionCount >= 3,
    detail: `${sectionCount} sections`,
  });
  if (sectionCount < 3) {
    suggestions.push({
      area: "structure",
      current: `Only ${sectionCount} sections`,
      suggestion: "Request specific sections in the prompt: 'med sektioner för tjänster, om oss, kontakt och kundrecensioner'",
    });
  }

  const linkCount = await iframe.locator("a[href]").count();
  checks.push({
    name: "has-internal-links",
    passed: linkCount >= 3,
    detail: `${linkCount} links`,
  });

  const hasContactInfo = /\d{2,4}[\s-]?\d{2,3}[\s-]?\d{2,4}|@|mailto/i.test(bodyText);
  checks.push({
    name: "has-contact-info",
    passed: hasContactInfo,
    detail: hasContactInfo ? "Phone/email found" : "No contact info detected",
  });
  if (!hasContactInfo) {
    suggestions.push({
      area: "contact",
      current: "No phone number or email visible",
      suggestion: "Include phone number and email in the prompt for the AI to use",
    });
  }

  // Check for hero heading relevance
  if (h1Text) {
    const h1Lower = h1Text.toLowerCase();
    const isGeneric = /välkommen|welcome|heading|title/i.test(h1Lower);
    checks.push({
      name: "relevant-heading",
      passed: !isGeneric,
      detail: isGeneric ? `Generic heading: "${h1Text}"` : `Heading: "${h1Text.slice(0, 60)}"`,
    });
    if (isGeneric) {
      suggestions.push({
        area: "heading",
        current: `Generic heading: "${h1Text}"`,
        suggestion: "Specify the hero headline in the prompt, e.g. 'med rubriken: Din lokala frisör i Göteborg'",
      });
    }
  }

  return { checks, suggestions };
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

function log(persona: Persona, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [P${persona.id} ${persona.name}] ${msg}`);
}

async function screenshot(page: Page, dir: string, name: string) {
  const fp = path.join(dir, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  return fp;
}

async function fullPageScreenshot(page: Page, dir: string, name: string) {
  const fp = path.join(dir, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: true });
  return fp;
}

async function safeClick(page: Page, selector: string, opts?: { timeout?: number }) {
  const timeout = opts?.timeout ?? STEP_TIMEOUT_MS;
  try {
    await page.locator(selector).first().click({ timeout });
  } catch {
    // Element not found — skip gracefully
  }
}

async function typeInChat(page: Page, message: string) {
  const chatInput = page.locator(
    'textarea[data-openclaw-text-target="builder.chat.primary"], textarea[placeholder*="Beskriv vad du vill"], textarea[placeholder*="Skriv eller prata"]',
  );
  try {
    await chatInput.first().waitFor({ state: "visible", timeout: 15_000 });
    await chatInput.first().fill(message);
    await page.keyboard.press("Enter");
  } catch {
    const anyTextarea = page.locator("textarea:visible").first();
    await anyTextarea.fill(message);
    await page.keyboard.press("Enter");
  }
}

async function dismissOverlays(page: Page) {
  // Cookie banner
  try {
    const acceptBtn = page.locator('button:has-text("Acceptera")');
    if (await acceptBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
  } catch { /* no banner */ }

  // Welcome/onboarding modals
  for (let attempt = 0; attempt < 5; attempt++) {
    let dismissed = false;

    // Full-screen video modal (from Vimeo thumbnail click)
    try {
      const videoModal = page.locator('.fixed.inset-0 video, .fixed.inset-0:has(video)').first();
      if (await videoModal.isVisible({ timeout: 500 }).catch(() => false)) {
        // Click the backdrop area or press Escape to close
        const backdrop = page.locator('.fixed.inset-0 .bg-black\\/80, .fixed.inset-0 [class*="backdrop"]').first();
        if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
          await backdrop.click({ position: { x: 10, y: 10 } });
          dismissed = true;
          await page.waitForTimeout(500);
        } else {
          await page.keyboard.press("Escape");
          dismissed = true;
          await page.waitForTimeout(500);
        }
      }
    } catch { /* no video modal */ }

    // Skip video button
    try {
      const skipVideo = page.locator('button:has-text("Hoppa över videon")');
      if (await skipVideo.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipVideo.click();
        dismissed = true;
        await page.waitForTimeout(500);
      }
    } catch { /* no video modal */ }

    // Generic close/X buttons on modals
    try {
      const closeBtn = page.locator('.fixed button[aria-label="Stäng"], .fixed button:has(svg.lucide-x)').first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click();
        dismissed = true;
        await page.waitForTimeout(500);
      }
    } catch { /* no close button */ }

    // Press Escape as fallback
    if (!dismissed) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // Check if any fixed overlay is still present
    const hasOverlay = await page.locator('.fixed.inset-0').isVisible({ timeout: 500 }).catch(() => false);
    if (!hasOverlay) break;
  }
}

async function authenticateViaApi(context: BrowserContext, persona: Persona): Promise<boolean> {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) {
    log(persona, "No QA_EMAIL/QA_PASSWORD set — running as guest");
    return false;
  }

  log(persona, `Authenticating as ${email}...`);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      log(persona, `Auth retry ${attempt + 1}...`);
      await new Promise((r) => setTimeout(r, 3_000));
    }
    try {
      const page = await context.newPage();
      // Navigate to a stable API endpoint (returns JSON, no redirects)
      await page.goto(`${BASE_URL}/api/health`, { waitUntil: "commit", timeout: 20_000 }).catch(async () => {
        // Fallback: just go to the domain root with minimal wait
        await page.goto(BASE_URL, { waitUntil: "commit", timeout: 20_000 }).catch(() => {});
      });
      await page.waitForTimeout(500);
      log(persona, "Auth domain set, calling login API...");

      const result = await page.evaluate(async ({ email, password, baseUrl }) => {
        try {
          const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            credentials: "include",
          });
          const data = await res.json().catch(() => ({}));
          return { ok: res.ok, status: res.status, data };
        } catch (err) {
          return { ok: false, status: 0, data: { error: String(err) } };
        }
      }, { email, password, baseUrl: BASE_URL });

      if (result.ok) {
        log(persona, `Authenticated OK as ${email}`);
        await page.close();
        return true;
      }

      log(persona, `Auth failed (${result.status}): ${JSON.stringify(result.data).slice(0, 200)}`);
      await page.close();
    } catch (err) {
      log(persona, `Auth error (attempt ${attempt + 1}): ${err}`);
    }
  }
  
  log(persona, "Auth failed after 3 attempts — continuing as guest");
  return false;
}

// Preferred quick reply answers for each onboarding step field
const PREFERRED_REPLIES: Record<string, string[]> = {
  existingSite: ["Nej, börja från noll", "Börja från noll", "Nej"],
  goal: ["Få fler kunder att boka tid", "Bygga förtroende", "Samla leads"],
  audience: ["Privatpersoner", "Alla målgrupper", "Lokala kunder"],
  mustHave: ["Kontaktformulär", "Bokning online", "Bildgalleri"],
  style: ["Rent och modernt", "Skandinavisk och stilren"],
  existingWebsite: ["Nej, börja från noll", "Vi har bara sociala medier", "Nej"],
};

async function handleClarifyingQuestions(page: Page, persona: Persona): Promise<boolean> {
  const isBuilder = page.url().includes("/builder");
  if (!isBuilder) return false;

  // Broad selector: any button on page (we filter by text and visibility)
  const allButtons = page.locator('button:visible');
  const count = await allButtons.count();
  
  const EXCLUDED_LABELS = /^(guidad|välj mall|analysera|publicera|pro|ändra|byt till|stäng|logga|spara|skicka|bygg min|kom igång|hoppa över videon|se demo|amatör|funktioner|teknik|priser|visa konversation|byt till pro|mic|röst)/i;
  const CHROME_LABELS = /^(sajtmaskin|publicera|pro|←|→|×|⌘)/i;
  
  const visibleButtons: { idx: number; text: string }[] = [];
  for (let i = 0; i < Math.min(count, 40); i++) {
    const btn = allButtons.nth(i);
    try {
      const isDisabled = await btn.isDisabled().catch(() => true);
      if (isDisabled) continue;
      const text = (await btn.innerText({ timeout: 1_000 }).catch(() => "")).trim().replace(/\n.*/s, "");
      if (text.length > 2 && text.length < 60 && !EXCLUDED_LABELS.test(text) && !CHROME_LABELS.test(text)) {
        visibleButtons.push({ idx: i, text });
      }
    } catch { /* skip */ }
  }

  if (visibleButtons.length === 0) return false;

  const clickReply = async (idx: number, label: string): Promise<boolean> => {
    try {
      await allButtons.nth(idx).click({ force: true, timeout: 5_000 });
      log(persona, `Clicked: "${label}"`);
      return true;
    } catch {
      log(persona, `Click failed for: "${label}"`);
      return false;
    }
  };

  // Priority 1: Try preferred replies for known fields
  const allPreferred = Object.values(PREFERRED_REPLIES).flat();
  for (const pref of allPreferred) {
    const match = visibleButtons.find((b) => b.text.includes(pref) || pref.includes(b.text));
    if (match) return clickReply(match.idx, match.text);
  }

  // Priority 2: Try persona-specific must-haves
  for (const mh of persona.mustHaves) {
    const match = visibleButtons.find((b) => b.text.includes(mh));
    if (match) return clickReply(match.idx, match.text);
  }

  // Priority 3: Click any "Nej" or "från noll" button  
  const negativeMatch = visibleButtons.find((b) => 
    /^nej\b|börja från noll|ingen|inte just nu/i.test(b.text)
  );
  if (negativeMatch) return clickReply(negativeMatch.idx, negativeMatch.text);

  // Priority 4: Click any visible quick reply that looks like an option
  const safeMatch2 = visibleButtons.find((b) => 
    !/(publicera|pro|ändra|byt|stäng|logga|spara|konsult|tjänster|restaurang|café|wellness|butik|tech|kreativ|utbildning|handel|fastighet|annat|guidad)/i.test(b.text) &&
    b.text.length < 60
  );
  if (safeMatch2) return clickReply(safeMatch2.idx, safeMatch2.text);

  return false;
}

async function waitForGeneration(page: Page, persona: Persona, outDir: string): Promise<boolean> {
  log(persona, "Waiting for generation to complete...");
  const start = Date.now();
  let lastScreenshot = 0;
  let screenshotIdx = 0;
  let clarifyingAttempts = 0;

  while (Date.now() - start < GENERATION_TIMEOUT_MS) {
    // Dismiss any blocking overlays (video modal, etc.) before checking state
    await dismissOverlays(page);

    // Handle clarifying questions — check for enabled quick reply buttons in chat
    if (clarifyingAttempts < 15) {
      try {
        const answered = await handleClarifyingQuestions(page, persona);
        if (answered) {
          log(persona, `Answered clarifying question during generation (attempt ${clarifyingAttempts + 1})`);
          clarifyingAttempts++;
          await page.waitForTimeout(5_000);
          continue;
        }
      } catch (err) {
        log(persona, `Clarifying question click failed (non-fatal): ${String(err).slice(0, 120)}`);
      }
      
      // Also check for explicit "needs answer" prompt and type a response
      const needsAnswer = await page.locator('text="Jag behöver ditt svar"').isVisible().catch(() => false);
      if (needsAnswer) {
        const contextAnswers = [
          `Jag vill ha ${persona.mustHaves.join(", ")}. Börja bygga nu tack!`,
          `Det viktigaste är ${persona.mustHaves[0] ?? "kontaktformulär"}. Kör igång!`,
          "Bygg sidan med standardinställningar, jag kollar resultatet sen!",
          "Jag vill se ett första utkast nu. Vi finjusterar sen!",
          "Ja, det räcker. Bygg nu!",
        ];
        const answer = contextAnswers[clarifyingAttempts % contextAnswers.length]!;
        try {
          await typeInChat(page, answer);
          log(persona, `Typed context answer: "${answer}"`);
        } catch {
          log(persona, "Could not answer clarifying question");
        }
        clarifyingAttempts++;
        await page.waitForTimeout(5_000);
        continue;
      }
    }

    // Handle mode picker if it appears during generation
    const modePickerVisible = await page.locator('text="Hur van är du att bygga hemsidor?"').isVisible().catch(() => false);
    if (modePickerVisible) {
      const amateurBtn = page.locator('button:has(span:text("Amatör"))').first();
      if (await amateurBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await amateurBtn.click();
        log(persona, "Selected Amatör mode (during generation wait)");
        await page.waitForTimeout(3_000);
      }
      continue;
    }

    // Handle must-have picker if it appears during generation
    const mustHaveVisible = await page.locator('text="Vilka delar måste finnas med?"').isVisible().catch(() => false);
    if (mustHaveVisible) {
      const skipMH = page.locator('text="Hoppa över"').first();
      if (await skipMH.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await skipMH.click();
        log(persona, "Skipped must-have picker (during generation wait)");
        await page.waitForTimeout(2_000);
      }
      continue;
    }

    // Handle template/style picker ("Vilken stil tilltalar dig?")
    const stylePickerVisible = await page.locator('text="Vilken stil tilltalar dig?"').isVisible().catch(() => false);
    if (stylePickerVisible) {
      log(persona, "Style picker detected — selecting first template and continuing...");
      // Click first template card
      const firstCard = page.locator('[class*="grid"] img, [class*="grid"] button').first();
      if (await firstCard.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await firstCard.click();
        log(persona, "Selected first style template");
        await page.waitForTimeout(1_000);
      }
      // Click "Välj minst en" or "Fortsätt" or "Hoppa över"
      const continueStyleBtn = page.locator('button:has-text("Välj minst en"), button:has-text("Fortsätt")').first();
      if (await continueStyleBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await continueStyleBtn.click();
        log(persona, "Clicked continue on style picker");
      } else {
        const skipStyle = page.locator('text="Hoppa över"').first();
        if (await skipStyle.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await skipStyle.click();
          log(persona, "Skipped style picker");
        }
      }
      await page.waitForTimeout(3_000);
      continue;
    }

    // Handle must-have picker ("Vilka delar måste finnas med?") — in generation wait
    const mustHavePickerGen = await page.locator('text="Vilka delar måste finnas med?"').isVisible().catch(() => false);
    if (mustHavePickerGen) {
      log(persona, "Must-have picker detected during generation — selecting and continuing...");
      for (const mh of persona.mustHaves.slice(0, 2)) {
        const chip = page.locator(`button:has-text("${mh}")`).first();
        if (await chip.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await chip.click();
          log(persona, `Selected must-have: ${mh}`);
          await page.waitForTimeout(300);
        }
      }
      const continueMH = page.locator('button:has-text("Välj minst en"), button:has-text("Fortsätt")').first();
      if (await continueMH.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await continueMH.click();
      } else {
        const skipMH2 = page.locator('text="Hoppa över"').first();
        if (await skipMH2.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await skipMH2.click();
        }
      }
      await page.waitForTimeout(3_000);
      continue;
    }

    // Handle wizard popup ("Berätta om ditt företag") — fill minimally and advance
    const wizardVisible = await page.locator('text="Berätta om ditt företag"').isVisible().catch(() => false);
    if (wizardVisible) {
      log(persona, "Wizard popup detected during generation wait — filling and advancing...");
      
      // Fill company name (required)
      const nameInput = page.locator('input[placeholder*="företag"], input[placeholder*="projekt"]').first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const name = persona.business.split(" i ")[0] ?? persona.name;
        await nameInput.fill(name);
        log(persona, `Wizard: filled name "${name}"`);
      }
      
      // Fill location
      const locInput = page.locator('input[placeholder*="Stockholm"], input[placeholder*="Göteborg"], input[placeholder*="annat"]').first();
      if (await locInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const city = persona.business.split(" i ").pop() ?? "";
        if (city) await locInput.fill(city);
      }
      
      // Fill URL if exists
      if (persona.existingUrl) {
        const urlInput = page.locator('input[placeholder*="dinhemsida"], input[placeholder*="hemsida"]').first();
        if (await urlInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await urlInput.fill(persona.existingUrl);
        }
      }
      
      await page.waitForTimeout(500);
      
      // Try advancing through all wizard steps
      for (let ws = 0; ws < 6; ws++) {
        const nextBtn = page.locator('button:has-text("Nästa"), button:has-text("Fortsätt"), button:has-text("Klar"), button:has-text("Starta"), button:has-text("Bygg"), button:has-text("Skapa")').first();
        if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await nextBtn.click({ force: true });
          log(persona, `Wizard step ${ws + 1}: clicked next`);
          await page.waitForTimeout(2_000);
        } else {
          break;
        }
        
        // Check if wizard closed
        const stillWizard = await page.locator('text="Berätta om ditt företag"').isVisible().catch(() => false);
        if (!stillWizard) {
          log(persona, "Wizard closed");
          break;
        }
      }
      
      // If wizard is still open, close it with X
      const stillOpen = await page.locator('text="Berätta om ditt företag"').isVisible().catch(() => false);
      if (stillOpen) {
        const xBtn = page.locator('button:has(svg[class*="lucide-x"]), button:has(svg.lucide-x), [class*="fixed"] button[aria-label*="täng"]').first();
        if (await xBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await xBtn.click();
          log(persona, "Closed wizard with X button");
        } else {
          await page.keyboard.press("Escape");
          log(persona, "Pressed Escape to close wizard");
        }
      }
      
      await page.waitForTimeout(3_000);
      continue;
    }

    // Check for rate limit messages
    const rateLimited = await page.locator('text=/rate limit|för många förfrågningar/i').isVisible().catch(() => false);
    if (rateLimited) {
      log(persona, "Rate limited! Waiting 60s before retrying...");
      await page.waitForTimeout(60_000);
      continue;
    }

    // Check for free limit reached
    const freeLimitReached = await page.locator('text=/gratis förfining|skapa ett konto/i').isVisible().catch(() => false);
    if (freeLimitReached) {
      log(persona, "Free refinement limit reached — need authentication");
      return false;
    }

    // Signal 1: Progress bar DISAPPEARED — generation and sandbox provisioning both done
    // The cosmetic GenerationProgress renders when externalLoading || sandboxPending.
    // When it vanishes, the preview should be ready (or failed).
    const progressVisible = await page.locator('text="Bygger din sajt..."').isVisible().catch(() => false);
    const emptyStateVisible = await page.locator('text="Din hemsida visas här"').isVisible().catch(() => false);
    const hasBeenBuilding = Date.now() - start > 15_000;

    if (!progressVisible && !emptyStateVisible && hasBeenBuilding) {
      // Progress bar gone AND not showing initial empty state — check if we have preview
      const hasIf = await page.locator("iframe").count() > 0;
      if (hasIf) {
        try {
          const bodyText = await page.frameLocator("iframe").first().locator("body").innerText({ timeout: 8_000 });
          const wordCount = bodyText?.trim().split(/\s+/).filter(Boolean).length ?? 0;
          if (wordCount > 10) {
            log(persona, `Generation complete (progress bar gone, preview loaded)! (${Math.round((Date.now() - start) / 1000)}s, ~${wordCount} words)`);
            return true;
          }
        } catch { /* iframe not ready */ }
      }
      // Progress bar gone but no iframe — check for error state or completion
      const sandboxError = await page.locator('text="Sajten kunde inte visas"').isVisible().catch(() => false);
      if (sandboxError) {
        log(persona, `Generation complete but preview failed! (${Math.round((Date.now() - start) / 1000)}s)`);
        return true;
      }
    }

    // Signal 2: iframe with substantial content
    const hasIframe = await page.locator("iframe").count() > 0;
    const iframeVisible = hasIframe && await page.locator("iframe").first().isVisible().catch(() => false);

    if (iframeVisible) {
      try {
        const iframe = page.frameLocator("iframe").first();
        const bodyText = await iframe.locator("body").innerText({ timeout: 8_000 });
        const wordCount = bodyText?.trim().split(/\s+/).filter(Boolean).length ?? 0;
        if (wordCount > 30) {
          log(persona, `Generation complete! (${Math.round((Date.now() - start) / 1000)}s, ~${wordCount} words in preview)`);
          return true;
        }
      } catch {
        // iframe not ready yet
      }
    }

    // Signal 3: Explicit "done" text in chat messages
    const doneMsg = await page.locator('text=/Din hemsida är klar/').first().isVisible().catch(() => false);
    const siteReady = await page.locator('text=/Din sajt är redo/').first().isVisible().catch(() => false);
    const siteReady2 = await page.locator('text=/Din sajt är klar/').first().isVisible().catch(() => false);
    
    if (doneMsg || siteReady || siteReady2) {
      const label = doneMsg ? "Din hemsida är klar" : siteReady ? "Din sajt är redo" : "Din sajt är klar";
      log(persona, `Generation done via chat message! (${Math.round((Date.now() - start) / 1000)}s) — "${label}"`);
      
      for (let iframeWait = 0; iframeWait < 9; iframeWait++) {
        await page.waitForTimeout(10_000);
        const hasIf = await page.locator("iframe").count() > 0;
        if (hasIf) {
          try {
            const bodyText = await page.frameLocator("iframe").first().locator("body").innerText({ timeout: 8_000 });
            const wordCount = bodyText?.trim().split(/\s+/).filter(Boolean).length ?? 0;
            if (wordCount > 10) {
              log(persona, `Preview iframe loaded! (~${wordCount} words, waited ${(iframeWait + 1) * 10}s)`);
              return true;
            }
          } catch { /* not ready */ }
        }
        if (iframeWait % 3 === 2) {
          log(persona, `Still waiting for preview... (${(iframeWait + 1) * 10}s)`);
        }
      }
      log(persona, "Preview iframe didn't load within 90s — proceeding without preview");
      return true;
    }

    // Safety valve: if cosmetic progress bar shows 100% for >60s, check if generation actually finished
    const progressBarActive = await page.locator('text=/\\d+%/').isVisible().catch(() => false);
    if (progressBarActive) {
      try {
        const pctText = await page.locator('text=/\\d+%/').first().innerText({ timeout: 2_000 });
        const pctNum = parseInt(pctText.replace(/[^0-9]/g, ""), 10);
        if (pctNum >= 99 && Date.now() - start > 720_000) {
          log(persona, "Progress bar at 100% for >12min with no completion signal — accepting as done");
          return true;
        }
      } catch { /* ignore */ }
    }

    if (Date.now() - lastScreenshot > 60_000) {
      await screenshot(page, outDir, `progress-${String(screenshotIdx++).padStart(2, "0")}`);
      lastScreenshot = Date.now();
      const elapsed = Math.round((Date.now() - start) / 1000);
      log(persona, `Still generating... (${elapsed}s)`);
    }

    await page.waitForTimeout(5_000);
  }

  log(persona, "Generation timed out!");
  return false;
}

// ---------------------------------------------------------------------------
// Generated site deep inspection
// ---------------------------------------------------------------------------

async function inspectGeneratedSite(
  page: Page,
  persona: Persona,
  personaDir: string,
): Promise<{ screenshots: string[]; pageCount: number; navLinks: string[] }> {
  const screenshots: string[] = [];
  const navLinks: string[] = [];

  screenshots.push(await screenshot(page, personaDir, "site-overview"));

  const iframeCount = await page.locator("iframe").count();
  if (iframeCount === 0) {
    log(persona, "No iframe found — preview VM likely didn't provision. Taking builder screenshots instead.");
    screenshots.push(await fullPageScreenshot(page, personaDir, "builder-full-page"));
    return { screenshots, pageCount: 0, navLinks: [] };
  }

  // Get the iframe src so we can open it directly (cross-origin iframes render as gray in screenshots)
  let previewUrl: string | null = null;
  try {
    previewUrl = await page.locator("iframe").first().getAttribute("src");
  } catch { /* ignore */ }

  if (!previewUrl) {
    log(persona, "Could not extract iframe src — falling back to builder screenshots");
    screenshots.push(await fullPageScreenshot(page, personaDir, "builder-full-page"));
    return { screenshots, pageCount: 0, navLinks: [] };
  }

  log(persona, `Opening preview directly: ${previewUrl}`);

  const previewPage = await page.context().newPage();
  try {
    await previewPage.setViewportSize({ width: 1280, height: 900 });
    await previewPage.goto(previewUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await previewPage.waitForTimeout(2_000);

    // Scroll through the entire preview page, taking screenshots at intervals
    log(persona, "Taking detailed scroll screenshots of generated site...");
    const scrollHeight = await previewPage.evaluate(() => document.body.scrollHeight);
    const viewportHeight = 900;
    const steps = Math.ceil(scrollHeight / (viewportHeight * 0.7));

    for (let i = 0; i <= Math.min(steps, 20); i++) {
      const scrollY = Math.min(i * viewportHeight * 0.7, scrollHeight);
      await previewPage.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scrollY);
      await previewPage.waitForTimeout(600);
      const fp = path.join(personaDir, `site-scroll-${String(i).padStart(2, "0")}.png`);
      await previewPage.screenshot({ path: fp, fullPage: false });
      screenshots.push(fp);
    }

    // Take a full-page screenshot
    const fpFull = path.join(personaDir, "site-full-page.png");
    await previewPage.evaluate(() => window.scrollTo({ top: 0 }));
    await previewPage.waitForTimeout(500);
    await previewPage.screenshot({ path: fpFull, fullPage: true });
    screenshots.push(fpFull);

    // Discover navigation links
    log(persona, "Discovering navigation links...");
    try {
      const links = previewPage.locator("nav a[href]");
      const count = await links.count();
      for (let i = 0; i < count; i++) {
        const href = await links.nth(i).getAttribute("href").catch(() => null);
        const text = await links.nth(i).innerText().catch(() => "");
        if (href && text.trim()) {
          navLinks.push(`${text.trim()} → ${href}`);
        }
      }
      if (navLinks.length > 0) {
        log(persona, `Found ${navLinks.length} nav links: ${navLinks.map(l => l.split(" → ")[0]).join(", ")}`);
      }
    } catch {
      log(persona, "Could not inspect nav links");
    }

    // Navigate to each sub-page and screenshot
    if (navLinks.length > 0) {
      log(persona, "Navigating through sub-pages...");
      for (let i = 0; i < Math.min(navLinks.length, 6); i++) {
        try {
          const link = previewPage.locator("nav a[href]").nth(i);
          const linkText = await link.innerText().catch(() => `page-${i}`);
          await link.click({ timeout: 5_000 });
          await previewPage.waitForTimeout(2_000);

          await previewPage.evaluate(() => window.scrollTo({ top: 0 }));
          await previewPage.waitForTimeout(500);
          const fpTop = path.join(personaDir, `site-page-${slugify(linkText)}-top.png`);
          await previewPage.screenshot({ path: fpTop, fullPage: false });
          screenshots.push(fpTop);

          const subScrollHeight = await previewPage.evaluate(() => document.body.scrollHeight);
          if (subScrollHeight > 1000) {
            await previewPage.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.5 }));
            await previewPage.waitForTimeout(600);
            const fpMid = path.join(personaDir, `site-page-${slugify(linkText)}-mid.png`);
            await previewPage.screenshot({ path: fpMid, fullPage: false });
            screenshots.push(fpMid);

            await previewPage.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
            await previewPage.waitForTimeout(600);
            const fpBot = path.join(personaDir, `site-page-${slugify(linkText)}-bottom.png`);
            await previewPage.screenshot({ path: fpBot, fullPage: false });
            screenshots.push(fpBot);
          }

          log(persona, `Screenshotted sub-page: ${linkText}`);
        } catch (err) {
          log(persona, `Failed to navigate to sub-page ${i}: ${err}`);
        }
      }
    }
  } catch (err) {
    log(persona, `Direct preview inspection failed: ${err}`);
    screenshots.push(await fullPageScreenshot(page, personaDir, "builder-fallback"));
  } finally {
    await previewPage.close().catch(() => {});
  }

  return { screenshots, pageCount: navLinks.length + 1, navLinks };
}

// ---------------------------------------------------------------------------
// Persona runner
// ---------------------------------------------------------------------------

interface PersonaResult {
  persona: Persona;
  success: boolean;
  checks: EvalCheck[];
  suggestions: PromptSuggestion[];
  score: number;
  screenshots: string[];
  navLinks: string[];
  pageCount: number;
  durationMs: number;
  error: string | null;
  authenticated: boolean;
}

async function runPersona(
  browser: Browser,
  persona: Persona,
  baseOutDir: string,
): Promise<PersonaResult> {
  const personaDir = path.join(baseOutDir, `persona-${persona.id}-${slugify(persona.name)}`);
  if (!existsSync(personaDir)) mkdirSync(personaDir, { recursive: true });

  const start = Date.now();
  const screenshots: string[] = [];
  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "sv-SE",
      bypassCSP: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);

    // ── Step 0: Authenticate ──
    const authenticated = await authenticateViaApi(context, persona);

    // Log browser console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        log(persona, `[console.error] ${msg.text().slice(0, 200)}`);
      }
    });

    // ── Step 1: Navigate to landing page ──
    log(persona, "Navigating to landing page...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(5_000);

    // Check for error page and retry
    const hasError = await page.locator('text="Något gick fel"').isVisible().catch(() => false);
    if (hasError) {
      log(persona, "Error page detected, retrying...");
      const retryBtn = page.locator('button:has-text("Ladda om sidan")');
      if (await retryBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await retryBtn.click();
        await page.waitForTimeout(5_000);
      } else {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(5_000);
      }
    }

    await dismissOverlays(page);
    screenshots.push(await screenshot(page, personaDir, "step-01-landing"));

    // ── Step 2: Create project + prompt via API and navigate to builder ──
    log(persona, "Creating project via API...");
    screenshots.push(await screenshot(page, personaDir, "step-02-landing"));

    let buildResult: { ok: boolean; url?: string; error?: string } = { ok: false, error: "not attempted" };
    
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        log(persona, `Retrying project creation (attempt ${attempt + 1})...`);
        await page.waitForTimeout(5_000);
      }
      
      buildResult = await page.evaluate(async ({ description, baseUrl }) => {
        try {
          const projRes = await fetch(`${baseUrl}/api/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `Sajt - ${new Date().toLocaleDateString("sv-SE")}`,
              category: "starter_freeform",
              description: description.slice(0, 100),
            }),
            credentials: "include",
          });
          const projData = await projRes.json();
          if (!projData.success || !projData.project?.id) {
            return { ok: false, error: `Project creation failed: ${projData.error || projRes.status}` };
          }
          const projectId = projData.project.id;

          const promptRes = await fetch(`${baseUrl}/api/prompts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: description,
              source: "starter_freeform",
              projectId,
            }),
            credentials: "include",
          });
          const promptData = await promptRes.json();
          if (!promptRes.ok || !promptData.promptId) {
            return { ok: false, error: `Prompt save failed: ${promptData.error || promptRes.status}` };
          }

          const params = new URLSearchParams();
          params.set("project", projectId);
          params.set("buildMethod", "starter_freeform");
          params.set("buildIntent", "starter");
          params.set("promptId", promptData.promptId);
          return { ok: true, url: `/builder?${params.toString()}` };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      }, { description: persona.description, baseUrl: BASE_URL });

      if (buildResult.ok) break;
      log(persona, `Project creation attempt ${attempt + 1} failed: ${buildResult.error}`);
    }

    if (!buildResult.ok) {
      throw new Error(`Build setup failed after 3 attempts: ${buildResult.error}`);
    }

    log(persona, `Project created, navigating to builder: ${buildResult.url}`);
    await page.goto(`${BASE_URL}${buildResult.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    log(persona, `On builder page: ${page.url()}`);

    await page.waitForTimeout(5_000);
    await dismissOverlays(page);
    screenshots.push(await screenshot(page, personaDir, "step-03-builder-loaded"));

    // ── Step 2b: Type description in builder chat ──
    // The builder may not auto-start from promptId; type the description in chat
    const chatInput = page.locator('textarea[placeholder*="Skriv"], textarea[placeholder*="skriv"], textarea:visible').first();
    if (await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      log(persona, "Typing description in builder chat...");
      await chatInput.click();
      await page.waitForTimeout(300);
      await chatInput.type(persona.description, { delay: 10 });
      await page.waitForTimeout(500);
      
      // Click the send button
      const chatSendBtn = page.locator('button[aria-label="Skicka"], button:has(svg[class*="arrow"]), button:has(svg.lucide-arrow-up)').first();
      if (await chatSendBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await chatSendBtn.click({ force: true });
        log(persona, "Sent description in builder chat");
      } else {
        await chatInput.press("Enter");
        log(persona, "Pressed Enter in builder chat");
      }
      await page.waitForTimeout(3_000);
    } else {
      log(persona, "No chat input found — builder may have auto-started");
    }
    screenshots.push(await screenshot(page, personaDir, "step-03b-after-chat-send"));

    // ── Step 3: Handle onboarding popups ──
    log(persona, "Checking for onboarding popups...");
    await page.waitForTimeout(2_000);

    // Dismiss cookie banner again (may reappear after navigation)
    await dismissOverlays(page);

    // Mode picker: "Amatör" vs "Pro" — may appear right away or after navigation
    for (let modeAttempt = 0; modeAttempt < 3; modeAttempt++) {
      const modeHeading = page.locator('text="Hur van är du att bygga hemsidor?"');
      if (await modeHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const amateurBtn = page.locator('button:has(span:text("Amatör"))').first();
        if (await amateurBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await amateurBtn.click();
          log(persona, "Selected Amatör mode");
          await page.waitForTimeout(3_000);
          await dismissOverlays(page);
          break;
        }
      } else {
        break;
      }
      await page.waitForTimeout(1_000);
    }

    // Site type picker
    for (const siteType of persona.siteTypes) {
      const chip = page.locator(`button:has-text("${siteType}")`).first();
      if (await chip.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await chip.click();
        log(persona, `Selected site type: ${siteType}`);
        await page.waitForTimeout(500);
      }
    }
    const continueBtn1 = page.locator('button:has-text("Fortsätt")').first();
    if (await continueBtn1.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await continueBtn1.click();
      log(persona, "Clicked Fortsätt (site type)");
    }
    await page.waitForTimeout(2_000);
    screenshots.push(await screenshot(page, personaDir, "step-04-site-type"));

    // Template picker
    log(persona, "Checking for template picker...");
    await page.waitForTimeout(3_000);
    const templateCards = page.locator('.fixed button img, [class*="grid"] button img');
    if (await templateCards.count() > 0) {
      await templateCards.first().click();
      log(persona, "Selected first template");
      await page.waitForTimeout(1_000);
      const continueBtn2 = page.locator('button:has-text("Fortsätt")').first();
      if (await continueBtn2.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await continueBtn2.click();
        log(persona, "Clicked Fortsätt (template)");
      }
    } else {
      const skipTemplate = page.locator('button:has-text("Hoppa över")').first();
      if (await skipTemplate.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await skipTemplate.click();
        log(persona, "Skipped template picker");
      }
    }
    await page.waitForTimeout(2_000);
    screenshots.push(await screenshot(page, personaDir, "step-05-template"));

    // Must-have picker ("Vilka delar måste finnas med?")
    log(persona, "Checking for must-have picker...");
    await page.waitForTimeout(2_000);
    const mustHavePopup = page.locator('text="Vilka delar måste finnas med?"');
    if (await mustHavePopup.isVisible({ timeout: 5_000 }).catch(() => false)) {
      for (const mustHave of persona.mustHaves) {
        const chip = page.locator(`button:has-text("${mustHave}")`).first();
        if (await chip.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await chip.click();
          log(persona, `Selected must-have: ${mustHave}`);
          await page.waitForTimeout(300);
        }
      }
      // Click "Välj minst en" or "Fortsätt" to proceed
      const selectBtn = page.locator('button:has-text("Välj minst en"), button:has-text("Fortsätt")').first();
      if (await selectBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await selectBtn.click();
        log(persona, "Clicked continue (must-have)");
      } else {
        // Fallback: "Hoppa över" link
        const skipMH = page.locator('text="Hoppa över"').first();
        if (await skipMH.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await skipMH.click();
          log(persona, "Skipped must-have picker");
        }
      }
    }
    await page.waitForTimeout(2_000);
    screenshots.push(await screenshot(page, personaDir, "step-06-must-have"));

    // Image upload — skip  
    log(persona, "Checking for image upload...");
    await page.waitForTimeout(2_000);
    const skipImages = page.locator('button:has-text("Hoppa över"), button:has-text("Jag har inga bilder"), text="Hoppa över"').first();
    if (await skipImages.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipImages.click();
      log(persona, "Skipped image upload");
    }
    await page.waitForTimeout(2_000);

    // Dismiss any remaining popups
    await dismissOverlays(page);
    screenshots.push(await screenshot(page, personaDir, "step-07-after-popups"));

    // ── Step 3b: Handle wizard popup ("Berätta om ditt företag") ──
    log(persona, "Checking for wizard popup...");
    await page.waitForTimeout(2_000);
    const wizardPopup = page.locator('text="Berätta om ditt företag"');
    if (await wizardPopup.isVisible({ timeout: 5_000 }).catch(() => false)) {
      log(persona, "Wizard popup detected — filling in details...");
      
      // Step 1: Company name
      const companyInput = page.locator('input[placeholder*="företag"], input[placeholder*="projekt"]').first();
      if (await companyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const companyName = persona.business.split(" i ")[0] ?? persona.name;
        await companyInput.fill(companyName);
        log(persona, `Filled company name: ${companyName}`);
      }
      
      // Industry selection — try to find a matching category
      const industryMap: Record<string, string> = {
        "Frisörsalong": "Hälsa/Wellness",
        "IT-konsult": "Tech/IT-företag",
        "Restaurang": "Restaurang/Bar",
        "Bilverkstad": "Annat",
        "Yoga": "Hälsa/Wellness",
        "Advokat": "Konsult/Tjänster",
        "Second-hand": "Butik/Detaljhandel",
        "Taklägg": "Annat",
        "Influencer": "Kreativ byrå",
        "blogg": "Annat",
      };
      
      let industryClicked = false;
      for (const [keyword, category] of Object.entries(industryMap)) {
        if (persona.business.toLowerCase().includes(keyword.toLowerCase()) ||
            persona.description.toLowerCase().includes(keyword.toLowerCase())) {
          const catBtn = page.locator(`button:has-text("${category}"), [class*="rounded"]:has-text("${category}")`).first();
          if (await catBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await catBtn.click();
            log(persona, `Selected industry: ${category}`);
            industryClicked = true;
            break;
          }
        }
      }
      if (!industryClicked) {
        const annatBtn = page.locator('button:has-text("Annat"), [class*="rounded"]:has-text("Annat")').first();
        if (await annatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await annatBtn.click();
          log(persona, "Selected industry: Annat (fallback)");
        }
      }
      
      // Location
      const locationInput = page.locator('input[placeholder*="Stockholm"], input[placeholder*="Göteborg"]').first();
      if (await locationInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const city = persona.business.split(" i ").pop() ?? "";
        if (city) {
          await locationInput.fill(city);
          log(persona, `Filled location: ${city}`);
        }
      }
      
      // Existing website URL
      if (persona.existingUrl) {
        const urlInput = page.locator('input[placeholder*="dinhemsida"], input[placeholder*="hemsida"]').first();
        if (await urlInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await urlInput.fill(persona.existingUrl);
          log(persona, `Filled existing URL: ${persona.existingUrl}`);
        }
      }
      
      await page.waitForTimeout(1_000);
      screenshots.push(await screenshot(page, personaDir, "step-08-wizard-1"));
      
      // Click next/continue through wizard steps
      for (let step = 0; step < 5; step++) {
        const nextBtn = page.locator('button:has-text("Nästa"), button:has-text("Fortsätt"), button:has-text("Klar"), button:has-text("Starta"), button:has-text("Bygg")').first();
        if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await nextBtn.click({ force: true });
          log(persona, `Wizard step ${step + 1}: clicked next`);
          await page.waitForTimeout(3_000);
        } else {
          // Try closing wizard with X
          const closeBtn = page.locator('button:has(svg.lucide-x), button[aria-label="Stäng"]').first();
          if (await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await closeBtn.click();
            log(persona, "Closed wizard");
          }
          break;
        }
        
        // Check if wizard is still open
        const stillOpen = await page.locator('text="Berätta om ditt företag"').isVisible().catch(() => false);
        const step2 = await page.locator('text=/Steg [2-4]|Välj stil|Vilka funktioner|Sammanfattning/i').isVisible().catch(() => false);
        if (!stillOpen && !step2) {
          log(persona, "Wizard completed");
          break;
        }
      }
      
      await page.waitForTimeout(2_000);
    }

    // ── Step 3c: Handle pre-build chat questions ──
    const isOnBuilder = page.url().includes("/builder");
    if (!isOnBuilder) {
      log(persona, `WARNING: Not on builder page yet, URL: ${page.url()}`);
      throw new Error("Failed to navigate to builder page — submission may have failed");
    }
    log(persona, `On builder page: ${page.url()}`);
    log(persona, "Handling pre-build questions...");
    for (let q = 0; q < 8; q++) {
      await page.waitForTimeout(3_000);

      const progressVisible = await page.locator('[class*="progress"], [class*="Progress"]').isVisible().catch(() => false);
      const generatingText = await page.locator('text="Bygger din sajt"').isVisible().catch(() => false);
      const doneText = await page.locator('text="Din hemsida är klar"').isVisible().catch(() => false);
      if (progressVisible || generatingText || doneText) {
        log(persona, "Generation started, moving to wait phase");
        break;
      }

      const hasIframe = await page.locator("iframe").count() > 0;
      if (hasIframe) {
        try {
          const bodyText = await page.frameLocator("iframe").first().locator("body").innerText({ timeout: 3_000 });
          if (bodyText && bodyText.trim().split(/\s+/).length > 20) {
            log(persona, "Preview already loaded, skipping to evaluation");
            break;
          }
        } catch { /* iframe not ready */ }
      }

      const answered = await handleClarifyingQuestions(page, persona);
      if (answered) {
        log(persona, `Answered pre-build question ${q + 1}`);
        await page.waitForTimeout(2_000);
      } else {
        if (persona.existingUrl) {
          const urlInput = page.locator('input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="hemsida"]');
          if (await urlInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await urlInput.fill(persona.existingUrl);
            await page.keyboard.press("Enter");
            log(persona, `Entered existing URL: ${persona.existingUrl}`);
            await page.waitForTimeout(3_000);
            continue;
          }
        }
        break;
      }
    }

    screenshots.push(await screenshot(page, personaDir, "step-08-pre-generation"));

    // ── Step 4: Wait for generation ──
    const genSuccess = await waitForGeneration(page, persona, personaDir);
    screenshots.push(await screenshot(page, personaDir, "step-09-generation-done"));

    if (!genSuccess) {
      return {
        persona,
        success: false,
        checks: [],
        suggestions: [],
        score: 0,
        screenshots,
        navLinks: [],
        pageCount: 0,
        durationMs: Date.now() - start,
        error: "Generation timed out or blocked",
        authenticated,
      };
    }

    // ── Step 5: Deep site inspection — scroll all pages, take screenshots ──
    log(persona, "Starting deep site inspection...");
    await page.waitForTimeout(3_000);
    const inspection = await inspectGeneratedSite(page, persona, personaDir);
    screenshots.push(...inspection.screenshots);

    // ── Step 6: Evaluate ──
    log(persona, "Evaluating preview...");
    const { checks, suggestions } = await evaluatePreview(page);
    const passed = checks.filter((c) => c.passed).length;
    const score = checks.length > 0 ? passed / checks.length : 0;
    log(persona, `Score: ${(score * 100).toFixed(0)}% (${passed}/${checks.length} checks)`);
    if (suggestions.length > 0) {
      log(persona, `Prompt suggestions: ${suggestions.length}`);
      for (const s of suggestions) {
        log(persona, `  → [${s.area}] ${s.suggestion}`);
      }
    }

    // ── Step 7: Follow-up changes (skip if textarea is disabled) ──
    for (let i = 0; i < persona.followUps.length; i++) {
      const change = persona.followUps[i]!;
      log(persona, `Follow-up ${i + 1}: "${change}"`);

      // Wait for textarea to become enabled (max 30s)
      let textareaReady = false;
      for (let w = 0; w < 6; w++) {
        const ta = page.locator('textarea:visible').first();
        if (await ta.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const isDisabled = await ta.isDisabled().catch(() => true);
          if (!isDisabled) {
            textareaReady = true;
            break;
          }
        }
        await page.waitForTimeout(5_000);
      }
      
      if (!textareaReady) {
        log(persona, "Chat textarea still disabled — skipping follow-up");
        continue;
      }

      const chatExpandBtn = page.locator('button[aria-label="Öppna chatten"]');
      if (await chatExpandBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await chatExpandBtn.click();
        await page.waitForTimeout(1_000);
      }

      try {
        await typeInChat(page, change);
        log(persona, "Follow-up sent, waiting for update...");

        await page.waitForTimeout(5_000);
        const updateDone = await waitForGeneration(page, persona, personaDir);
        if (updateDone) {
          screenshots.push(await screenshot(page, personaDir, `step-20-followup-${i + 1}-done`));

          const followupInspection = await inspectGeneratedSite(page, persona, personaDir);
          screenshots.push(...followupInspection.screenshots.slice(0, 3));
        }
      } catch (e) {
        log(persona, `Follow-up failed: ${e}`);
      }
    }

    // ── Step 8: Final screenshot ──
    screenshots.push(await screenshot(page, personaDir, "step-99-final"));

    // Write evaluation
    writeFileSync(
      path.join(personaDir, "evaluation.json"),
      JSON.stringify({
        persona: persona.name,
        business: persona.business,
        authenticated,
        checks,
        suggestions,
        score,
        pageCount: inspection.pageCount,
        navLinks: inspection.navLinks,
        screenshots,
      }, null, 2),
      "utf-8",
    );

    // Write markdown report
    const reportLines = [
      `# Persona ${persona.id}: ${persona.name}`,
      "",
      `**Business:** ${persona.business}`,
      `**Knowledge:** ${persona.knowledge}`,
      `**Authenticated:** ${authenticated ? "Yes" : "No (guest)"}`,
      `**Duration:** ${Math.round((Date.now() - start) / 1000)}s`,
      `**Score:** ${(score * 100).toFixed(0)}%`,
      `**Pages found:** ${inspection.pageCount}`,
      "",
      "## Navigation links",
      "",
      ...(inspection.navLinks.length > 0
        ? inspection.navLinks.map((l) => `- ${l}`)
        : ["_No navigation links found_"]),
      "",
      "## Quality Checks",
      "",
      ...checks.map((c) => `- ${c.passed ? "✅" : "❌"} **${c.name}**: ${c.detail}`),
      "",
      "## Prompt Improvement Suggestions",
      "",
      ...(suggestions.length > 0
        ? suggestions.map((s) => `- **[${s.area}]** ${s.current}\n  → _${s.suggestion}_`)
        : ["_No improvements needed — prompt performed well_"]),
      "",
      "## Screenshots",
      "",
      ...screenshots.map((s) => `- ![${path.basename(s)}](${path.basename(s)})`),
    ];
    writeFileSync(path.join(personaDir, "report.md"), reportLines.join("\n"), "utf-8");

    // Write plain-text feedback file
    const feedbackLines = [
      `FEEDBACK — Persona ${persona.id}: ${persona.name}`,
      `Företag: ${persona.business}`,
      `Poäng: ${(score * 100).toFixed(0)}% (${checks.filter(c => c.passed).length}/${checks.length} checks)`,
      `Sidor: ${inspection.pageCount}`,
      `Tid: ${Math.round((Date.now() - start) / 1000)}s`,
      "",
      "=== KVALITETSKONTROLL ===",
      ...checks.map((c) => `${c.passed ? "OK" : "FEL"} | ${c.name}: ${c.detail}`),
      "",
      "=== NAVIGATION ===",
      ...(inspection.navLinks.length > 0
        ? inspection.navLinks.map((l) => `  ${l}`)
        : ["  Inga navigeringslänkar hittades"]),
      "",
      "=== FÖRBÄTTRINGSFÖRSLAG ===",
      ...(suggestions.length > 0
        ? suggestions.map((s) => `  [${s.area}] ${s.current}\n  → ${s.suggestion}`)
        : ["  Inga förbättringar behövs — prompten fungerade bra"]),
      "",
      "=== SAMMANFATTNING ===",
      checks.every(c => c.passed)
        ? `Sajten för "${persona.business}" klarade alla kvalitetskontroller. Prompten fungerar bra.`
        : `Sajten för "${persona.business}" hade ${checks.filter(c => !c.passed).length} problem:\n${checks.filter(c => !c.passed).map(c => `  - ${c.name}: ${c.detail}`).join("\n")}`,
      "",
      suggestions.length > 0
        ? "REKOMMENDERADE PROMPTÄNDRINGAR:\n" + suggestions.map((s, i) => `  ${i + 1}. ${s.suggestion}`).join("\n")
        : "",
    ].filter(Boolean);
    writeFileSync(path.join(personaDir, "feedback.txt"), feedbackLines.join("\n"), "utf-8");

    return {
      persona,
      success: true,
      checks,
      suggestions,
      score,
      screenshots,
      navLinks: inspection.navLinks,
      pageCount: inspection.pageCount,
      durationMs: Date.now() - start,
      error: null,
      authenticated,
    };
  } catch (err) {
    const error = String(err);
    log(persona, `FATAL: ${error}`);
    try {
      screenshots.push(await screenshot(context?.pages()[0] ?? (await browser.newPage()), personaDir, "fatal-error"));
    } catch { /* can't screenshot */ }
    return {
      persona,
      success: false,
      checks: [],
      suggestions: [],
      score: 0,
      screenshots: screenshots.filter(Boolean),
      navLinks: [],
      pageCount: 0,
      durationMs: Date.now() - start,
      error,
      authenticated: false,
    };
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Aggregate report
// ---------------------------------------------------------------------------

function writeAggregateReport(results: PersonaResult[], outDir: string) {
  const total = results.length;
  const successful = results.filter((r) => r.success).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / total;

  const lines = [
    "# Browser QA Autoloop — Aggregate Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Personas tested:** ${total}`,
    `**Successful:** ${successful}/${total}`,
    `**Average score:** ${(avgScore * 100).toFixed(0)}%`,
    `**Total duration:** ${Math.round(results.reduce((s, r) => s + r.durationMs, 0) / 60_000)} min`,
    `**Pause between personas:** ${PAUSE_BETWEEN_PERSONAS_MS / 1000}s`,
    "",
    "## Per-persona results",
    "",
    "| # | Name | Business | Score | Pages | Duration | Status |",
    "|---|------|----------|-------|-------|----------|--------|",
    ...results.map(
      (r) =>
        `| ${r.persona.id} | ${r.persona.name} | ${r.persona.business} | ${(r.score * 100).toFixed(0)}% | ${r.pageCount} | ${Math.round(r.durationMs / 1000)}s | ${r.success ? "✅" : "❌"} |`,
    ),
    "",
    "## Check summary",
    "",
  ];

  const checkCounts = new Map<string, { pass: number; fail: number }>();
  for (const r of results) {
    for (const c of r.checks) {
      const entry = checkCounts.get(c.name) ?? { pass: 0, fail: 0 };
      if (c.passed) entry.pass++;
      else entry.fail++;
      checkCounts.set(c.name, entry);
    }
  }

  lines.push("| Check | Pass | Fail |");
  lines.push("|-------|------|------|");
  for (const [name, counts] of checkCounts) {
    lines.push(`| ${name} | ${counts.pass} | ${counts.fail} |`);
  }

  // Aggregate prompt suggestions
  const allSuggestions = results.flatMap((r) => r.suggestions);
  if (allSuggestions.length > 0) {
    const byArea = new Map<string, PromptSuggestion[]>();
    for (const s of allSuggestions) {
      const list = byArea.get(s.area) ?? [];
      list.push(s);
      byArea.set(s.area, list);
    }

    lines.push("");
    lines.push("## Prompt Improvement Patterns");
    lines.push("");
    for (const [area, suggestions] of byArea) {
      lines.push(`### ${area} (${suggestions.length} occurrences)`);
      const unique = [...new Set(suggestions.map((s) => s.suggestion))];
      for (const u of unique) {
        lines.push(`- ${u}`);
      }
      lines.push("");
    }
  }

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    for (const r of failures) {
      lines.push(`- **${r.persona.name}**: ${r.error ?? "Unknown error"}`);
    }
  }

  writeFileSync(path.join(outDir, "aggregate-report.md"), lines.join("\n"), "utf-8");

  // Write aggregate feedback.txt
  const okResults = results.filter((r) => r.success);
  const fbLines = [
    "SAJTMASKIN QA — SAMMANFATTNING",
    `Datum: ${new Date().toISOString().slice(0, 10)}`,
    `Personas: ${results.length}`,
    `Lyckade: ${okResults.length}/${results.length}`,
    `Snittpoäng: ${okResults.length > 0 ? Math.round(okResults.reduce((a, r) => a + r.score, 0) / okResults.length * 100) : 0}%`,
    `Total tid: ${Math.round(results.reduce((a, r) => a + r.durationMs, 0) / 60_000)} min`,
    "",
    "=== PER PERSONA ===",
    ...results.map(r =>
      `${r.success ? "OK" : "FEL"} | ${r.persona.name} (${r.persona.business}) — ${(r.score * 100).toFixed(0)}%, ${r.pageCount} sidor${r.error ? `, FEL: ${r.error}` : ""}`
    ),
    "",
    "=== ALLA FÖRBÄTTRINGSFÖRSLAG ===",
    ...(okResults.flatMap(r => r.suggestions).length > 0
      ? [...new Set(okResults.flatMap(r => r.suggestions.map(s => `[${s.area}] ${s.suggestion}`)))].map((s, i) => `  ${i + 1}. ${s}`)
      : ["  Inga förbättringsförslag — alla prompts fungerade bra"]),
    "",
    "=== VANLIGASTE FELEN ===",
    ...(okResults.flatMap(r => r.checks.filter(c => !c.passed)).length > 0
      ? Object.entries(
          okResults.flatMap(r => r.checks.filter(c => !c.passed)).reduce((acc, c) => {
            acc[c.name] = (acc[c.name] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).sort((a, b) => b[1] - a[1]).map(([name, count]) => `  ${name}: ${count} personas`)
      : ["  Inga fel — alla checks passerade"]),
    "",
    failures.length > 0 ? "=== MISSLYCKADE PERSONAS ===" : "",
    ...failures.map(r => `  ${r.persona.name}: ${r.error ?? "Okänt fel"}`),
  ].filter(Boolean);
  writeFileSync(path.join(outDir, "feedback.txt"), fbLines.join("\n"), "utf-8");

  writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(
      results.map((r) => ({
        personaId: r.persona.id,
        name: r.persona.name,
        business: r.persona.business,
        score: r.score,
        success: r.success,
        pageCount: r.pageCount,
        navLinks: r.navLinks,
        suggestionsCount: r.suggestions.length,
        durationMs: r.durationMs,
        checksTotal: r.checks.length,
        checksPassed: r.checks.filter((c) => c.passed).length,
        error: r.error,
        authenticated: r.authenticated,
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let personaCount = 10;
  let personaId: number | null = null;
  let headful = false;
  let noPause = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--personas") personaCount = parseInt(args[++i]!, 10);
    if (args[i] === "--persona-id") personaId = parseInt(args[++i]!, 10);
    if (args[i] === "--headful") headful = true;
    if (args[i] === "--no-pause") noPause = true;
  }

  return { personaCount, personaId, headful, noPause };
}

async function main() {
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
  const outDir = path.join(process.cwd(), "output", "qa-browser-runs", ts);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const hasAuth = !!(process.env.QA_EMAIL && process.env.QA_PASSWORD);

  console.log("\n=== Browser QA Autoloop ===");
  console.log(`Personas: ${personas.length}`);
  console.log(`Output: ${outDir}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth: ${hasAuth ? process.env.QA_EMAIL : "guest (no QA_EMAIL set)"}`);
  console.log(`Headful: ${config.headful}`);
  console.log(`Pause between: ${config.noPause ? "disabled" : `${PAUSE_BETWEEN_PERSONAS_MS / 1000}s`}`);
  console.log(`Generation timeout: ${GENERATION_TIMEOUT_MS / 60_000} min`);
  console.log("");

  const browser = await chromium.launch({ headless: !config.headful });

  // Ensure browser is closed on process exit to avoid orphaned chromium processes
  const cleanup = async () => {
    try { await browser.close(); } catch { /* already closed */ }
    process.exit(1);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("uncaughtException", async (err) => {
    console.error("Uncaught exception:", err);
    await cleanup();
  });

  const results: PersonaResult[] = [];

  for (let idx = 0; idx < personas.length; idx++) {
    const persona = personas[idx]!;
    console.log(`\n${"─".repeat(60)}`);
    log(persona, `Starting (${persona.business})... [${idx + 1}/${personas.length}]`);

    const result = await runPersona(browser, persona, outDir);
    results.push(result);
    log(persona, `Done — ${result.success ? "OK" : "FAIL"} — Score: ${(result.score * 100).toFixed(0)}% — Pages: ${result.pageCount}`);

    // Pause between personas to avoid rate limiting
    if (!config.noPause && idx < personas.length - 1) {
      const pauseSec = PAUSE_BETWEEN_PERSONAS_MS / 1000;
      log(persona, `Pausing ${pauseSec}s before next persona to avoid rate limits...`);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_PERSONAS_MS));
    }
  }

  await browser.close();

  writeAggregateReport(results, outDir);

  console.log(`\n${"=".repeat(60)}`);
  console.log("COMPLETE");
  console.log(`Personas: ${results.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`Average score: ${(results.reduce((s, r) => s + r.score, 0) / results.length * 100).toFixed(0)}%`);
  console.log(`Total pages discovered: ${results.reduce((s, r) => s + r.pageCount, 0)}`);
  console.log(`Total prompt suggestions: ${results.reduce((s, r) => s + r.suggestions.length, 0)}`);
  console.log(`Output: ${outDir}`);
  console.log(`${"=".repeat(60)}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
