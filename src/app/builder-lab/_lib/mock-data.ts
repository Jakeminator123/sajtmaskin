/**
 * Builder-labbet: påhittat innehåll för konceptet. Inget här når API, databas
 * eller den riktiga byggmotorn; allt simuleras i webbläsaren.
 */

export type SiteKind = "cafe" | "salon" | "craft";
export type ThemeKey = "amber" | "forest" | "slate" | "night";
export type SectionId = "hero" | "offer" | "highlights" | "booking" | "about" | "hours" | "contact";

export type SiteTheme = {
  label: string;
  swatch: [string, string, string];
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  line: string;
  heroFrom: string;
  heroTo: string;
  dark: boolean;
};

export const SITE_THEMES: Record<ThemeKey, SiteTheme> = {
  amber: {
    label: "Varm & inbjudande",
    swatch: ["#fbf3e8", "#c2410c", "#2a1d14"],
    bg: "#fbf6ef",
    surface: "#ffffff",
    text: "#2a1d14",
    muted: "#7a6656",
    accent: "#c2410c",
    accentText: "#fff7ed",
    line: "rgba(42,29,20,0.10)",
    heroFrom: "#f8dcb9",
    heroTo: "#e9a376",
    dark: false,
  },
  forest: {
    label: "Grön & naturlig",
    swatch: ["#f1f6ef", "#2f7d4f", "#16261b"],
    bg: "#f3f7f1",
    surface: "#ffffff",
    text: "#16261b",
    muted: "#5d7363",
    accent: "#2f7d4f",
    accentText: "#f0fdf4",
    line: "rgba(22,38,27,0.10)",
    heroFrom: "#cfe8d3",
    heroTo: "#7fbf95",
    dark: false,
  },
  slate: {
    label: "Stilren & neutral",
    swatch: ["#f5f6f8", "#334155", "#0f172a"],
    bg: "#f6f7f9",
    surface: "#ffffff",
    text: "#0f172a",
    muted: "#64748b",
    accent: "#1e293b",
    accentText: "#f8fafc",
    line: "rgba(15,23,42,0.10)",
    heroFrom: "#e2e8f0",
    heroTo: "#94a3b8",
    dark: false,
  },
  night: {
    label: "Mörk & exklusiv",
    swatch: ["#15110e", "#f59e0b", "#f5ece3"],
    bg: "#120f0d",
    surface: "#1c1815",
    text: "#f5ece3",
    muted: "#b3a291",
    accent: "#f59e0b",
    accentText: "#1c1206",
    line: "rgba(245,236,227,0.10)",
    heroFrom: "#3a2a1c",
    heroTo: "#8a5a2b",
    dark: true,
  },
};

export type SiteContent = {
  kind: SiteKind;
  brand: string;
  city: string;
  nav: string[];
  hero: { eyebrow: string; title: string; lead: string; cta: string; secondary: string };
  offerTitle: string;
  offers: { name: string; desc: string; price: string }[];
  highlights: { title: string; text: string }[];
  about: { title: string; text: string };
  hours: { day: string; time: string }[];
  contact: { address: string; phone: string; email: string };
  booking: boolean;
};

export type SiteVersion = {
  id: string;
  number: number;
  /** Versionen den byggdes från (null för den första). */
  parentId: string | null;
  prompt: string;
  summary: string;
  changed: SectionId[];
  theme: ThemeKey;
  content: SiteContent;
  createdAt: number;
};

