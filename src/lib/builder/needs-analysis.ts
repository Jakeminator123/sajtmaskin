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
  // Extended wizard sections (structured text blocks that enrich the brief prompt)
  | "businessDetails"
  | "brandIdentity"
  | "servicesProducts"
  | "categorySpecific"
  | "companyStory"
  | "cta"
  | "features"
  | "siteMedia"
  | "avoid"
  | "imagery";

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
  {
    field: "cta",
    question: "Vad ska besökaren göra när de är på sajten?",
    followUp: "Tänk på en enda viktigaste handling — boka, kontakta, köpa, registrera sig.",
    options: ["Boka tid", "Kontakta oss", "Köp nu", "Begär offert", "Registrera sig"],
  },
  {
    field: "style",
    question: "Vilken känsla ska sajten ha?",
    followUp: "Hur vill du att första intrycket ska kännas — rent, lekfullt, lyxigt, varmt?",
    options: ["Rent och modernt", "Varmt och personligt", "Mörkt och lyxigt", "Ljust och minimalistiskt"],
  },
  {
    field: "images",
    question: "Har du egna bilder vi ska använda — logotyp, produktbilder eller miljöer?",
    followUp: "Du kan hoppa över och låta AI:n välja passande bilder.",
    options: ["Ja, jag har logotyp", "Ja, jag har produktbilder", "Inga egna bilder just nu"],
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
  cta: [
    "Boka tid",
    "Kontakta oss",
    "Köp nu",
    "Begär offert",
    "Registrera sig",
    "Ring oss",
  ],
  avoid: [
    "Inga stockbilder",
    "Ingen video i hero",
    "Inga popup-rutor",
    "Inget cookie-banner-buller",
  ],
  imagery: [
    "Realistiska foton",
    "Illustrationer",
    "Abstrakta grafiker",
    "Minimal stil",
    "Mörk och stämningsfull",
    "Ljus och luftig",
  ],
  businessDetails: [],
  brandIdentity: [],
  servicesProducts: [],
  categorySpecific: [],
  companyStory: [],
  features: [],
  siteMedia: [],
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
  cta: "Primär call-to-action",
  avoid: "Undvik detta",
  imagery: "Bildstil",
  businessDetails: "Företagsuppgifter",
  brandIdentity: "Varumärke och stil",
  servicesProducts: "Tjänster och erbjudande",
  categorySpecific: "Branschspecifik information",
  companyStory: "Om företaget",
  features: "Funktioner och moduler",
  siteMedia: "Uppladdade filer",
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
  images: /(logo|logotyp|bilder?|foto|fotografi|produktbild|herobild|hero\s*bild|illustration|ikon(er)?|grafik|media|uppladdning|ladda\s*upp|inga?\s*(egna\s*)?bilder|hoppa\s*över|skippa)/i,
  cta: /(boka|kontakt|köp|kop|offert|registrer|ring|ladda ner|prenumerera|begär|call\s*to\s*action|cta)/i,
  avoid: /(?!)/,
  imagery: /(?!)/,
  businessDetails: /(?!)/,
  brandIdentity: /(?!)/,
  servicesProducts: /(?!)/,
  categorySpecific: /(?!)/,
  companyStory: /(?!)/,
  features: /(?!)/,
  siteMedia: /(?!)/,
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

/**
 * Builds a minimal, *purpose-driven* page list. Intentionally free of Tailwind
 * tokens, section counts, and layout prescriptions — those belong in the
 * system prompt (Scaffold Variant, Build Intent, Visual Identity, Quality Bar,
 * directive markdown files). Here we only say **what** each page is for so the
 * model can decide **how** to express it.
 */
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

  const homeIntent = isRestaurant
    ? "Förmedla köket, stämningen och gör det lätt att boka bord eller se menyn."
    : isEcommerce
      ? "Fånga varumärket, visa utvalda produkter och led till shopen."
      : isSalon
        ? "Förmedla kompetens och stämning, visa populära behandlingar och led till bokning."
        : isPortfolio
          ? "Visa arbetet, personligheten och gör det enkelt att höra av sig."
          : "Förmedla vilka ni är, vad ni erbjuder och bjud in till rätt första handling.";

  pages.push(
    "### Startsida (`app/page.tsx`)",
    `Syfte: ${homeIntent}`,
  );

  if (has("om oss") || has("om mig") || !has("landningssida")) {
    pages.push(
      "",
      "### Om oss (`app/om-oss/page.tsx`)",
      "Syfte: Bygg förtroende — berätta historien, människorna och värderingarna på ert eget sätt.",
    );
  }

  if (isRestaurant || has("meny") || has("matsedel")) {
    pages.push(
      "",
      "### Meny (`app/meny/page.tsx`)",
      "Syfte: Visa maten så att besökaren blir sugen. Använd rätter från underlaget om de finns, annars trovärdiga svenska exempel.",
    );
  }

  if (isEcommerce || has("webshop") || has("produkt")) {
    pages.push(
      "",
      "### Produkter (`app/produkter/page.tsx`)",
      "Syfte: Visa sortimentet så det blir lätt att köpa. Använd produkter från underlaget om de finns.",
    );
  }

  if (isSalon || has("behandling")) {
    pages.push(
      "",
      "### Behandlingar (`app/behandlingar/page.tsx`)",
      "Syfte: Presentera tjänsterna tydligt och led till bokning.",
    );
  }

  if (has("pris") || has("paket")) {
    pages.push(
      "",
      "### Priser (`app/priser/page.tsx`)",
      "Syfte: Gör det enkelt att jämföra paket och fatta beslut.",
    );
  }

  if (has("galleri") || has("portfolio") || has("case") || isPortfolio) {
    pages.push(
      "",
      "### Galleri / Portfolio (`app/galleri/page.tsx`)",
      "Syfte: Låt bilder eller case bära sidan — visa bredd och kvalitet.",
    );
  }

  if (has("bokning") || has("boka")) {
    pages.push(
      "",
      "### Boka tid (`app/boka/page.tsx`)",
      "Syfte: En smidig väg från intresse till bokning.",
    );
  }

  if (has("blogg") || has("nyheter")) {
    pages.push(
      "",
      "### Blogg (`app/blogg/page.tsx`)",
      "Syfte: Expertis och nyheter i artikelformat — plus en artikelvy (`app/blogg/[slug]/page.tsx`).",
    );
  }

  if (has("faq")) {
    pages.push(
      "",
      "### FAQ (`app/faq/page.tsx`)",
      "Syfte: Besvara återkommande frågor så supporten minskar.",
    );
  }

  if (has("team") || has("vårt team")) {
    pages.push(
      "",
      "### Teamet (`app/teamet/page.tsx`)",
      "Syfte: Visa människorna bakom varumärket.",
    );
  }

  if (has("nyhetsbrev")) {
    pages.push("", "- Nyhetsbrev: tydlig signup i footer och/eller på startsidan.");
  }

  if (isHotel || has("rum") || has("boende")) {
    pages.push(
      "",
      "### Rum / Boende (`app/rum/page.tsx`)",
      "Syfte: Visa rum/boenden och led till bokning.",
    );
  }

  if (has("karta") || has("hitta hit")) {
    pages.push("", "- Karta + vägbeskrivning på kontaktsidan.");
  }

  if (ft.includes("login") || ft.includes("inloggning")) {
    pages.push("", "- Inloggning/registrering med skyddade sidor där det behövs.");
  }

  if (ft.includes("sök") || ft.includes("search")) {
    pages.push("", "- Sökfunktion i headern + resultatsida.");
  }

  if (ft.includes("mörkt") || ft.includes("dark")) {
    pages.push("", "- Mörkt läge via CSS-variabler, med tema-switch i headern.");
  }

  if (ft.includes("chatt") || ft.includes("support") || ft.includes("live-chat")) {
    pages.push("", "- Chattwidget som inte stör huvudflödet.");
  }

  if (ft.includes("cookie")) {
    pages.push("", "- GDPR-kompatibel cookie-banner med samtyckesminne.");
  }

  if (ft.includes("checkout") || ft.includes("varukorg") || ft.includes("cart")) {
    pages.push(
      "",
      "### Varukorg & Checkout (`app/varukorg/page.tsx`)",
      "Syfte: Smidig kassaflöde från varukorg till bekräftelse.",
    );
  }

  if (ft.includes("flerspråk") || ft.includes("multi-lang")) {
    pages.push("", "- Flerspråksstöd med språkväljare i headern.");
  }

  pages.push(
    "",
    "### Kontakt (`app/kontakt/page.tsx`)",
    "Syfte: Gör det enkelt att nå er — formulär, direktkontakt och eventuella öppettider.",
  );

  pages.push(
    "",
    "### Generella riktlinjer för alla sidor",
    "- Varje sida ska ha verkligt innehåll, inte bara en rubrik och en tillbaka-länk.",
    "- Om underlaget saknar specifik text: skriv trovärdigt, branschanpassat innehåll på svenska.",
    "- Dela header/footer via layout.tsx.",
  );

  return pages;
}

