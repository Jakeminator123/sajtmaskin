/**
 * Test scaffold matching with Swedish prompts.
 *
 * Runs a curated set of prompts (95% Swedish, matching real user patterns)
 * through matchScaffoldWithEmbeddings and reports how each one was resolved.
 *
 * Usage:  npx tsx scripts/test-scaffold-matching.ts
 */
import { matchScaffoldWithEmbeddings } from "../src/lib/gen/scaffolds/matcher";
import { getAllScaffolds } from "../src/lib/gen/scaffolds/registry";
import type { BuildIntent } from "../src/lib/builder/build-intent";

interface TestCase {
  prompt: string;
  intent: BuildIntent;
  expectedFamily: string;
  label: string;
}

const TEST_CASES: TestCase[] = [
  {
    prompt: "Jag vill ha en hemsida f\u00f6r mitt st\u00e4df\u00f6retag i Malm\u00f6",
    intent: "website",
    expectedFamily: "landing-page",
    label: "St\u00e4df\u00f6retag",
  },
  {
    prompt: "Skapa en sajt f\u00f6r min byr\u00e5 som jobbar med digital marknadsf\u00f6ring",
    intent: "website",
    expectedFamily: "landing-page",
    label: "Marknadsf\u00f6ringsbyr\u00e5",
  },
  {
    prompt: "En enkel sida f\u00f6r min restaurang med meny och \u00f6ppettider",
    intent: "website",
    expectedFamily: "restaurant",
    label: "Restaurang",
  },
  {
    prompt: "Bygg en landningssida f\u00f6r v\u00e5r SaaS-plattform med prisplaner och funktioner",
    intent: "website",
    expectedFamily: "saas-landing",
    label: "SaaS-landing",
  },
  {
    prompt: "Vi lanserar en ny mjukvarutj\u00e4nst med gratis testperiod och tre prispaket",
    intent: "website",
    expectedFamily: "saas-landing",
    label: "Mjukvarutj\u00e4nst",
  },
  {
    prompt: "Portfolio-sida f\u00f6r mig som fotograf med bildgalleri",
    intent: "website",
    expectedFamily: "portfolio",
    label: "Fotograf-portfolio",
  },
  {
    prompt: "Jag \u00e4r designer och vill visa mina projekt p\u00e5 ett snyggt s\u00e4tt",
    intent: "website",
    expectedFamily: "portfolio",
    label: "Designer-portfolio",
  },
  {
    prompt: "Jag vill starta en blogg om matlagning med artiklar och recept",
    intent: "website",
    expectedFamily: "blog",
    label: "Matblogg",
  },
  {
    prompt: "Personlig blogg med kategorier, taggar och s\u00f6kfunktion",
    intent: "website",
    expectedFamily: "blog",
    label: "Personlig blogg",
  },
  {
    prompt: "Bygg en webshop f\u00f6r handgjorda smycken med varukorgar och Stripe-betalning",
    intent: "website",
    expectedFamily: "ecommerce",
    label: "Smyckes-webshop",
  },
  {
    prompt: "E-handel med produktkatalog, filtrering och k\u00f6pfl\u00f6de",
    intent: "website",
    expectedFamily: "ecommerce",
    label: "E-handel generell",
  },
  {
    prompt: "Jag beh\u00f6ver en admin-panel med statistik och anv\u00e4ndarhantering",
    intent: "app",
    expectedFamily: "dashboard",
    label: "Admin-panel",
  },
  {
    prompt: "Bygg ett CRM-verktyg med kontaktlista och pipeline-vy",
    intent: "app",
    expectedFamily: "app-shell",
    label: "CRM-verktyg",
  },
  {
    prompt: "Inloggningssida med registrering och gl\u00f6mt l\u00f6senord",
    intent: "app",
    expectedFamily: "auth-pages",
    label: "Inloggning",
  },
  {
    prompt: "Login och signup med Google OAuth",
    intent: "app",
    expectedFamily: "auth-pages",
    label: "OAuth-login",
  },
  {
    prompt: "En informationssajt med flera undersidor om v\u00e5r kommun",
    intent: "website",
    expectedFamily: "content-site",
    label: "Kommunsajt",
  },
  {
    prompt: "Dokumentationssida med navigation i sidof\u00e4ltet",
    intent: "website",
    expectedFamily: "content-site",
    label: "Dokumentation",
  },
  {
    prompt: "G\u00f6r en fin sida \u00e5t mig",
    intent: "website",
    expectedFamily: "landing-page",
    label: "Vag prompt",
  },
  {
    prompt: "Jag vill ha n\u00e5t snyggt f\u00f6r mitt f\u00f6retag",
    intent: "website",
    expectedFamily: "landing-page",
    label: "Informell f\u00f6retagsprompt",
  },
  {
    prompt: "Boka tid hos fris\u00f6r online",
    intent: "website",
    expectedFamily: "booking",
    label: "Bokningssida (fris\u00f6r)",
  },
  {
    prompt: "V\u00e5r idrottsklubb beh\u00f6ver en sajt med evenemang och medlemsinfo",
    intent: "website",
    expectedFamily: "association",
    label: "Idrottsklubb",
  },
  {
    prompt: "Hemsida f\u00f6r en ideell f\u00f6rening med styrelse och nyheter",
    intent: "website",
    expectedFamily: "association",
    label: "Ideell f\u00f6rening",
  },
  {
    prompt: "Caf\u00e9 i Stockholm med meny, \u00f6ppettider och Instagram-l\u00e4nk",
    intent: "website",
    expectedFamily: "restaurant",
    label: "Caf\u00e9",
  },
  {
    prompt: "Tidsbokning f\u00f6r massage och behandlingar med prislista",
    intent: "website",
    expectedFamily: "booking",
    label: "Massagebokning",
  },
];

