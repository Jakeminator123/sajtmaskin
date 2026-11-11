/**
 * "Sidans utseende" — a local, instant palette suggestion from the user's own
 * description.
 *
 * Deliberately dumb: keyword → theme, computed on every keystroke in the
 * browser. No LLM call, no request, no generation. Looking at palette options
 * must never cost the user anything (owner requirement 2026-11-11), and the
 * suggestion is only a starting point — the build still receives exactly what
 * the user picked in the panel (`designTheme` + Färgläge), never this guess.
 *
 * Matching is Swedish-aware: `\b` does not treat å/ä/ö as letters, so word
 * edges are spelled out with an explicit letter class. Stems match at a word
 * start and allow any suffix (Swedish compounds and inflections); words match
 * exactly. Stems that would collide with everyday prompt words are spelled as
 * words instead ("bygga" ≠ byggfirma, "modern" ≠ mode, "ekonomi" ≠ eko).
 */

import type { ThemeClusterId } from "./theme-presets";

const LETTER = "a-z0-9åäöéüæø";

function stemPattern(stems: string[]): RegExp {
  return new RegExp(`(?:^|[^${LETTER}])(?:${stems.join("|")})`);
}

function wordPattern(words: string[]): RegExp {
  return new RegExp(`(?:^|[^${LETTER}])(?:${words.join("|")})(?![${LETTER}])`);
}

/** Lowercase, strip acute accents (café → cafe) but keep å/ä/ö intact. */
export function normalizeDescription(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/́/g, "").normalize("NFC");
}

interface SiteCategory {
  /** Short Swedish basis shown to the user ("utifrån din beskrivning: mat och fika"). */
  label: string;
  /** Curated trio, best first, spread over different moods on purpose. */
  themes: [ThemeClusterId, ThemeClusterId, ThemeClusterId];
  pattern: RegExp;
  /** Whether the category on its own says "hemsida" (every business type here does). */
  website: boolean;
}

