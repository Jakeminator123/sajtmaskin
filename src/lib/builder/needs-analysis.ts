import type { TemplateCatalogItem } from "@/lib/templates/template-catalog";
import {
  getTemplatesByCategory,
  getTemplateCategoryTitle,
  TEMPLATES,
} from "@/lib/templates/template-data";
import type { ChatMessage } from "@/lib/builder/types";

export type NeedsAnalysisField =
  | "siteType"
  | "offer"
  | "existingSite"
  | "goal"
  | "audience"
  | "mustHave"
  | "style"
  | "images"
  | "businessDetails"
  | "brandIdentity"
  | "servicesProducts"
  | "categorySpecific"
  | "cta"
  | "features"
  | "siteMedia";

export type SiteTypeKey =
  | "business"
  | "ecommerce"
  | "portfolio"
  | "restaurant"
  | "landing"
  | "blog"
  | "other";

export const SITE_TYPE_LABELS: Record<SiteTypeKey, string> = {
  business: "Företag / Tjänster",
  ecommerce: "Webshop",
  portfolio: "Portfolio",
  restaurant: "Restaurang",
  landing: "Landningssida",
  blog: "Blogg",
  other: "Annat",
};

const SITE_TYPE_SEARCH_QUERIES: Record<SiteTypeKey, string> = {
  business: "business company services website",
  ecommerce: "ecommerce shop store products",
  portfolio: "portfolio showcase creative",
  restaurant: "restaurant food menu booking",
  landing: "landing page marketing product launch",
  blog: "blog articles content",
  other: "website template",
};

const SITE_TYPE_CATEGORY_FALLBACK: Record<SiteTypeKey, string> = {
  business: "website-templates",
  ecommerce: "website-templates",
  portfolio: "blog-and-portfolio",
  restaurant: "website-templates",
  landing: "layouts",
  blog: "blog-and-portfolio",
  other: "website-templates",
};

export function getSiteTypeSearchQuery(siteType: SiteTypeKey): string {
  return SITE_TYPE_SEARCH_QUERIES[siteType];
}

export function getSiteTypeCategoryFallback(siteType: SiteTypeKey): string {
  return SITE_TYPE_CATEGORY_FALLBACK[siteType];
}

export function detectSiteTypeFromText(text: string): SiteTypeKey | null {
  const lower = text.toLowerCase();
  if (/webshop|webbshop|e-handel|produkter.*sälj|nätbutik|webbutik/.test(lower)) return "ecommerce";
  if (/restaurang|café|cafe|meny.*boka|matställe/.test(lower)) return "restaurant";
  if (/portfolio|fotograf|designer|kreativ.*arbete|showcase/.test(lower)) return "portfolio";
  if (/blogg|artiklar|skriva.*innehåll/.test(lower)) return "blog";
  if (/landningssida|landing|lansering|kampanj/.test(lower)) return "landing";
  if (/företag|foretag|byrå|byra|tjänst|tjanst|konsult|firma/.test(lower)) return "business";
  return null;
}

type QuestionConfig = {
  field: NeedsAnalysisField;
  question: string;
  options: string[];
  followUp: string;
};

export type NeedsAnalysisState = {
  answeredFields: NeedsAnalysisField[];
  missingFields: NeedsAnalysisField[];
  ready: boolean;
  nextField: NeedsAnalysisField | null;
  completionRatio: number;
};

const QUESTION_ORDER: QuestionConfig[] = [
  {
    field: "siteType",
    question: "Vilken typ av sajt vill du bygga?",
    followUp: "Välj den typ som passar bäst — det hjälper mig hitta rätt design åt dig.",
    options: ["Företag / Tjänster", "Webshop", "Portfolio", "Restaurang", "Landningssida", "Blogg"],
  },
  {
    field: "offer",
    question: "Vad erbjuder du, eller vad handlar idén om?",
    followUp: "Kan du berätta lite mer? Till exempel: driver du en byrå, säljer du produkter, eller är det ett eget projekt?",
    options: ["Tjänster", "Produkter", "Portfolio", "Hjälp mig formulera det"],
  },
  {
    field: "existingSite",
    question: "Har du en befintlig hemsida vi ska utgå från? Klistra in din URL så analyserar jag layout, tonalitet och innehåll.",
    followUp: "Om du har en befintlig sajt, klistra in URL:en så tar jag hänsyn till den. Annars välj 'Börja från noll'.",
    options: ["Börja från noll"],
  },
  {
    field: "goal",
    question: "Vad ska sajten främst hjälpa dig att få till?",
    followUp: "Vad skulle vara det bästa som kan hända när någon besöker din sajt?",
    options: ["Få fler kunder att boka tid", "Sälja produkter direkt", "Bygga förtroende", "Samla leads"],
  },
  {
    field: "audience",
    question: "Vilka besöker din sajt?",
    followUp: "Tänk på dina bästa kunder — beskriv gärna ålder, kön eller bransch.",
    options: ["Privatpersoner", "Företag / B2B", "Kvinnor 30–55 år", "Unga vuxna 18–35 år", "Lokala kunder", "Alla målgrupper"],
  },
  {
    field: "mustHave",
    question: "Vilka delar måste finnas med direkt från start?",
    followUp: "Tänk på vad en besökare behöver se direkt.",
    options: ["Kontaktformulär", "Priser och paket", "Bildgalleri", "Bokning online"],
  },
];

export const QUESTION_SUGGESTIONS: Record<NeedsAnalysisField, string[]> = {
  siteType: [
    "Företag / Tjänster",
    "Webshop",
    "Portfolio",
    "Restaurang",
    "Landningssida",
    "Blogg",
  ],
  offer: [
    "Jag driver en frisörsalong",
    "Jag säljer handgjorda smycken online",
    "Jag är konsult inom marknadsföring",
    "Vi har en restaurang med catering",
    "Jag är fotograf och filmare",
    "Vi bygger en ny app",
  ],
  existingSite: [
    "Nej, börja från noll",
    "Vi har en WordPress-sajt idag",
    "Vi har bara sociala medier",
    "Ja, vi har en enkel sida",
  ],
  goal: [
    "Få fler kunder att boka tid",
    "Sälja produkter direkt",
    "Bygga förtroende",
    "Samla leads",
    "Lansera en ny tjänst",
    "Öka synligheten lokalt",
  ],
  audience: [
    "Privatpersoner",
    "Företag / B2B",
    "Kvinnor 30–55 år",
    "Unga vuxna 18–35 år",
    "Lokala kunder",
    "Alla målgrupper",
    "Föräldrar med barn",
    "Män 25–45 år",
  ],
  mustHave: [
    "Kontaktformulär",
    "Priser och paket",
    "Bildgalleri",
    "Bokning online",
    "Kundrecensioner",
    "Om oss-sida",
  ],
  style: [
    "Rent och modernt",
    "Varmt och personligt",
    "Mörkt och lyxigt",
    "Ljust och minimalistiskt",
    "Skandinavisk och stilren",
    "Lekfullt med mycket färg",
  ],
  images: [],
};