const BASE_CONTENT: Record<SiteKind, Omit<SiteContent, "brand" | "city">> = {
  cafe: {
    kind: "cafe",
    nav: ["Meny", "Om oss", "Öppettider", "Kontakt"],
    hero: {
      eyebrow: "Kafé & bageri",
      title: "Nybryggt, nybakat och alltid en plats för dig.",
      lead: "Specialkaffe från små rosterier, kardemummabullar varma från ugnen och en lugn hörna att landa i.",
      cta: "Se menyn",
      secondary: "Hitta hit",
    },
    offerTitle: "Från disken",
    offers: [
      { name: "Cortado", desc: "Dubbel espresso, lite varm mjölk", price: "42 kr" },
      { name: "Kardemummabulle", desc: "Bakad på morgonen, varje morgon", price: "38 kr" },
      { name: "Filterkaffe", desc: "Veckans böna, påtår ingår", price: "35 kr" },
      { name: "Surdegsmacka", desc: "Västerbottenost, äpple och honung", price: "79 kr" },
    ],
    highlights: [
      { title: "Egen rostning", text: "Bönor från små gårdar, rostade i Göteborg." },
      { title: "Bakat på plats", text: "Allt bröd och fikabröd görs här, varje dag." },
      { title: "Plats för laptop", text: "Snabbt wifi och uttag vid fönsterbänken." },
    ],
    about: {
      title: "Ett kvarterskafé sedan 2014",
      text: "Vi startade med en espressomaskin och en dröm om det perfekta fikat. I dag är vi ett vardagsrum för hela kvarteret.",
    },
    hours: [
      { day: "Mån–fre", time: "07–18" },
      { day: "Lördag", time: "09–17" },
      { day: "Söndag", time: "10–16" },
    ],
    contact: { address: "Linnégatan 12", phone: "031-12 34 56", email: "hej@exempel.se" },
    booking: false,
  },
  salon: {
    kind: "salon",
    nav: ["Behandlingar", "Om oss", "Öppettider", "Kontakt"],
    hero: {
      eyebrow: "Frisör & hårvård",
      title: "Hår som känns som du, bara lite bättre.",
      lead: "Klippning, färg och styling med tid för samtal. Vi lyssnar först och klipper sen.",
      cta: "Se behandlingar",
      secondary: "Hitta hit",
    },
    offerTitle: "Behandlingar",
    offers: [
      { name: "Klippning", desc: "Inklusive tvätt och styling", price: "650 kr" },
      { name: "Färg & klipp", desc: "Konsultation ingår", price: "1 450 kr" },
      { name: "Slingor", desc: "Folie eller balayage", price: "1 650 kr" },
      { name: "Skäggtrim", desc: "Varm handduk och olja", price: "350 kr" },
    ],
    highlights: [
      { title: "Veganska produkter", text: "Skonsamt för håret och miljön." },
      { title: "Tid för dig", text: "Aldrig stressade bokningar." },
      { title: "Kvällstider", text: "Öppet till 20 på torsdagar." },
    ],
    about: {
      title: "En salong med lugn i fokus",
      text: "Vi är tre frisörer som tror att en bra klippning börjar med ett bra samtal.",
    },
    hours: [
      { day: "Mån–fre", time: "09–19" },
      { day: "Lördag", time: "10–16" },
      { day: "Söndag", time: "Stängt" },
    ],
    contact: { address: "Storgatan 4", phone: "040-98 76 54", email: "hej@exempel.se" },
    booking: false,
  },
  craft: {
    kind: "craft",
    nav: ["Tjänster", "Om oss", "Öppettider", "Kontakt"],
    hero: {
      eyebrow: "Bygg & renovering",
      title: "Hantverk som håller i generationer.",
      lead: "Kök, badrum och tillbyggnader. Fast pris, tydlig tidsplan och ett städat bygge varje dag.",
      cta: "Se tjänster",
      secondary: "Få offert",
    },
    offerTitle: "Tjänster",
    offers: [
      { name: "Köksrenovering", desc: "Från ritning till sista lister", price: "Fast pris" },
      { name: "Badrum", desc: "Certifierat våtrum", price: "Fast pris" },
      { name: "Altan & tillbyggnad", desc: "Bygglov ingår", price: "Offert" },
      { name: "Småjobb", desc: "Dörrar, golv, lister", price: "Från 650 kr/h" },
    ],
    highlights: [
      { title: "ROT-avdrag", text: "Vi sköter pappren åt dig." },
      { title: "Garanti", text: "Fem års garanti på allt arbete." },
      { title: "Lokala", text: "Vi bor och jobbar i området." },
    ],
    about: {
      title: "Snickare i tredje generationen",
      text: "Familjeföretag med lång erfarenhet och korta beslutsvägar. Du pratar alltid med den som bygger.",
    },
    hours: [
      { day: "Mån–fre", time: "07–16" },
      { day: "Lördag", time: "Efter avtal" },
      { day: "Söndag", time: "Stängt" },
    ],
    contact: { address: "Verkstadsvägen 8", phone: "08-555 123 45", email: "hej@exempel.se" },
    booking: false,
  },
};

const CITIES = ["Göteborg", "Malmö", "Stockholm", "Uppsala", "Lund", "Umeå", "Örebro", "Västerås"];

function detectKind(prompt: string): SiteKind {
  const text = prompt.toLowerCase();
  if (/(frisör|salong|hår|skönhet|barber)/.test(text)) return "salon";
  if (/(snickare|bygg|hantverk|renover|rörmok|elektriker|måler)/.test(text)) return "craft";
  return "cafe";
}