const CATEGORIES: SiteCategory[] = [
  {
    label: "mat och fika",
    themes: ["orange", "green", "slate"],
    website: true,
    pattern: stemPattern([
      "kafe",
      "cafe",
      "kafeteria",
      "fika",
      "bageri",
      "bagare",
      "konditori",
      "restaurang",
      "krog",
      "bistro",
      "pizzeri",
      "sushi",
      "glassbar",
      "glasskiosk",
      "chokla",
      "vinbar",
      "bryggeri",
      "catering",
      "lunch",
      "middag",
      "frukost",
      "brunch",
      "kaffe",
      "rosteri",
      "foodtruck",
      "matvagn",
      "delikatess",
    ]),
  },
  {
    label: "natur och hälsa",
    themes: ["green", "teal", "orange"],
    website: true,
    pattern: new RegExp(
      `${
        stemPattern([
          "trädgård",
          "blomster",
          "blomsterhandel",
          "florist",
          "växt",
          "natur",
          "hållbar",
          "odling",
          "skog",
          "friluft",
          "yoga",
          "välmående",
          "massage",
          "vegan",
          "vegetar",
          "plantskol",
          "lantbruk",
          "gårdsbutik",
        ]).source
      }|${wordPattern(["eko", "ekologisk", "ekologiska", "ekologiskt", "gård", "gården"]).source}`,
    ),
  },
  {
    label: "trygghet och rådgivning",
    themes: ["indigo", "blue", "slate"],
    website: true,
    pattern: stemPattern([
      "advokat",
      "jurist",
      "juridi",
      "konsult",
      "redovisning",
      "bokföring",
      "revision",
      "revisor",
      "bank",
      "finans",
      "försäkring",
      "mäklar",
      "fastighet",
      "rådgiv",
      "skatt",
      "b2b",
      "notarie",
      "inkasso",
      "investering",
      "byrå",
    ]),
  },
  {
    label: "teknik och digitalt",
    themes: ["violet", "blue", "slate"],
    website: false,
    pattern: new RegExp(
      `${
        stemPattern([
          "tech",
          "startup",
          "saas",
          "mjukvar",
          "programvar",
          "utvecklar",
          "digital",
          "databas",
          "molntjänst",
          "kodning",
          "it-",
          "ai-",
        ]).source
      }|${wordPattern(["ai", "it"]).source}`,
    ),
  },
  {
    label: "skönhet och omtanke",
    themes: ["rose", "violet", "slate"],
    website: true,
    pattern: new RegExp(
      `${
        stemPattern([
          "frisör",
          "salong",
          "skönhet",
          "nagel",
          "naglar",
          "hudvård",
          "makeup",
          "smink",
          "fransar",
          "bryn",
          "bröllop",
          "brud",
          "kosmetik",
          "barberare",
          "barbershop",
        ]).source
      }|${wordPattern(["spa", "spat"]).source}`,
    ),
  },
  {
    label: "hantverk och bygg",
    themes: ["orange", "slate", "blue"],
    website: true,
    pattern: stemPattern([
      "byggfirm",
      "byggföretag",
      "byggare",
      "byggtjänst",
      "byggservice",
      "snickar",
      "snickeri",
      "hantverk",
      "rörmokar",
      "vvs",
      "elektriker",
      "elfirma",
      "målare",
      "målerifirma",
      "takläggar",
      "golvläggar",
      "renovering",
      "flyttfirm",
      "flytthjälp",
      "bilverkstad",
      "verkstad",
      "mekaniker",
      "smed",
      "plåtslagar",
      "murare",
      "entreprenad",
      "trädfäll",
      "städfirm",
      "städning",
      "städtjänst",
    ]),
  },
  {
    label: "vård och klinik",
    themes: ["teal", "blue", "green"],
    website: true,
    pattern: stemPattern([
      "tandläkar",
      "tandvård",
      "klinik",
      "vårdcentral",
      "vård",
      "läkare",
      "fysioterap",
      "sjukgymnast",
      "kiropraktor",
      "naprapat",
      "psykolog",
      "terapeut",
      "veterinär",
      "apotek",
      "optiker",
      "mottagning",
    ]),
  },
  {
    label: "barn och lek",
    themes: ["yellow", "lime", "fuchsia"],
    website: true,
    pattern: stemPattern([
      "barn",
      "förskol",
      "lekplats",
      "lekland",
      "kalas",
      "leksak",
      "dagis",
      "fritids",
      "babysim",
      "bebis",
    ]),
  },
  {
    label: "konst och kreativitet",
    themes: ["slate", "violet", "orange"],
    website: true,
    pattern: new RegExp(
      `${
        stemPattern([
          "konstnär",
          "konsthall",
          "konstgalleri",
          "galleri",
          "foto",
          "portfolio",
          "portfölj",
          "designer",
          "designstudio",
          "illustrat",
          "arkitekt",
          "keramik",
          "tatuer",
          "grafisk",
        ]).source
      }|${wordPattern(["konst", "konsten"]).source}`,
    ),
  },
  {
    label: "hav och resor",
    themes: ["blue", "teal", "slate"],
    website: true,
    pattern: new RegExp(
      `${
        stemPattern([
          "havsnära",
          "båt",
          "skärgård",
          "segl",
          "kajak",
          "dykning",
          "dykcenter",
          "resebyrå",
          "turism",
          "turist",
          "hotell",
          "vandrarhem",
          "camping",
          "strand",
          "stuguthyrning",
          "pensionat",
          "fiskecamp",
        ]).source
      }|${wordPattern(["hav", "havet", "marina", "marinan", "sjö", "sjön", "resor", "stuga", "stugor"]).source}`,
    ),
  },
  {
    label: "musik och nattliv",
    themes: ["violet", "indigo", "red"],
    website: true,
    pattern: new RegExp(
      `${
        stemPattern([
          "musik",
          "nattklubb",
          "konsert",
          "festival",
          "livemusik",
          "skivbolag",
          "cocktail",
        ]).source
      }|${wordPattern(["band", "bandet", "dj", "bar", "baren", "klubb", "klubben"]).source}`,
    ),
  },
  {
    label: "sport och energi",
    themes: ["red", "lime", "blue"],
    website: true,
    // "gym" as a stem would also hit "gymnasium".
    pattern: new RegExp(
      `${wordPattern(["gym", "gymmet"]).source}|${
        stemPattern([
          "träning",
          "tränar",
          "sport",
          "fitness",
          "crossfit",
          "löpning",
          "idrott",
          "förening",
          "padel",
          "tennis",
          "golf",
          "fotboll",
          "kampsport",
          "dansskol",
        ]).source
      }`,
    ),
  },
  {
    label: "butik och mode",
    themes: ["slate", "rose", "indigo"],
    website: true,
    pattern: new RegExp(
      `${
        stemPattern([
          "butik",
          "webbutik",
          "webshop",
          "e-handel",
          "modebutik",
          "kläder",
          "klädbutik",
          "smycke",
          "inredning",
          "presentbutik",
          "secondhand",
          "väsk",
        ]).source
      }|${wordPattern(["mode", "modet", "skor"]).source}`,
    ),
  },
  {
    label: "djur",
    themes: ["green", "orange", "blue"],
    website: true,
    // "hund" as a stem would also hit "hundra"; spelled as words plus compounds.
    pattern: new RegExp(
      `${
        stemPattern([
          "hunddagis",
          "hundpensionat",
          "hundsalong",
          "hundfris",
          "hundträn",
          "katt",
          "djur",
          "husdjur",
          "häst",
          "stall",
          "ridskol",
          "trimning",
        ]).source
      }|${wordPattern(["hund", "hunden", "hundar", "hundarna"]).source}`,
    ),
  },
  {
    label: "utbildning",
    themes: ["blue", "teal", "orange"],
    website: true,
    pattern: stemPattern([
      "kurs",
      "utbildning",
      "skola",
      "lärare",
      "språkkurs",
      "körskol",
      "läxhjälp",
      "coach",
      "föreläs",
    ]),
  },
];