const FIELD_LABELS: Record<NeedsAnalysisField, string> = {
  siteType: "Sajttyp",
  offer: "Erbjudande eller idé",
  existingSite: "Befintlig hemsida",
  goal: "Huvudmål",
  audience: "Målgrupp",
  mustHave: "Måste finnas med",
  style: "Stil och känsla",
  images: "Uppladdade bilder",
};

const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+/i;

const FIELD_PATTERNS: Record<NeedsAnalysisField, RegExp> = {
  siteType:
    /(företag|foretag|tjänst|tjanst|webshop|webbshop|e-handel|nätbutik|natbutik|webbutik|portfolio|restaurang|café|cafe|landningssida|landing|blogg|hemsida|sajt|webbplats|vård|vard|klinik|fastighet|mäklare|maklare|salong|skönhet|skonhet|gym|tränare|tranare|bygg|hantverk|konsult|byrå|byra|utbildning|skola|event|bröllop|brollop|förening|forening|ideell|musik|artist|hotell|boende|juridik|advokat|ekonomi|redovisning|tech|startup|bil\b|motor|resa|turism|mat\b|catering|foto|video|annat)/i,
  existingSite:
    /https?:\/\/[^\s]+|www\.[^\s]+|(börja från noll|borja fran noll|ingen hemsida|ingen sajt|ny sajt|helt nytt|har ingen|finns ingen|wordpress|squarespace|sociala medier|^nej\b|^nope\b|^inte?\b|ingen url|har inte)/i,
  offer:
    /(företag|foretag|byrå|byra|studio|salong|restaurang|app|produkt|tjänst|tjanst|tjänster|tjanster|produkter|portfolio|konsult|coaching|frisör|frisor|fotograf|advokat|fastighet|e-handel|smycken|handgjord|filmare|catering|driver en|säljer|saljer)/i,
  goal:
    /(boka|bokning|leads?|offert|köp|kop|sälj|salj|sälja|salja|kontakt|konverter|förtroende|fortroende|visa upp|lansera|få fler|fa fler|driva trafik|synlighet|synlig|kunder|intresse|varumärke|varumarke|trafik|nå ut|na ut|växa|vaxa|marknadsför|marknadsfora)/i,
  audience:
    /(privatperson|företag|foretag|kund|kunder|besökare|besokare|målgrupp|malgrupp|föräldrar|foraldrar|brudpar|patienter|medlemmar|studenter|team|bolag|b2b|entreprenör|entreprenor|vuxna|unga|lokala|alla åldrar|alla aldrar|småföretag|smaforetag|kvinnor|män|man|alla målgrupper|alla malgrupper|\d{2}[\-–]\d{2}\s*år)/i,
  mustHave:
    /(kontakt|formulär|formular|pris|paket|referenser|case|meny|om oss|om mig|faq|blogg|galleri|portfolio|bokning|cta|sektion|sidor?|omdömen|recension|bildgalleri|telefon)/i,
  style:
    /(modern|minimal|minimalist|lyx|premium|elegant|lekfull|varm|personlig|mörk|mork|ljus|färg|farg|stil|design|känsla|kansla|clean|sofistikerad|skandinavisk|stilren|professionell|inbjudande)/i,
  images: /(?!)/,
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getUserMessages(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => normalizeText(message.content))
    .filter(Boolean);
}

function getRawUserMessages(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
}

function getAskedFields(messages: ChatMessage[]): NeedsAnalysisField[] {
  return messages
    .flatMap((message) => message.uiParts ?? [])
    .map((part) => {
      if (part.type !== "tool:awaiting-input") return null;
      if (part.kind !== "needs-analysis") return null;
      if (typeof part.analysisField !== "string") return null;
      return QUESTION_ORDER.some((entry) => entry.field === part.analysisField)
        ? (part.analysisField as NeedsAnalysisField)
        : null;
    })
    .filter((value): value is NeedsAnalysisField => Boolean(value));
}

function getEvidenceForField(
  field: NeedsAnalysisField,
  userMessages: string[],
  rawUserMessages?: string[],
): string | null {
  if (field === "existingSite" && rawUserMessages) {
    const rawMatch = rawUserMessages.find((msg) => URL_PATTERN.test(msg));
    if (rawMatch) return rawMatch;
  }
  const matched = userMessages.find((message) => FIELD_PATTERNS[field].test(message));
  if (matched) return matched;
  if (field === "offer") {
    const intro = userMessages[0];
    return intro && intro.split(" ").filter(Boolean).length >= 4 ? intro : null;
  }
  return null;
}

function countFieldAsks(field: NeedsAnalysisField, askedFields: NeedsAnalysisField[]): number {
  return askedFields.filter((f) => f === field).length;
}

function getLastAskedField(askedFields: NeedsAnalysisField[]): NeedsAnalysisField | null {
  return askedFields.length > 0 ? askedFields[askedFields.length - 1]! : null;
}

const MAX_FOLLOW_UPS_PER_FIELD = 1;

function getNextQuestion(missingFields: NeedsAnalysisField[], askedFields: NeedsAnalysisField[]) {
  for (const question of QUESTION_ORDER) {
    if (!missingFields.includes(question.field)) continue;
    if (askedFields.includes(question.field)) continue;
    return question;
  }
  return QUESTION_ORDER.find((question) => {
    if (!missingFields.includes(question.field)) return false;
    return countFieldAsks(question.field, askedFields) <= MAX_FOLLOW_UPS_PER_FIELD;
  }) ?? null;
}

function createNeedsAnalysisMessage(question: QuestionConfig, prefix: string, useFollowUp = false): ChatMessage {
  const questionText = useFollowUp ? question.followUp : question.question;
  return {
    id: `needs-analysis-${question.field}-${Date.now()}`,
    role: "assistant",
    content: `${prefix}\n\n${questionText}`,
    isHelpMessage: true,
    uiParts: [
      {
        type: "tool:awaiting-input",
        toolName: "Behovsanalys",
        toolCallId: `needs-analysis:${question.field}`,
        state: "input-available",
        kind: "needs-analysis",
        analysisField: question.field,
        output: {
          question: questionText,
          options: question.options,
          kind: "needs-analysis",
          analysisField: question.field,
          awaitingInput: true,
        },
      },
    ],
  };
}

export function getCurrentQuestionField(messages: ChatMessage[]): NeedsAnalysisField | null {
  const askedFields = getAskedFields(messages);
  return getLastAskedField(askedFields);
}