function detectBrand(prompt: string, kind: SiteKind): string {
  const named = prompt.match(
    /(?:heter|kallas|namnet)\s+["“']?([A-ZÅÄÖ][\wåäöÅÄÖ&-]*(?:\s[A-ZÅÄÖ][\wåäöÅÄÖ&-]*)?)/,
  );
  if (named?.[1]) return named[1];
  const quoted = prompt.match(/["“]([^"”]{2,32})["”]/);
  if (quoted?.[1]) return quoted[1];
  return kind === "salon" ? "Studio Lugn" : kind === "craft" ? "Byggbröderna" : "Kaffekoppen";
}

function detectTheme(prompt: string, fallback: ThemeKey): ThemeKey {
  const text = prompt.toLowerCase();
  if (/(mörk|dark|natt|exklusiv)/.test(text)) return "night";
  if (/(grön|natur|skog|\beko)/.test(text)) return "forest";
  if (/(stilren|neutral|minimal|grå)/.test(text)) return "slate";
  if (/(varm|mysig|ombonad)/.test(text)) return "amber";
  return fallback;
}

export function createInitialVersion(
  prompt: string,
  preferredTheme: ThemeKey | "auto",
): SiteVersion {
  const kind = detectKind(prompt);
  const city =
    CITIES.find((name) => prompt.toLowerCase().includes(name.toLowerCase())) ?? "Göteborg";
  const kindTheme: ThemeKey = kind === "salon" ? "slate" : kind === "craft" ? "forest" : "amber";
  const theme = preferredTheme === "auto" ? detectTheme(prompt, kindTheme) : preferredTheme;
  const base = BASE_CONTENT[kind];
  return {
    id: "v1",
    number: 1,
    parentId: null,
    prompt,
    summary: "Första versionen: startsida med erbjudande, om oss, öppettider och kontakt.",
    changed: ["hero", "offer", "highlights", "about", "hours", "contact"],
    theme,
    content: {
      ...base,
      brand: detectBrand(prompt, kind),
      city,
      contact: { ...base.contact, address: `${base.contact.address}, ${city}` },
    },
    createdAt: Date.now(),
  };
}

const HERO_ALTERNATIVES: Record<SiteKind, string[]> = {
  cafe: [
    "Kvarterets vardagsrum, med Göteborgs bästa bulle.",
    "Gott kaffe tar tid. Vi har gott om den.",
  ],
  salon: ["Lugnet före klippningen är halva upplevelsen.", "Ditt hår, din stil, vår omsorg."],
  craft: ["Vi bygger som om vi själva skulle bo där.", "Ordning, reda och raka vinklar."],
};

/**
 * Tolkar en uppföljning och returnerar nästa version. Medvetet enkel
 * nyckelordslogik: konceptet visar flödet, inte en riktig modell.
 */
export function applyFollowUp(
  previous: SiteVersion,
  prompt: string,
  target: SectionId | null,
  number = previous.number + 1,
): SiteVersion {
  const text = prompt.toLowerCase();
  const content: SiteContent = structuredClone(previous.content);
  let theme = previous.theme;
  const changed = new Set<SectionId>();
  const notes: string[] = [];

  const nextTheme = detectTheme(prompt, theme);
  if (nextTheme !== theme) {
    theme = nextTheme;
    notes.push(`bytte till paletten «${SITE_THEMES[theme].label}»`);
    for (const id of ["hero", "offer", "highlights", "about", "hours", "contact"] as const)
      changed.add(id);
    if (content.booking) changed.add("booking");
  }
  if (/(bok|reserv|tidsbok)/.test(text) && !content.booking) {
    content.booking = true;
    content.nav = [...content.nav.slice(0, 1), "Boka", ...content.nav.slice(1)];
    changed.add("booking");
    notes.push("lade till en bokningssektion");
  }
  if (/(kort|kortare|enklare)/.test(text)) {
    content.hero.lead = content.hero.lead.split(/[,.]/)[0] + ".";
    changed.add(target ?? "hero");
    notes.push("kortade texterna");
  }
  if (/(pris|meny|fler|lägg till)/.test(text) && !/(bok)/.test(text)) {
    const extra =
      content.kind === "cafe"
        ? { name: "Chokladboll", desc: "Med kokos, rullad för hand", price: "28 kr" }
        : content.kind === "salon"
          ? { name: "Inpackning", desc: "Djupverkande hårkur", price: "450 kr" }
          : { name: "Fönsterbyte", desc: "Energiklassade fönster", price: "Offert" };
    if (!content.offers.some((offer) => offer.name === extra.name)) {
      content.offers = [...content.offers, extra];
      changed.add("offer");
      notes.push(`lade till «${extra.name}»`);
    }
  }
  if (
    /(rubrik|titel|slogan|hero|rubriken)/.test(text) ||
    (target === "hero" && notes.length === 0)
  ) {
    const alternatives = HERO_ALTERNATIVES[content.kind];
    content.hero.title = alternatives.find((alt) => alt !== content.hero.title) ?? alternatives[0];
    changed.add("hero");
    notes.push("skrev en ny rubrik");
  }
  if (notes.length === 0) {
    const section = target ?? "hero";
    if (section === "about") {
      content.about.text = `${content.about.text} Välkommen in!`;
    } else if (section === "hero") {
      content.hero.title =
        HERO_ALTERNATIVES[content.kind].find((alt) => alt !== content.hero.title) ??
        content.hero.title;
    }
    changed.add(section);
    notes.push("finslipade text och rytm");
  }

  const summary = notes.join(", ");
  return {
    id: `v${number}`,
    number,
    parentId: previous.id,
    prompt,
    summary: summary.charAt(0).toUpperCase() + summary.slice(1) + ".",
    changed: [...changed],
    theme,
    content,
    createdAt: Date.now(),
  };
}

/** Promptar som byter palett via en vanlig uppföljning (ny version). */
export const THEME_PROMPTS: Record<ThemeKey, string> = {
  amber: "Byt till varma färger",
  forest: "Byt till gröna färger",
  slate: "Byt till stilren neutral palett",
  night: "Gör den mörk och exklusiv",
};

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Startbild",
  offer: "Erbjudande",
  highlights: "Fördelar",
  booking: "Bokning",
  about: "Om oss",
  hours: "Öppettider",
  contact: "Kontakt",
};

export const SECTION_SUGGESTIONS: Record<SectionId, string[]> = {
  hero: ["Ny rubrik", "Kortare text", "Mörkare stämning"],
  offer: ["Lägg till fler", "Visa priser tydligare", "Kortare beskrivningar"],
  highlights: ["Kortare text", "Byt ordning", "Lägg till ikoner"],
  booking: ["Kortare text", "Lägg till telefon", "Visa lediga tider"],
  about: ["Kortare text", "Mer personlig ton", "Lägg till bild"],
  hours: ["Lägg till lunch", "Visa helgdagar", "Kortare text"],
  contact: ["Lägg till karta", "Kortare text", "Lägg till Instagram"],
};

export const FOLLOW_UP_SUGGESTIONS = [
  "Gör den mörkare",
  "Lägg till bokning",
  "Ny rubrik",
  "Grönare färger",
  "Fler i menyn",
];

export const EXAMPLE_PROMPTS: {
  title: string;
  icon: "coffee" | "scissors" | "hammer";
  prompt: string;
}[] = [
  {
    title: "Kafé",
    icon: "coffee",
    prompt:
      "En hemsida för ett litet kafé i Göteborg som heter Kaffekoppen. Meny med priser, öppettider och kontakt. Varm och mysig känsla.",
  },
  {
    title: "Frisör",
    icon: "scissors",
    prompt:
      "En lugn och stilren sajt för min frisörsalong i Malmö som heter Studio Lugn. Behandlingar med priser och öppettider.",
  },
  {
    title: "Snickare",
    icon: "hammer",
    prompt:
      "Hemsida för mitt snickeriföretag i Uppsala som heter Byggbröderna. Tjänster, ROT-avdrag och offertförfrågan.",
  },
];

export type BuildStep = {
  id: string;
  label: string;
  detail: (version: SiteVersion) => string;
  ms: number;
};

export const FIRST_BUILD_STEPS: BuildStep[] = [
  {
    id: "understand",
    label: "Tolkar din idé",
    detail: (v) => `${v.content.hero.eyebrow} i ${v.content.city}`,
    ms: 1500,
  },
  {
    id: "plan",
    label: "Planerar struktur",
    detail: (v) => `${v.content.nav.length + 1} sektioner · 1 sida`,
    ms: 1700,
  },
  {
    id: "design",
    label: "Sätter designen",
    detail: (v) => `${SITE_THEMES[v.theme].label} · serif-rubriker + Inter`,
    ms: 1700,
  },
  {
    id: "build",
    label: "Bygger sektioner",
    detail: () => "Startbild, erbjudande, om oss, öppettider, kontakt",
    ms: 3600,
  },
  {
    id: "verify",
    label: "Kvalitetskoll",
    detail: () => "Mobil, kontrast och SEO godkända",
    ms: 1300,
  },
];

export const FOLLOW_UP_STEPS: BuildStep[] = [
  {
    id: "understand",
    label: "Läser din ändring",
    detail: (v) => `Mål: ${v.changed.map((id) => SECTION_LABELS[id]).join(", ")}`,
    ms: 1100,
  },
  { id: "build", label: "Uppdaterar", detail: (v) => v.summary, ms: 1900 },
  { id: "verify", label: "Kvalitetskoll", detail: () => "Inga fel hittade", ms: 900 },
];

export const ALL_SECTIONS: SectionId[] = [
  "hero",
  "offer",
  "highlights",
  "booking",
  "about",
  "hours",
  "contact",
];

export function visibleSections(content: SiteContent): SectionId[] {
  return ALL_SECTIONS.filter((id) => id !== "booking" || content.booking);
}