/** Mood words nudge the ranking; they never decide a category on their own. */
const MOOD_SIGNALS: Array<{ pattern: RegExp; weights: Partial<Record<ThemeClusterId, number>> }> = [
  {
    pattern: wordPattern([
      "varm",
      "varmt",
      "varma",
      "mysig",
      "mysigt",
      "mysiga",
      "hemtrevlig",
      "hemtrevligt",
      "ombonad",
      "ombonat",
      "personlig",
      "personligt",
    ]),
    weights: { orange: 2, red: 1, yellow: 1, rose: 0.5 },
  },
  {
    pattern: wordPattern([
      "sval",
      "svalt",
      "svala",
      "kylig",
      "frisk",
      "friskt",
      "fräsch",
      "fräscht",
    ]),
    weights: { cyan: 2, teal: 1, blue: 1 },
  },
  {
    pattern: wordPattern([
      "naturlig",
      "naturligt",
      "naturliga",
      "organisk",
      "organiskt",
      "jordnära",
    ]),
    weights: { green: 2, lime: 1 },
  },
  {
    pattern: wordPattern([
      "elegant",
      "eleganta",
      "lyxig",
      "lyxigt",
      "lyxiga",
      "exklusiv",
      "exklusivt",
      "premium",
      "sofistikerad",
      "stilfull",
      "stilfullt",
    ]),
    weights: { indigo: 2, slate: 1.5, violet: 1 },
  },
  {
    pattern: wordPattern([
      "lekfull",
      "lekfullt",
      "lekfulla",
      "färgglad",
      "färgglatt",
      "färgglada",
      "rolig",
      "roligt",
      "energisk",
      "energiskt",
    ]),
    weights: { fuchsia: 2, yellow: 1.5, lime: 1 },
  },
  {
    pattern: wordPattern([
      "minimal",
      "minimalistisk",
      "minimalistiskt",
      "stilren",
      "stilrent",
      "stilrena",
      "avskalad",
      "avskalat",
      "skandinavisk",
      "skandinaviskt",
    ]),
    weights: { slate: 2, cyan: 0.5 },
  },
  {
    pattern: wordPattern([
      "trygg",
      "tryggt",
      "seriös",
      "seriöst",
      "professionell",
      "professionellt",
      "pålitlig",
      "pålitligt",
    ]),
    weights: { blue: 2, indigo: 1 },
  },
  {
    pattern: wordPattern(["modig", "modigt", "kraftfull", "kraftfullt", "djärv", "djärvt", "bold"]),
    weights: { red: 2, fuchsia: 1 },
  },
];