const GREEN = "\x1b[92m";
const RED = "\x1b[91m";
const YELLOW = "\x1b[93m";
const CYAN = "\x1b[96m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main() {
  const scaffolds = getAllScaffolds();
  console.log(
    `\n${BOLD}Scaffold-matchningstest (${TEST_CASES.length} svenska prompter, ${scaffolds.length} scaffolds)${RESET}\n`,
  );

  let passed = 0;
  let failed = 0;
  let embeddingHits = 0;
  let keywordHits = 0;

  for (const tc of TEST_CASES) {
    const { scaffold, matchMeta } = await matchScaffoldWithEmbeddings(tc.prompt, tc.intent);
    const matchedId = scaffold?.id ?? "none";
    const ok = matchedId === tc.expectedFamily;

    if (ok) passed++;
    else failed++;

    if (matchMeta.matchSource === "embedding") embeddingHits++;
    else keywordHits++;

    const icon = ok ? `${GREEN}OK${RESET}` : `${RED}MISS${RESET}`;
    const scoreStr =
      matchMeta.embeddingScore != null
        ? `${CYAN}${matchMeta.embeddingScore}${RESET}`
        : `${DIM}---${RESET}`;

    console.log(
      `  ${icon}  ${tc.label.padEnd(25)} -> ${matchedId.padEnd(16)} ${DIM}(via ${matchMeta.matchSource}, score: ${scoreStr}${DIM})${RESET}` +
        (ok ? "" : `  ${YELLOW}forvantade: ${tc.expectedFamily}${RESET}`),
    );
  }

  console.log(
    `\n${BOLD}Resultat:${RESET} ${GREEN}${passed} OK${RESET}, ${failed > 0 ? RED : DIM}${failed} missade${RESET}`,
  );
  console.log(
    `${DIM}Matchkalla: ${keywordHits} nyckelord, ${embeddingHits} embedding${RESET}\n`,
  );

  if (failed > 0) {
    console.log(
      `${YELLOW}Tips: Lagg till svenska nyckelord i matcher.ts eller forbattra scaffold-beskrivningarna.${RESET}\n`,
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(2);
});