export function deriveNeedsAnalysisState(messages: ChatMessage[]): NeedsAnalysisState {
  const userMessages = getUserMessages(messages);
  const rawUserMessages = getRawUserMessages(messages);
  const askedFields = getAskedFields(messages);

  const answeredFields = QUESTION_ORDER.filter(({ field }) => {
    if (getEvidenceForField(field, userMessages, rawUserMessages)) return true;
    return countFieldAsks(field, askedFields) > MAX_FOLLOW_UPS_PER_FIELD + 1;
  }).map(({ field }) => field);

  const missingFields = QUESTION_ORDER.filter(({ field }) => !answeredFields.includes(field)).map(
    ({ field }) => field,
  );
  const nextField = getNextQuestion(missingFields, askedFields)?.field ?? null;

  return {
    answeredFields,
    missingFields,
    ready: missingFields.length === 0,
    nextField,
    completionRatio: answeredFields.length / QUESTION_ORDER.length,
  };
}

export function isNeedsAnalysisMessage(message: ChatMessage): boolean {
  return Boolean(
    message.isHelpMessage &&
      message.uiParts?.some(
        (part) => part.type === "tool:awaiting-input" && part.kind === "needs-analysis",
      ),
  );
}

export function isNeedsAnalysisActive(messages: ChatMessage[], chatId: string | null): boolean {
  return !chatId && messages.some(isNeedsAnalysisMessage);
}

export function buildSeedNeedsAnalysisMessages(initialPrompt: string): ChatMessage[] {
  const seedUserMessage: ChatMessage = {
    id: `entry-user-${Date.now()}`,
    role: "user",
    content: initialPrompt.trim(),
  };
  const state = deriveNeedsAnalysisState([seedUserMessage]);
  const nextQuestion = getNextQuestion(state.missingFields, []);

  if (!nextQuestion) {
    return [seedUserMessage];
  }

  return [
    seedUserMessage,
    createNeedsAnalysisMessage(
      nextQuestion,
      "Tack! Jag behöver bara ett par snabba svar innan jag börjar bygga.",
    ),
  ];
}

const FOLLOW_UP_PREFIXES = [
  "Ingen stress — jag frågar bara för att bygga rätt.",
  "Helt okej. Låt mig formulera om det lite.",
  "Inga konstigheter, jag vill bara förstå dig bättre.",
];

export function buildNextNeedsAnalysisMessage(messages: ChatMessage[]): ChatMessage | null {
  const state = deriveNeedsAnalysisState(messages);
  if (state.ready) return null;

  const askedFields = getAskedFields(messages);
  const lastAsked = getLastAskedField(askedFields);

  if (lastAsked && state.missingFields.includes(lastAsked)) {
    const timesAsked = countFieldAsks(lastAsked, askedFields);
    if (timesAsked <= MAX_FOLLOW_UPS_PER_FIELD) {
      const question = QUESTION_ORDER.find((q) => q.field === lastAsked);
      if (question) {
        const prefix = FOLLOW_UP_PREFIXES[timesAsked % FOLLOW_UP_PREFIXES.length]!;
        return createNeedsAnalysisMessage(question, prefix, true);
      }
    }
  }

  const nextQuestion = getNextQuestion(state.missingFields, askedFields);
  if (!nextQuestion) return null;

  const prefix =
    state.completionRatio >= 0.7
      ? "Nästan klart — en sista sak."
      : state.completionRatio >= 0.4
        ? "Bra, det börjar ta form. En fråga till."
        : "Tack! Då kör vi vidare.";

  return createNeedsAnalysisMessage(nextQuestion, prefix);
}

export function extractUrlFromMessages(messages: ChatMessage[]): string | null {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const match = msg.content.match(URL_PATTERN);
    if (match) {
      let url = match[0];
      if (!url.startsWith("http")) url = `https://${url}`;
      return url;
    }
  }
  return null;
}

export function isExistingSiteField(field: NeedsAnalysisField | null): boolean {
  return field === "existingSite";
}

export type ScrapeResult = {
  title: string;
  description: string;
  headings: string[];
  wordCount: number;
  hasImages: boolean;
  textSummary: string;
};

export function buildScrapingMessage(): ChatMessage {
  return {
    id: `scraping-progress-${Date.now()}`,
    role: "assistant",
    content: "Jag analyserar din hemsida nu — layout, tonalitet och innehåll. Håll ut en liten stund!",
    isHelpMessage: true,
    uiParts: [
      {
        type: "tool:awaiting-input",
        toolName: "Webbanalys",
        toolCallId: `scrape:progress`,
        state: "loading",
        kind: "scrape-progress",
        output: {
          kind: "scrape-progress",
          awaitingInput: false,
        },
      },
    ],
  };
}

export function buildScrapeCompleteMessage(data: ScrapeResult): ChatMessage {
  const parts = [
    `Klart! Jag har analyserat sajten.`,
    data.title ? `**${data.title}**` : null,
    data.description || null,
    `${data.wordCount} ord, ${data.headings.length} rubriker${data.hasImages ? ", bilder hittade" : ""}.`,
    "Jag tar hänsyn till detta när jag bygger. Vi kör vidare!",
  ].filter(Boolean);

  return {
    id: `scrape-done-${Date.now()}`,
    role: "assistant",
    content: parts.join("\n\n"),
    isHelpMessage: true,
  };
}

export function buildScrapeFailedMessage(): ChatMessage {
  return {
    id: `scrape-failed-${Date.now()}`,
    role: "assistant",
    content: "Jag kunde tyvärr inte nå den sidan just nu, men det gör inget — vi kör vidare ändå!",
    isHelpMessage: true,
  };
}

export interface SelectedTemplateInfo {
  title: string;
  category: string;
  viewUrl?: string;
}

export interface UploadedMediaInfo {
  filename: string;
  mimeType: string;
  url: string;
  purpose?: string;
  context?: string;
}

