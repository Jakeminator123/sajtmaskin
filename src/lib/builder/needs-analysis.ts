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
  | "images";

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
    field: "style",
    question: "Vilken känsla vill du att sidan ska ge?",
    followUp: "Ska det kännas rent och modernt, varmt och personligt, lyxigt, eller mer lekfullt?",
    options: ["Rent och modernt", "Varmt och personligt", "Mörkt och lyxigt", "Skandinavisk och stilren"],
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
      "Bra start. Du har redan gett mig en tydlig riktning. Jag håller dig i handen och tar en liten fråga i taget innan jag bygger.",
    ),
  ];
}

const FOLLOW_UP_PREFIXES = [
  "Ingen stress! Jag vill bara förstå dig lite bättre.",
  "Helt okej — låt mig ställa frågan på ett annat sätt.",
  "Inga konstigheter! Jag frågar bara för att bygga rätt åt dig.",
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

  return createNeedsAnalysisMessage(
    nextQuestion,
    state.completionRatio >= 0.5
      ? "Snyggt. Det här ser redan lovande ut. Jag vill bara spika en sista viktig detalj."
      : "Snyggt. Du gör det här enkelt för mig. Jag tar nästa lilla fråga så fortsätter vi.",
  );
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
}

export function buildNeedsAnalysisPrompt(
  messages: ChatMessage[],
  scrapeData?: ScrapeResult | null,
  selectedTemplates?: SelectedTemplateInfo[] | null,
  uploadedMedia?: UploadedMediaInfo[] | null,
): string {
  const userMessages = getUserMessages(messages);
  const rawUserMessages = getRawUserMessages(messages);
  const summary = QUESTION_ORDER.map(({ field }) => {
    const evidence = getEvidenceForField(field, userMessages, rawUserMessages);
    return `- ${FIELD_LABELS[field]}: ${evidence ?? "Inte tydligt uttryckt"}`;
  });

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

  const ownMedia = uploadedMedia?.filter((m) => m.purpose !== "design-reference") ?? [];
  const inspirationMedia = uploadedMedia?.filter((m) => m.purpose === "design-reference") ?? [];

  const ownMediaSection =
    ownMedia.length > 0
      ? [
          "",
          "## Uppladdade egna bilder och videos",
          "",
          `Användaren har laddat upp ${ownMedia.length} egna filer som SKA användas på sajten.`,
          "",
          "Filerna bifogas som bilder i meddelandet. Analysera VARJE bild och bestäm:",
          "",
          "### Placeringsregler (följ noggrant)",
          "- **Logotyp / varumärkesbild** → header/navbar och footer",
          "- **Personalbilder / porträtt** → 'Om oss'-sektionen eller teamsektion",
          "- **Produktbilder** → produktkort, produktgalleri, hero om det är en webshop",
          "- **Lokalbild / fasad / interiör** → hero-bakgrund, kontaktsektion eller gallerisektion",
          "- **Mat / rätter** → meny-sektion, gallerisektion",
          "- **Generell verksamhetsbild** → hero-bakgrund eller relevant sektion",
          "- **Video (mp4/webm)** → bakgrundsvideo i hero, produktdemo eller videosektion",
          "",
          "### Viktigt",
          "- Använd de uppladdade bilderna ISTÄLLET FÖR placeholder/Unsplash där de passar.",
          "- Referera till dem med sin URL i koden (next/image src eller video src).",
          "- Om en bild inte har en uppenbar plats, använd den som dekorativt element.",
          "",
          "Egna filer:",
          ...ownMedia.map(
            (m) => `- ${m.filename} (${m.mimeType.startsWith("video/") ? "video" : "bild"}) — ${m.url}`,
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

  const mediaSection = [...ownMediaSection, ...inspirationSection];

  return [
    "## Starter intake",
    "Använd underlaget nedan när du bygger den första versionen.",
    "",
    "## Sammanfattad behovsanalys",
    ...summary,
    ...templateSection,
    ...scrapedSection,
    ...mediaSection,
    "",
    "## Användarens egna formuleringar",
    ...userMessages.map((message, index) => `${index + 1}. ${message}`),
    "",
    "## Instruktion",
    "- Bygg direkt utifrån underlaget ovan.",
    "- Ta trygga designbeslut när detaljer saknas.",
    "- Prioritera tydlig struktur, ett starkt första intryck och en relevant CTA.",
    "- VIKTIGT: Varje sida ska ha MINST 3-4 sektioner med verkligt innehåll. Ingen sida får ha bara en hero/rubrik och sedan tom yta ner till footer.",
    "- Startsidan ska ha: hero, tjänster/produkter, kort om oss, socialt bevis (citat/kunder), CTA-banner och kontaktsektion.",
    "- Undersidor ska vara innehållsrika — inte bara en rubrik. Om det inte finns tillräckligt innehåll för en separat sida, slå ihop den med en annan.",
    ...(uploadedMedia && uploadedMedia.length > 0
      ? ["- Använd de uppladdade bilderna/videos på logiskt rätt plats enligt placeringsreglerna ovan."]
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