/** A named color in the description outranks every category guess. */
const COLOR_WORDS: Array<{ theme: ThemeClusterId; pattern: RegExp }> = [
  {
    theme: "cyan",
    pattern: wordPattern([
      "ljusblå",
      "ljusblått",
      "ljusblåa",
      "isblå",
      "isblått",
      "turkos",
      "turkost",
      "turkosa",
      "cyan",
      "aqua",
      "mint",
      "mintgrön",
      "mintgrönt",
      "mintgröna",
    ]),
  },
  {
    theme: "indigo",
    pattern: wordPattern([
      "marinblå",
      "marinblått",
      "marinblåa",
      "mörkblå",
      "mörkblått",
      "mörkblåa",
      "midnattsblå",
      "indigo",
      "navy",
    ]),
  },
  {
    theme: "blue",
    pattern: wordPattern([
      "blå",
      "blått",
      "blåa",
      "kungsblå",
      "kungsblått",
      "koboltblå",
      "himmelsblå",
      "blue",
    ]),
  },
  {
    theme: "teal",
    pattern: wordPattern(["petrol", "petrolblå", "lagun", "teal", "havsgrön", "havsgröna"]),
  },
  {
    theme: "lime",
    pattern: wordPattern([
      "lime",
      "limegrön",
      "limegrönt",
      "limegröna",
      "äppelgrön",
      "äppelgröna",
      "neongrön",
    ]),
  },
  {
    theme: "green",
    pattern: wordPattern([
      "grön",
      "grönt",
      "gröna",
      "mörkgrön",
      "mörkgrönt",
      "mörkgröna",
      "ljusgrön",
      "ljusgrönt",
      "ljusgröna",
      "olivgrön",
      "olivgrönt",
      "olivgröna",
      "oliv",
      "skogsgrön",
      "skogsgröna",
      "flaskgrön",
      "salvia",
      "salviagrön",
      "green",
    ]),
  },
  {
    theme: "yellow",
    pattern: wordPattern([
      "gul",
      "gult",
      "gula",
      "senap",
      "senapsgul",
      "citrongul",
      "solgul",
      "guld",
      "gyllene",
      "yellow",
    ]),
  },
  {
    theme: "orange",
    pattern: wordPattern([
      "orange",
      "orangea",
      "bärnsten",
      "terrakotta",
      "rost",
      "rostbrun",
      "koppar",
      "aprikos",
      "persika",
      "brun",
      "brunt",
      "bruna",
      "beige",
      "kanel",
      "karamell",
      "jordfärger",
      "jordtoner",
    ]),
  },
  {
    theme: "red",
    pattern: wordPattern([
      "röd",
      "rött",
      "röda",
      "vinröd",
      "vinrött",
      "vinröda",
      "tegel",
      "tegelröd",
      "tegelröda",
      "körsbärsröd",
      "bordeaux",
      "red",
    ]),
  },
  {
    theme: "fuchsia",
    pattern: wordPattern(["cerise", "magenta", "fuchsia", "knallrosa", "hallonröd", "hallonröda"]),
  },
  {
    theme: "rose",
    pattern: wordPattern([
      "rosa",
      "rose",
      "puderrosa",
      "gammelrosa",
      "korall",
      "korallröd",
      "pink",
    ]),
  },
  {
    theme: "violet",
    pattern: wordPattern([
      "lila",
      "violett",
      "violetta",
      "plommon",
      "lavendel",
      "purpur",
      "aubergine",
      "purple",
    ]),
  },
  {
    theme: "slate",
    pattern: wordPattern([
      "grå",
      "grått",
      "gråa",
      "skiffer",
      "antracit",
      "grafit",
      "svart",
      "svarta",
      "svartvit",
      "svartvitt",
      "monokrom",
      "neutral",
      "neutrala",
    ]),
  },
];

const DARK_WORDS = wordPattern(["mörk", "mörkt", "mörka", "mörker", "dark", "nattsvart"]);
const LIGHT_WORDS = wordPattern([
  "ljus",
  "ljust",
  "ljusa",
  "light",
  "luftig",
  "luftigt",
  "luftiga",
  "vit",
  "vitt",
  "vita",
]);

const WEBSITE_WORDS = stemPattern([
  "hemsid",
  "webbplats",
  "webbsid",
  "sajt",
  "landningssid",
  "blogg",
  "onepager",
  "företagssid",
]);

const APP_WORDS = wordPattern([
  "app",
  "appen",
  "appar",
  "apps",
  "webbapp",
  "webbappen",
  "mobilapp",
  "mobilappen",
  "dashboard",
  "dashboarden",
  "instrumentpanel",
  "adminpanel",
  "admin",
  "crm",
  "bokningssystem",
  "bokningssystemet",
  "system",
  "systemet",
  "verktyg",
  "verktyget",
  "portal",
  "portalen",
  "kundportal",
  "medlemsportal",
  "intranät",
  "saas",
  "plattform",
  "plattformen",
  "inloggning",
]);