function buildPageStructure(mustHave: string | null, siteType: string | null, features?: string | null): string[] {
  const pages: string[] = [];
  const mh = mustHave?.toLowerCase() ?? "";
  const st = siteType?.toLowerCase() ?? "";
  const ft = features?.toLowerCase() ?? "";

  const has = (keyword: string) => mh.includes(keyword.toLowerCase()) || ft.includes(keyword.toLowerCase());
  const isRestaurant = st.includes("restaurang") || st.includes("café");
  const isEcommerce = st.includes("webshop") || st.includes("e-handel");
  const isPortfolio = st.includes("portfolio");
  const isSalon = st.includes("salong") || st.includes("skönhet");
  const isHotel = st.includes("hotell") || st.includes("boende");

  pages.push(
    "### Startsida (`app/page.tsx`)",
    "VIKTIGT: Startsidan ska vara rik och komplett med MINST 6 sektioner:",
    "1. Hero — DESIGN: full-bleed bakgrundsbild med mörk gradient-overlay (from-black/60 to-black/30) ELLER en djärv gradient (from-slate-900 via-primary/20 to-slate-800). Min-höjd min-h-[70vh]. Stor rubrik (text-5xl lg:text-6xl font-bold tracking-tight), underrubrik (text-xl text-white/80), primär CTA-knapp (rounded-full px-8 py-3 text-lg).",
    isRestaurant
      ? "2. Meny-höjdpunkter — DESIGN: 3-4 kort med rounded-2xl, shadow-lg, hover:-translate-y-1. Varje kort: bild, namn, kort beskrivning, pris. Bg-muted/50 sektionsbakgrund."
      : isEcommerce
        ? "2. Utvalda produkter — DESIGN: 3-4 produktkort med rounded-2xl, shadow-lg, hover:shadow-2xl transition-all. Varje kort: produktbild (aspect-square), namn, pris, 'Köp'-knapp. Grid med gap-8."
        : isSalon
          ? "2. Populära behandlingar — DESIGN: 3-4 kort med rounded-2xl, p-8, shadow-lg, hover:-translate-y-1. Varje kort: ikon/bild, namn, tid, pris, 'Boka'-knapp. Bg-muted/30 sektion."
          : "2. Tjänster/erbjudanden — DESIGN: 3-4 kort med rounded-2xl, p-8, shadow-lg, hover:-translate-y-1 hover:shadow-2xl transition-all. Varje kort: ikon (bg-primary/10 rounded-xl p-3), rubrik, 2-3 meningars beskrivning.",
    "3. Om oss-preview — DESIGN: Split-layout (bild vänster, text höger) eller text med stämningsfull bakgrundsbild. 3-4 meningar, 'Läs mer'-länk till /om-oss. Bg-background sektion med py-24.",
    "4. Socialt bevis — DESIGN: Kort med bg-card, rounded-2xl, p-8, citat-tecken (text-6xl text-primary/20), kundnamn/roll i kursiv. 2-3 unika, varierade svenska namn och roller. Bg-muted/30 sektionsbakgrund.",
    "5. CTA-banner — DESIGN: Kontrasterande bakgrund (bg-primary eller gradient from-primary to-primary/80). Stor vit text (text-3xl font-bold text-primary-foreground), framträdande vit knapp. Py-20.",
    "6. Kontakt-footer — DESIGN: Mörk bakgrund (bg-slate-900 eller bg-background), flerkols-grid, logotyp, kontaktinfo, sociala ikoner med hover-effekt, copyright.",
    "",
    "VARJE sektion ovan ska ha minst 2-3 meningars text. Hero ska ha minst rubrik + underrubrik + CTA.",
  );

  if (has("om oss") || has("om mig") || !has("landningssida")) {
    pages.push(
      "",
      "### Om oss (`app/om-oss/page.tsx`)",
      "VIKTIGT: Denna sida ska ha RIKTIGT innehåll, inte bara en rubrik!",
      "1. Page-hero — DESIGN: Subtil gradient-bakgrund (from-muted/50 to-background), rubrik 'Om oss' (text-4xl lg:text-5xl), 1-2 meningars intro. Py-20.",
      "2. Vår historia — DESIGN: Split-layout med bild till höger om möjligt. 5-8 meningar. Generös padding py-16.",
      "3. Värderingar — DESIGN: 3 kort i grid (md:grid-cols-3 gap-8), varje med ikon (bg-primary/10 rounded-xl p-4), rubrik, 2-3 meningar. Rounded-2xl shadow-md.",
      "4. Teamet — DESIGN: Kort med porträttbild (rounded-full), namn, roll, kort bio. Grid md:grid-cols-2 lg:grid-cols-3.",
      "5. CTA — DESIGN: Kontrasterande bakgrund, stor text, framträdande knapp. Samma stil som startsidans CTA-banner.",
    );
  }

  if (isRestaurant || has("meny") || has("matsedel")) {
    pages.push(
      "",
      "### Meny (`app/meny/page.tsx`)",
      "VIKTIGT: Fyll med RIKTIGA rätter om de finns i underlaget, annars trovärdiga exempel.",
      "1. Page-hero — DESIGN: Stämningsfull bakgrundsbild med overlay, rubrik 'Vår meny' (text-4xl). Py-20.",
      "2. Menykategorier — DESIGN: Sektioner med bg-muted/30 och bg-background omväxlande. Rubrik per kategori (text-2xl font-semibold border-b pb-2).",
      "3. Varje rätt: namn (font-semibold), kort beskrivning (text-muted-foreground), pris (font-bold text-right). Flex justify-between. Minst 3-4 per kategori.",
      "4. Allergiinfo eller dietfilter om relevant",
      "5. CTA — DESIGN: Kontrasterande sektion, 'Boka bord' eller 'Beställ' i stor knapp.",
    );
  }

  if (isEcommerce || has("webshop") || has("produkt")) {
    pages.push(
      "",
      "### Produkter (`app/produkter/page.tsx`)",
      "VIKTIGT: Visa RIKTIGA produkter om de finns i underlaget, annars trovärdiga exempel.",
      "1. Page-hero — DESIGN: Gradient-bakgrund eller subtil bild, rubrik 'Våra produkter' (text-4xl). Py-20.",
      "2. Produktgrid — DESIGN: grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8. Minst 6 produktkort.",
      "3. Varje kort: DESIGN: rounded-2xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all. Produktbild (aspect-square), namn, pris (text-lg font-bold), beskrivning, 'Lägg i varukorg'-knapp (bg-primary).",
      "4. Filterkategorier om relevant",
    );
  }

  if (isSalon || has("behandling")) {
    pages.push(
      "",
      "### Behandlingar (`app/behandlingar/page.tsx`)",
      "1. Page-hero — rubrik 'Våra behandlingar' + kort intro",
      "2. Behandlingslista — varje behandling med namn, beskrivning (2-3 meningar), tid, pris",
      "3. Minst 4-5 behandlingar. Använd data från underlaget om det finns",
      "4. CTA — 'Boka tid'",
    );
  }

  if (has("pris") || has("paket")) {
    pages.push(
      "",
      "### Priser (`app/priser/page.tsx`)",
      "1. Page-hero — rubrik 'Priser' + kort intro",
      "2. Prispaket — 2-3 nivåer i kolumner med namn, pris, lista på vad som ingår (checkmarks)",
      "3. CTA-knapp under varje paket",
      "4. FAQ om priser — 3-4 vanliga frågor",
    );
  }

  if (has("galleri") || has("portfolio") || has("case") || isPortfolio) {
    pages.push(
      "",
      "### Galleri / Portfolio (`app/galleri/page.tsx`)",
      "1. Page-hero — rubrik 'Våra projekt' eller 'Galleri'",
      "2. Bildrutnät — responsivt grid (2-3 kolumner), minst 6-8 bilder/projekt",
      "3. Varje projekt: bild, titel, kort beskrivning, eventuellt kategori",
      "4. Filterkategorier om relevant",
    );
  }

  if (has("bokning") || has("boka")) {
    pages.push(
      "",
      "### Boka tid (`app/boka/page.tsx`)",
      "1. Page-hero — rubrik 'Boka tid' + kort beskrivning",
      "2. Bokningsformulär — namn, e-post, telefon, datum, tid, tjänst/behandling (dropdown), meddelande",
      "3. Kontaktinfo bredvid formuläret",
      "4. Bekräftelsevy efter submit",
    );
  }

  if (has("blogg") || has("nyheter")) {
    pages.push(
      "",
      "### Blogg (`app/blogg/page.tsx`)",
      "1. Page-hero — rubrik 'Blogg' eller 'Nyheter'",
      "2. Artikelgrid — 3-4 artiklar med bild, rubrik, datum, kort utdrag",
      "3. Läs mer-länk per artikel",
      "4. Artikelvy (`app/blogg/[slug]/page.tsx`) med fullständig layout",
    );
  }

  if (has("faq")) {
    pages.push(
      "",
      "### FAQ (`app/faq/page.tsx`)",
      "1. Page-hero — rubrik 'Vanliga frågor'",
      "2. Accordion med minst 6-8 frågor och svar. Relevanta för branschen",
      "3. CTA — 'Kontakta oss om du har fler frågor'",
    );
  }

  if (has("team") || has("vårt team")) {
    pages.push(
      "",
      "### Teamet (`app/teamet/page.tsx`)",
      "1. Page-hero — rubrik 'Vårt team'",
      "2. Teamgrid — kort per person med bild/placeholder, namn, roll, kort bio (2-3 meningar)",
      "3. Minst 3-4 teammedlemmar",
    );
  }

  if (has("nyhetsbrev")) {
    pages.push(
      "",
      "### (Inkludera nyhetsbrev i footern och/eller startsidan)",
      "- Nyhetsbrev signup-formulär med e-postfält och 'Prenumerera'-knapp",
      "- Kort text om vad man får: 'Få nyheter och erbjudanden direkt i din inbox'",
    );
  }

  if (isHotel || has("rum") || has("boende")) {
    pages.push(
      "",
      "### Rum / Boende (`app/rum/page.tsx`)",
      "1. Page-hero — rubrik 'Våra rum' eller 'Boende'",
      "2. Rumskort — bild, rumstyp, kort beskrivning, pris per natt, 'Boka'-knapp",
      "3. Faciliteter — ikoner med WiFi, parkering, pool etc.",
      "4. Check-in/check-out-tider",
    );
  }

  if (has("karta") || has("hitta hit")) {
    pages.push(
      "",
      "### (Inkludera karta i kontaktsidan)",
      "- Google Maps-embed eller statisk karta med markör",
      "- Adress, vägbeskrivning, parkering",
    );
  }

  // Feature-specific modules
  if (ft.includes("login") || ft.includes("inloggning")) {
    pages.push(
      "",
      "### (Inkludera inloggning/registrering)",
      "- Login-sida med e-post + lösenord, 'Glömt lösenord'-länk",
      "- Registreringssida med namn, e-post, lösenord, bekräfta lösenord",
      "- Skyddade sidor som kräver inloggning (t.ex. mina sidor, orderhistorik)",
    );
  }

  if (ft.includes("sök") || ft.includes("search")) {
    pages.push(
      "",
      "### (Inkludera sökfunktion)",
      "- Sökfält i headern med ikonen (förstoringsglas)",
      "- Sökresultatsida med relevanta resultat",
    );
  }

  if (ft.includes("mörkt") || ft.includes("dark")) {
    pages.push(
      "",
      "### (Inkludera mörkt läge)",
      "- Tema-switch-knapp i headern (sol/måne-ikon)",
      "- Alla färger via CSS-variabler som stödjer ljust/mörkt",
    );
  }

  if (ft.includes("chatt") || ft.includes("support") || ft.includes("live-chat")) {
    pages.push(
      "",
      "### (Inkludera chattwidget)",
      "- Fast chattbubbla i nedre högra hörnet",
      "- Klicka för att öppna chattfönster med namn, e-post, meddelande",
    );
  }

  if (ft.includes("cookie")) {
    pages.push(
      "",
      "### (Inkludera cookie-banner)",
      "- GDPR-kompatibel banner i botten med 'Acceptera' och 'Inställningar'",
      "- Sparar samtycke i localStorage",
    );
  }

  if (ft.includes("checkout") || ft.includes("varukorg") || ft.includes("cart")) {
    pages.push(
      "",
      "### Varukorg & Checkout (`app/varukorg/page.tsx`)",
      "1. Varukorgssida — lista med produkter, antal, pris, ta bort, totalsumma",
      "2. Checkout-formulär — leveransadress, betalningssätt, bekräftelse",
    );
  }

  if (ft.includes("flerspråk") || ft.includes("multi-lang")) {
    pages.push(
      "",
      "### (Flerspråkig sajt)",
      "- Språkväljare i headern (svenska/engelska)",
      "- Alla texter ska kunna översättas via locale-filer eller liknande",
    );
  }

  pages.push(
    "",
    "### Kontakt (`app/kontakt/page.tsx`)",
    "VIKTIGT: Denna sida ska ha RIKTIGT innehåll, inte bara en rubrik!",
    "1. Page-hero — DESIGN: Subtil gradient eller muted bakgrund. Rubrik 'Kontakta oss' (text-4xl). Py-20.",
    "2. Kontaktformulär — DESIGN: bg-card rounded-2xl shadow-lg p-8. Input-fält med rounded-lg, submit-knapp bg-primary rounded-full px-8.",
    "3. Direktkontaktinfo — DESIGN: Bredvid formuläret (md:grid-cols-2). Ikoner (Mail, Phone, MapPin) med bg-primary/10 rounded-xl p-3.",
    isRestaurant ? "4. Öppettider i tydlig tabell" : "4. Besöksadress med eventuell karta",
    "5. Sociala medier-ikoner/länkar",
  );

  pages.push(
    "",
    "### KRITISK REGEL FÖR ALLA UNDERSIDOR",
    "- VARJE sida ovan MÅSTE ha VERKLIGT innehåll med MINST 3-4 sektioner.",
    "- Det är FÖRBJUDET att skapa en sida som bara har en rubrik, en ikon och 'Tillbaka till startsidan'.",
    "- Om innehåll saknas i underlaget: skriv trovärdigt, branschanpassat exempelinnehåll på svenska.",
    "- Alla sidor ska ha en komplett layout: hero, innehåll, CTA och footer.",
    "- Använd samma header/footer/navigation på ALLA sidor via layout.tsx.",
  );

  return pages;
}