const WIZARD_FIELD_LABELS: Record<string, string> = {
  siteType: "Sajttyp / Bransch",
  offer: "Verksamhetsbeskrivning",
  existingSite: "Befintlig hemsida",
  businessDetails: "Företagsuppgifter",
  brandIdentity: "Varumärke och stil",
  servicesProducts: "Tjänster och erbjudande",
  categorySpecific: "Branschspecifik information",
  companyStory: "Om företaget (Om oss, historia, vision, kontaktintro)",
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
          "## Logotyp (användarens egen)",
          "",
          "Användaren har laddat upp sin logotyp. Använd den i header och footer — aldrig text som ersättning.",
          "Ladda via `next/image` med exakt den URL som anges nedan. Storlek, placering och bakgrundskontrast är ditt kreativa beslut — välj det som klär varumärket.",
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
          "Du FÅR INTE använda Unsplash, /placeholder.svg, eller generiska bilder istället.",
          "",
          "### OBLIGATORISKA REGLER",
          "1. ANVÄND VARJE BILD NEDAN som `<img src=\"URL\" />` i koden — DIREKT med URL:en som anges.",
          "2. VARJE uppladdad bild MÅSTE finnas minst en gång i den genererade koden.",
          "3. Om du har fler bilder än naturliga platser — skapa ett bildgalleri eller bildgrid.",
          "4. ALDRIG ersätt dessa med placeholder, Unsplash eller genererade bilder.",
          "",
          "### Placeringsregler baserat på bildkategori",
          "- **purpose=hero-image** → Full-width hero-sektion som bakgrundsbild (object-cover) eller prominenta <img>",
          "- **purpose=product-photo** → Produktkort, produktgrid, feature-sektion",
          "- **purpose=about-image** → 'Om oss'-sektion, teambilder, kontaktsida",
          "- **purpose=gallery-image** → Galleri, portfolio, bildgrid",
          "- **purpose=background-image** → CSS background-image eller hero-bakgrund med overlay",
          "- **purpose=site-media** → AI bestämmer bästa placering utifrån context",
          "- **Video (mp4/webm)** → bakgrundsvideo i hero eller videosektion",
          "",
          "### Bilder att använda (kopiera URL:erna EXAKT som src):",
          ...ownMedia.map(
            (m) => `- ${m.filename} (${m.mimeType.startsWith("video/") ? "video" : "bild"}) [purpose=${m.purpose || "site-media"}]${m.context ? ` [context: ${m.context}]` : ""} → src="${m.url}"`,
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

  return [
    "## Starter intake",
    "Detta är ett **faktablad** — rå information om kunden, innehållet, bilderna och de sidor som ska byggas.",
    "Designbeslut (layout, komposition, motion, spacing, typografisk rytm, färgsystem) styrs av system-prompten ovan",
    "(Scaffold Variant, Build Intent, Visual Identity, Quality Bar, directives). Ta ut svängarna och gör något som",
    "känns skräddarsytt för varumärket — undvik generiska wireframes.",
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
    "## Sidor att bygga",
    "",
    ...pageStructure,
    "",
    "## Obligatoriska regler (får inte brytas)",
    "- Generera minst startsidan + 2 undersidor i första svaret. Dela header/footer via `layout.tsx`.",
    "- Exakt en `<h1>` per sida; håll h1 → h2 → h3-hierarkin.",
    "- Alla uppladdade bilder och logotypen **måste** användas med exakt de URL:er som anges. Använd aldrig `/placeholder.svg` eller Unsplash som ersättning för användarens egna bilder.",
    "- **Navigation**: desktop-menyn visar max 5 synliga toppnivålänkar (gruppera överskjutande i dropdown parent/child). På <768px **måste** menyn kollapsa till hamburger som öppnar en Sheet/Drawer — aldrig horisontell scroll-meny, aldrig trunkerad text, aldrig fler än 5 länkar i rad.",
    "- All text på svenska (å, ä, ö). Inga emojis, inga engelska placeholders.",
    "- Hittar du inte specifik text i underlaget: skriv trovärdig, branschanpassad svensk text — aldrig tomma sidor, aldrig stock-adresser som \"Storgatan 12\".",
    "- Metadata-arrayer i `string[]` (inte `as const`).",
    "",
    "## Creative direction",
    "Behandla alla designbeslut som ditt kreativa territorium. System-prompten ger ramarna (palett, scaffold-variant, quality bar, motion) — dina val av hero-komposition, sektionsrytm, typografisk tyngd, whitespace, asymmetri och överraskande detaljer gör sajten unik. Undvik att sy ihop standardblock — bygg något du själv skulle vilja visa upp.",
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