/**
 * Without any signal the panel still shows three complete looks: warm, green and
 * neutral cover most small businesses and look clearly different side by side.
 */
export const DEFAULT_SITE_LOOK_THEMES: [ThemeClusterId, ThemeClusterId, ThemeClusterId] = [
  "orange",
  "green",
  "slate",
];

/** Tie-break order (and fill order when fewer than three themes scored). */
const PREFERENCE_ORDER: ThemeClusterId[] = [
  "orange",
  "green",
  "slate",
  "blue",
  "teal",
  "rose",
  "indigo",
  "red",
  "violet",
  "yellow",
  "cyan",
  "lime",
  "fuchsia",
];

export interface SiteLookSuggestion {
  /** Three complete looks for the first level, best match first. */
  themes: [ThemeClusterId, ThemeClusterId, ThemeClusterId];
  /** True when the description gave any color signal; false → neutral defaults. */
  matched: boolean;
  /** Short Swedish basis for the suggestion ("mat och fika"), or null. */
  basis: string | null;
  /** Ljust/mörkt the description asks for, or null when it does not say (or says both). */
  colorMode: "light" | "dark" | null;
}

/** Local palette suggestion for a description. Pure; safe to call per keystroke. */
export function suggestSiteLook(description: string | null | undefined): SiteLookSuggestion {
  const text = normalizeDescription(description ?? "").trim();
  if (!text) {
    return { themes: [...DEFAULT_SITE_LOOK_THEMES], matched: false, basis: null, colorMode: null };
  }

  const scores = new Map<ThemeClusterId, number>();
  const add = (theme: ThemeClusterId, weight: number) =>
    scores.set(theme, (scores.get(theme) ?? 0) + weight);

  let basis: string | null = null;
  for (const category of CATEGORIES) {
    if (!category.pattern.test(text)) continue;
    basis ??= category.label;
    const [first, second, third] = category.themes;
    add(first, 3);
    add(second, 2);
    add(third, 1);
  }
  for (const mood of MOOD_SIGNALS) {
    if (!mood.pattern.test(text)) continue;
    for (const [theme, weight] of Object.entries(mood.weights) as Array<[ThemeClusterId, number]>) {
      add(theme, weight);
    }
  }
  let namedColor = false;
  for (const color of COLOR_WORDS) {
    if (!color.pattern.test(text)) continue;
    namedColor = true;
    add(color.theme, 6);
  }
  basis ??= namedColor ? "färgerna du nämner" : scores.size > 0 ? "stämningen du beskriver" : null;

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort(
      ([a, scoreA], [b, scoreB]) =>
        scoreB - scoreA || PREFERENCE_ORDER.indexOf(a) - PREFERENCE_ORDER.indexOf(b),
    )
    .map(([theme]) => theme);
  const picks: ThemeClusterId[] = [];
  for (const theme of [...ranked, ...PREFERENCE_ORDER]) {
    if (!picks.includes(theme)) picks.push(theme);
    if (picks.length === 3) break;
  }

  const wantsDark = DARK_WORDS.test(text);
  const wantsLight = LIGHT_WORDS.test(text);
  const colorMode = wantsDark === wantsLight ? null : wantsDark ? "dark" : "light";

  return {
    themes: picks as [ThemeClusterId, ThemeClusterId, ThemeClusterId],
    matched: ranked.length > 0,
    basis,
    colorMode,
  };
}

/**
 * Hemsida or app, as far as the description makes it obvious. `null` = unclear
 * (empty, both, or neither) — the panel then keeps the Hemsida/App choice on
 * the first level instead of tucking it under "Fler byggval".
 *
 * Only decides WHERE the choice is shown. The request still carries the user's
 * own choice (`buildTarget`, "auto" by default); this guess is never sent.
 */
export function inferBuildTargetFromDescription(
  description: string | null | undefined,
): "website" | "app" | null {
  const text = normalizeDescription(description ?? "").trim();
  if (!text) return null;
  const app = APP_WORDS.test(text);
  const website =
    WEBSITE_WORDS.test(text) ||
    CATEGORIES.some((category) => category.website && category.pattern.test(text));
  if (app === website) return null;
  return app ? "app" : "website";
}