function extractCompanyName(userMessages: string[]): string | null {
  for (const msg of userMessages) {
    const match = msg.match(/(?:heter|kallas|företag(?:et)?|salon(?:g(?:en)?)?|restaurang(?:en)?|butik(?:en)?|byrå(?:n)?)\s+["']?([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ &]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractLocation(userMessages: string[]): string | null {
  const cities = ["stockholm", "göteborg", "malmö", "uppsala", "västerås", "örebro", "linköping", "helsingborg", "jönköping", "norrköping", "lund", "umeå", "gävle", "borås", "sundsvall", "eskilstuna", "karlstad", "växjö", "halmstad", "luleå", "trollhättan"];
  const joined = userMessages.join(" ").toLowerCase();
  for (const city of cities) {
    if (joined.includes(city)) {
      return city.charAt(0).toUpperCase() + city.slice(1);
    }
  }
  const match = joined.match(/\bi\s+([A-ZÅÄÖ][a-zåäö]+(?:\s[A-ZÅÄÖ][a-zåäö]+)?)/);
  if (match?.[1]) return match[1];
  return null;
}

const WIZARD_FIELD_LABELS: Record<string, string> = {
  siteType: "Sajttyp / Bransch",
  offer: "Verksamhetsbeskrivning",
  existingSite: "Befintlig hemsida",
  businessDetails: "Företagsuppgifter",
  brandIdentity: "Varumärke och stil",
  servicesProducts: "Tjänster och erbjudande",
  categorySpecific: "Branschspecifik information",
  audience: "Målgrupp",
  cta: "Primär call-to-action (CTA)",
  goal: "Mål med sajten",
  mustHave: "Valda sidor och funktioner",
  siteMedia: "Uppladdade bilder/videos",
  features: "Valda moduler och funktioner",
};

function extractWizardSections(messages: ChatMessage[]): string[] {
  const sections: string[] = [];
  const wizardMessages = messages.filter((m) => m.id?.startsWith("wizard-"));
  for (const msg of wizardMessages) {
    const fieldMatch = msg.id?.match(/^wizard-(\w+)-/);
    if (!fieldMatch) continue;
    const field = fieldMatch[1];
    const label = WIZARD_FIELD_LABELS[field];
    if (!label) continue;
    sections.push("", `## ${label}`, ...msg.content.split("\n").map((l) => `- ${l}`));
  }
  return sections;
}

export function buildNeedsAnalysisPrompt(
  messages: ChatMessage[],
  scrapeData?: ScrapeResult | null,
  selectedTemplates?: SelectedTemplateInfo[] | null,
  uploadedMedia?: UploadedMediaInfo[] | null,
  companyBrief?: Record<string, unknown> | null,
): string {
  const userMessages = getUserMessages(messages);
  const rawUserMessages = getRawUserMessages(messages);
  const wizardMessages = messages.filter((m) => m.id?.startsWith("wizard-"));
  const summary = QUESTION_ORDER.map(({ field }) => {
    const evidence = getEvidenceForField(field, userMessages, rawUserMessages);
    if (evidence) return `- ${FIELD_LABELS[field]}: ${evidence}`;
    const wizardEvidence = wizardMessages.find((m) => m.id?.includes(`-${field}-`));
    if (wizardEvidence?.content) {
      const short = wizardEvidence.content.slice(0, 300);
      return `- ${FIELD_LABELS[field]}: ${short}`;
    }
    return `- ${FIELD_LABELS[field]}: (Se wizardsektioner nedan)`;
  });

  const wizardSections = extractWizardSections(messages);

  const templateSection =
    selectedTemplates && selectedTemplates.length > 0
      ? [
          "",
          "## Designpreferenser (baserat på mallar användaren gillade visuellt)",
          "",
          "Användaren valde följande mallar som visuell inspiration:",
          ...selectedTemplates.map(
            (t) =>
              `- "${t.title}" (kategori: ${t.category})${t.viewUrl ? ` — referens: ${t.viewUrl}` : ""}`,
          ),
          "",
          "### Instruktioner för designanalys",
          "Analysera de valda mallarna som en helhet och extrahera gemensamma designmönster:",
          "- **Färgpalett**: Vilken typ av färger och kontraster föredrar användaren? (ljust/mörkt, monokromt, färgglatt)",
          "- **Layout**: Vilken typ av struktur? (hero-centrerat, rutnät, asymmetriskt, minimalistiskt)",
          "- **Typografi**: Vilken känsla? (modern sans-serif, elegant serif, lekfull, strikt)",
          "- **Visuell tyngd**: Bildtungt, texttungt eller balanserat?",
          "- **Stämning**: Professionell, kreativ, lekfull, lyxig, tech-fokuserad?",
          "",
          "OBS: Dessa mallar är INTE tekniska byggstenar. De representerar användarens smak och estetiska preferens.",
          "Bygg sajten helt fritt men låt ALLA designbeslut (färgval, spacing, typografi, bildhantering, sektionsupplägg)",
          "genomsyras av den estetik och känsla som de valda mallarna signalerar tillsammans.",
        ]
      : [];

  const scrapedSection = scrapeData
    ? [
        "",
        "## Analyserad befintlig hemsida",
        `- Titel: ${scrapeData.title || "–"}`,
        `- Beskrivning: ${scrapeData.description || "–"}`,
        `- Rubriker: ${scrapeData.headings.slice(0, 10).join(", ") || "–"}`,
        `- Ordmängd: ${scrapeData.wordCount}`,
        `- Bilder: ${scrapeData.hasImages ? "Ja" : "Nej"}`,
        scrapeData.textSummary ? `- Sammanfattning: ${scrapeData.textSummary.slice(0, 500)}` : null,
        "",
        "Ta hänsyn till befintlig layout, tonalitet och innehåll ovan. Behåll det som fungerar bra och förbättra resten.",
      ].filter(Boolean)
    : [];

  const brandLogos = uploadedMedia?.filter((m) => m.purpose === "brand-logo") ?? [];
  const ownMedia = uploadedMedia?.filter((m) => m.purpose !== "design-reference" && m.purpose !== "brand-logo") ?? [];
  const inspirationMedia = uploadedMedia?.filter((m) => m.purpose === "design-reference") ?? [];

  const logoSection =
    brandLogos.length > 0
      ? [
          "",
          "## KRITISKT: Logotyp",
          "",
          "Användaren har laddat upp sin logotyp. Den MÅSTE användas — INTE text som logotyp.",
          "",
          "### OBLIGATORISKT:",
          `1. **Header/navbar**: <Image src="${brandLogos[0]!.url}" /> vänsterställd, h-8 till h-10`,
          `2. **Footer**: <Image src="${brandLogos[0]!.url}" /> i footerns övre del, h-6 till h-8`,
          "3. Använd `next/image` med exakt den URL som anges nedan.",
          "4. Lägg INTE logotypen som hero-bakgrund eller dekorativt element.",
          "",
          ...brandLogos.map((m) => `- Logotyp-URL att använda: src="${m.url}" (${m.filename})`),
        ]
      : [];

  const ownMediaSection =
    ownMedia.length > 0
      ? [
          "",
          "## KRITISKT: Användarens egna bilder och videos",
          "",
          `Användaren har laddat upp ${ownMedia.length} egna filer. DESSA MÅSTE ANVÄNDAS PÅ SAJTEN.`,
          "",
          "### OBLIGATORISKA REGLER",
          "1. ANVÄND VARJE BILD NEDAN som `<Image src=\"URL\" />` i koden — DIREKT med URL:en som anges.",
          "2. ANVÄND ALDRIG Unsplash eller placeholder för bilder som kan ersättas av dessa.",
          "3. Om du har fler bilder än platser — skapa en bildgalleri-sektion eller bildgrid.",
          "",
          "### Placeringsregler",
          "- **Personalbilder / porträtt** → 'Om oss' eller teamsektion",
          "- **Produktbilder** → produktkort, hero, feature-grid",
          "- **Lokalbild / fasad / interiör** → hero-bakgrund, kontakt, galleri",
          "- **Mat / rätter** → meny-sektion, galleri",
          "- **Generell verksamhetsbild** → hero eller relevant sektion",
          "- **Video (mp4/webm)** → bakgrundsvideo i hero eller videosektion",
          "",
          "### Bilder att använda (kopiera URL:erna exakt som src):",
          ...ownMedia.map(
            (m) => `- ${m.filename} (${m.mimeType.startsWith("video/") ? "video" : "bild"})${m.context ? ` [${m.context}]` : ""} → src="${m.url}"`,
          ),
        ]
      : [];

  const inspirationSection =
    inspirationMedia.length > 0
      ? [
          "",
          "## Designinspiration (skärmdumpar från användaren)",
          "",
          `Användaren har laddat upp ${inspirationMedia.length} skärmdumpar/bilder som designinspiration.`,
          "Dessa ska INTE placeras på sajten. Analysera dem istället för att extrahera:",
          "- **Färgpalett** — vilka färger och kontraster dominerar?",
          "- **Layoutstruktur** — hero-centrerat, rutnät, asymmetriskt, single-page?",
          "- **Typografi** — modern sans-serif, elegant serif, lekfull, strikt?",
          "- **Visuell tyngd** — bildtungt, texttungt, whitespace-rikt?",
          "- **Stämning** — professionell, kreativ, lekfull, lyxig, tech?",
          "",
          "Bygg sajten så att den KÄNNS som inspirationsbilderna — samma typ av layout, färgkänsla,",
          "typografistil och visuella rytm. Kopiera INTE innehåll, bara stil och känsla.",
          "",
          "Inspirationsfiler:",
          ...inspirationMedia.map(
            (m) => `- ${m.filename} — ${m.url}`,
          ),
        ]
      : [];

  const mediaSection = [...logoSection, ...ownMediaSection, ...inspirationSection];

  const mustHaveEvidence = getEvidenceForField("mustHave", userMessages, rawUserMessages);
  const siteTypeEvidence = getEvidenceForField("siteType", userMessages, rawUserMessages);
  const offerEvidence = getEvidenceForField("offer", userMessages, rawUserMessages);

  const companyBriefSection: string[] = [];
  if (companyBrief && typeof companyBrief === "object") {
    // Support both old flat keys (description, industry, etc.) and canonical Brief schema
    // (brandName, oneSentencePitch, toneAndVoice, visualDirection, etc.)
    const str = (key: string) => typeof companyBrief[key] === "string" ? (companyBrief[key] as string).trim() : "";

    const desc = str("description") || str("oneSentencePitch");
    const brand = str("brandName");
    const industry = str("industry");
    const target = str("targetAudience");
    const cta = str("primaryCallToAction");

    const toneRaw = companyBrief.toneAndVoice;
    const tone = str("tone") || (Array.isArray(toneRaw) ? (toneRaw as string[]).join(", ") : "");

    const services = str("services");

    const vd = companyBrief.visualDirection as Record<string, unknown> | undefined;
    const colorPalette = vd?.colorPalette as Record<string, string> | undefined;
    const typography = vd?.typography as Record<string, string> | undefined;

    const hasBriefData = desc || brand || industry || tone || services || target || cta;
    if (hasBriefData) {
      companyBriefSection.push("", "## Företagsprofil (automatiskt analyserad)");
      if (brand) companyBriefSection.push(`- Varumärke: ${brand}`);
      if (desc) companyBriefSection.push(`- Verksamhet: ${desc.slice(0, 500)}`);
      if (industry) companyBriefSection.push(`- Bransch: ${industry}`);
      if (services) companyBriefSection.push(`- Tjänster/Produkter: ${services.slice(0, 300)}`);
      if (target) companyBriefSection.push(`- Målgrupp: ${target}`);
      if (cta) companyBriefSection.push(`- Primär CTA: ${cta}`);
      if (tone) companyBriefSection.push(`- Ton/Stil: ${tone}`);
      if (colorPalette) {
        const colors = Object.entries(colorPalette).map(([k, v]) => `${k}: ${v}`).join(", ");
        companyBriefSection.push(`- Färgpalett: ${colors}`);
      }
      if (typography) {
        const fonts = Object.entries(typography).map(([k, v]) => `${k}: ${v}`).join(", ");
        companyBriefSection.push(`- Typografi: ${fonts}`);
      }
      companyBriefSection.push("", "Använd denna företagsprofil för att anpassa tonalitet, innehåll och struktur.");
    }
  }

  const featuresEvidence = (() => {
    const featMsg = messages.find((m) => m.id?.startsWith("wizard-features-"));
    return featMsg?.content ?? null;
  })();
  const pageStructure = buildPageStructure(mustHaveEvidence, siteTypeEvidence, featuresEvidence);

  const companyName = extractCompanyName(userMessages);
  const location = extractLocation(userMessages);

  return [
    "## Starter intake",
    "Använd underlaget nedan när du bygger den första versionen.",
    "",
    "## Sammanfattad behovsanalys",
    ...summary,
    ...templateSection,
    ...scrapedSection,
    ...companyBriefSection,
    ...wizardSections,
    ...mediaSection,
    "",
    "## Användarens egna formuleringar",
    ...userMessages.map((message, index) => `${index + 1}. ${message}`),
    "",
    "## Sidstruktur",
    "Bygg följande sidor med dessa sektioner:",
    "",
    ...pageStructure,
    "",
    "## Designkvalitet",
    "Sajten ska ha HÖG visuell kvalitet — inte en enkel wireframe. Följ dessa krav:",
    "",
    "### Visuell rikedom",
    "- **Gradienter**: Använd subtila bakgrundsgradienter (t.ex. from-slate-900 to-slate-800) istället för platta enfärger",
    "- **Skuggor**: Kort med `shadow-lg` eller `shadow-xl`, hover-effekt med `hover:shadow-2xl hover:-translate-y-1 transition-all`",
    "- **Spacing**: Generös vertikal padding mellan sektioner (py-20 till py-32). Aldrig trångt.",
    "- **Typografisk hierarki**: Stor rubrik (text-5xl/6xl), tydlig underrubrik (text-xl), brödtext (text-lg med text-muted-foreground)",
    "- **Kontrast**: Växla mellan ljusa och mörka sektioner för visuell rytm",
    "",
    "### Sektionsdesign",
    "- **Hero**: Full-bleed bakgrundsbild ELLER gradient med overlay. Rubrik, underrubrik, 1-2 CTA-knappar. Minst 60vh höjd.",
    "- **Kort/features**: Rundade hörn (rounded-2xl), padding (p-8), hover-animation, ikon eller bild",
    "- **CTA-banners**: Kontrasterande bakgrundsfärg, stor text, tydlig knapp med hover-effekt",
    "- **Footer**: Flerkols-layout, logotyp, kontaktinfo, sociala ikoner, copyright",
    "",
    "### Animationer och interaktivitet",
    "- Hover-effekter på ALLA knappar och kort (scale, shadow, color shift)",
    "- Subtila övergångar: `transition-all duration-300`",
    "- Knappar: `hover:scale-105` eller `hover:brightness-110`",
    "",
    "## Instruktion",
    "- KRITISKT: Generera MINST startsidan + 2 undersidor (t.ex. Om oss, Kontakt) i FÖRSTA svaret. Skapa ALDRIG bara en sida.",
    "- Bygg ALLA sidor som listas ovan. Varje sida ska ha en komplett layout med header, innehåll och footer.",
    "- KRITISKT: Det är FÖRBJUDET att skapa undersidor som bara visar en rubrik/ikon och 'Tillbaka till startsidan'. VARJE sida MÅSTE ha MINST 3-4 sektioner med RIKTIGT innehåll.",
    "- Om specifikt innehåll saknas i underlaget: skriv trovärdigt, branschanpassat exempelinnehåll på svenska. Det är bättre med bra exempeltext än tomma sidor.",
    "- Alla sidor ska dela samma header/footer via layout.tsx — skapa INTE separata headers/footers per sida.",
    "- Ta trygga designbeslut. Prioritera tydlig struktur och ett starkt första intryck.",
    "",
    "## Heading-hierarki och bildhantering",
    "- Exakt EN `<h1>` per sida. Aldrig fler.",
    "- Headings i strikt hierarki: h1 → h2 → h3. Hoppa aldrig över nivåer.",
    "- Alla bilder via `next/image` med `alt`-text på svenska.",
    "- Hero-bilder: `priority` och `fill` eller explicit bredd/höjd. Övriga: lazy loading (default).",
    "- Footer: logotyp (om uppladdad), kontaktinfo, öppettider (om relevant), sociala medier-ikoner, copyright-text.",
    "",
    "## SEO-metadata",
    `- title: "${companyName ? `${companyName} — ${offerEvidence || ""}` : "Företagsnamn — Beskrivning"}${location ? ` i ${location}` : ""}" (anpassa per sida)`,
    "- description: 150-160 tecken, på svenska, som sammanfattar sidans innehåll.",
    "- keywords: relevanta svenska sökord som `string[]` — ALDRIG `as const`.",
    "- Open Graph: title och description på svenska.",
    "",
    "## Språk och ton (svenska)",
    "All text ska vara på svenska (å, ä, ö). Inga emojis. Inga engelska placeholder.",
    "Skriv riktiga stycken (2-3 meningar). Autentiska svenska namn och adresser.",
    "Navigation: Hem, Om oss, Tjänster, Kontakt, Priser. Knappar: Kom igång, Läs mer, Kontakta oss, Boka tid.",
    "Telefonnummer: 070-123 45 67. Adress: Storgatan 12, 411 38 Göteborg.",
    `Footer-copyright: "© ${new Date().getFullYear()} Företagsnamn" (INTE "All rights reserved").`,
    "Metadata-arrayer: ALDRIG `as const` — TypeScript kräver mutable `string[]`.",
    ...(uploadedMedia && uploadedMedia.length > 0
      ? ["Använd de uppladdade bilderna/videos på logiskt rätt plats enligt placeringsreglerna ovan."]
      : []),
  ].join("\n");
}

export type TemplatePickerItem = {
  id: string;
  title: string;
  category: string;
  previewImageUrl: string;
};

const PICKER_TARGET = 18;

function padWithRandomTemplates(
  items: TemplatePickerItem[],
  target: number,
): TemplatePickerItem[] {
  if (items.length >= target) return items;
  const seenIds = new Set(items.map((i) => i.id));
  const pool = TEMPLATES.filter((t) => !seenIds.has(t.id) && t.previewImageUrl);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const t of shuffled) {
    if (items.length >= target) break;
    items.push({
      id: t.id,
      title: t.title,
      category: getTemplateCategoryTitle(t),
      previewImageUrl: t.previewImageUrl,
    });
  }
  return items;
}

export async function searchTemplatesForPicker(
  userPrompt: string,
  siteType: SiteTypeKey,
): Promise<TemplatePickerItem[]> {
  const searchQuery = `${userPrompt} ${getSiteTypeSearchQuery(siteType)}`.trim();

  try {
    const res = await fetch("/api/templates/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: searchQuery, topK: PICKER_TARGET }),
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.results) && data.results.length > 0) {
        const items: TemplatePickerItem[] = data.results
          .slice(0, PICKER_TARGET)
          .map((r: { template: TemplateCatalogItem }) => ({
            id: r.template.id,
            title: r.template.title,
            category: r.template.category,
            previewImageUrl: r.template.previewImageUrl,
          }));
        return padWithRandomTemplates(items, PICKER_TARGET);
      }
    }
  } catch {
    // Fall through to category fallback
  }

  const categoryId = getSiteTypeCategoryFallback(siteType);
  const templates = getTemplatesByCategory(categoryId);
  const shuffled = [...templates].sort(() => Math.random() - 0.5);
  const items: TemplatePickerItem[] = shuffled.slice(0, PICKER_TARGET).map((t) => ({
    id: t.id,
    title: t.title,
    category: getTemplateCategoryTitle(t),
    previewImageUrl: t.previewImageUrl,
  }));
  return padWithRandomTemplates(items, PICKER_TARGET);
}

export function chipToSiteType(chipLabel: string): SiteTypeKey {
  const lower = chipLabel.toLowerCase().trim();
  if (lower.includes("webshop") || lower.includes("e-handel")) return "ecommerce";
  if (lower.includes("portfolio")) return "portfolio";
  if (lower.includes("restaurang") || lower.includes("café") || lower.includes("cafe")) return "restaurant";
  if (lower.includes("landningssida") || lower.includes("landing")) return "landing";
  if (lower.includes("blogg")) return "blog";
  if (lower.includes("företag") || lower.includes("tjänst")) return "business";
  return "other";
}
