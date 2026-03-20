/**
 * Test scaffold matching with Swedish prompts.
 *
 * 80+ test cases organized by SNI (Svensk Naringsgrensindelning) industry
 * categories, covering realistic Swedish user prompts across all 13 scaffolds.
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
  // ===================================================================
  // LANDING-PAGE - Generella foretag, bygg, transport, juridik, finans
  // ===================================================================
  { prompt: "Jag vill ha en hemsida f\u00f6r mitt st\u00e4df\u00f6retag i Malm\u00f6", intent: "website", expectedFamily: "landing-page", label: "St\u00e4df\u00f6retag" },
  { prompt: "Skapa en sajt f\u00f6r min byr\u00e5 som jobbar med digital marknadsf\u00f6ring", intent: "website", expectedFamily: "landing-page", label: "Marknadsf\u00f6ringsbyr\u00e5" },
  { prompt: "Hemsida f\u00f6r v\u00e5r byggfirma med referensprojekt och kontakt", intent: "website", expectedFamily: "landing-page", label: "Byggfirma" },
  { prompt: "Vi \u00e4r snickare och beh\u00f6ver en sajt med bilder p\u00e5 v\u00e5ra renoveringar", intent: "website", expectedFamily: "landing-page", label: "Snickare" },
  { prompt: "Elektriker i Stockholm \u2014 sida med tj\u00e4nster och offertf\u00f6rfr\u00e5gan", intent: "website", expectedFamily: "landing-page", label: "Elektriker" },
  { prompt: "R\u00f6rmokare och VVS-firma, enkel hemsida med priser", intent: "website", expectedFamily: "landing-page", label: "R\u00f6rmokare/VVS" },
  { prompt: "Hemsida f\u00f6r v\u00e5r m\u00e5lerifirma \u2014 m\u00e5lare med bilder p\u00e5 renoveringar", intent: "website", expectedFamily: "landing-page", label: "M\u00e5lare" },
  { prompt: "Takl\u00e4ggare i G\u00f6teborg \u2014 vi l\u00e4gger tak och g\u00f6r pl\u00e5tarbeten", intent: "website", expectedFamily: "landing-page", label: "Takl\u00e4ggare" },
  { prompt: "Sida f\u00f6r v\u00e5rt \u00e5keri med fordonspark och kontaktuppgifter", intent: "website", expectedFamily: "landing-page", label: "\u00c5keri" },
  { prompt: "Hemsida f\u00f6r v\u00e5r flyttfirma med prisber\u00e4kning", intent: "website", expectedFamily: "landing-page", label: "Flyttfirma" },
  { prompt: "Transport och logistik \u2014 f\u00f6retagssida med tj\u00e4nstebeskrivning", intent: "website", expectedFamily: "landing-page", label: "Transportbolag" },
  { prompt: "Redovisningsbyr\u00e5 som beh\u00f6ver en professionell hemsida", intent: "website", expectedFamily: "landing-page", label: "Redovisningsbyr\u00e5" },
  { prompt: "Revisor med bokf\u00f6ring och skatter\u00e5dgivning, enkel webbplats", intent: "website", expectedFamily: "landing-page", label: "Revisor" },
  { prompt: "F\u00f6rs\u00e4kringsf\u00f6rmedlare \u2014 sajt med v\u00e5ra tj\u00e4nster och r\u00e5dgivning", intent: "website", expectedFamily: "landing-page", label: "F\u00f6rs\u00e4kringsbolag" },
  { prompt: "Advokatbyr\u00e5 i Malm\u00f6 med fokus p\u00e5 aff\u00e4rsjuridik", intent: "website", expectedFamily: "landing-page", label: "Advokatbyr\u00e5" },
  { prompt: "Jurist specialiserad p\u00e5 familjer\u00e4tt, beh\u00f6ver en sajt", intent: "website", expectedFamily: "landing-page", label: "Juristbyr\u00e5" },
  { prompt: "Fastighetsm\u00e4klare som vill visa objekt och kundrecensioner", intent: "website", expectedFamily: "landing-page", label: "Fastighetsm\u00e4klare" },
  { prompt: "Bemanningsf\u00f6retag med rekrytering och uthyrning av personal", intent: "website", expectedFamily: "landing-page", label: "Bemanningsf\u00f6retag" },
  { prompt: "S\u00e4kerhetsf\u00f6retag med larm och bevakning \u2014 f\u00f6retagssida", intent: "website", expectedFamily: "landing-page", label: "S\u00e4kerhetsf\u00f6retag" },
  { prompt: "Reklamb\u0079r\u00e5 med tj\u00e4nster och kundlista", intent: "website", expectedFamily: "landing-page", label: "Reklamb\u0079r\u00e5" },
  { prompt: "PR-byr\u00e5 i Stockholm som beh\u00f6ver en snygg sajt", intent: "website", expectedFamily: "landing-page", label: "PR-byr\u00e5" },
  { prompt: "Begravningsbyr\u00e5 med information om ceremonier och kontakt", intent: "website", expectedFamily: "landing-page", label: "Begravningsbyr\u00e5" },
  { prompt: "G\u00e5rdsbutik och lantbruk \u2014 hemsida med produkter och bes\u00f6kstider", intent: "website", expectedFamily: "landing-page", label: "Lantbruk/g\u00e5rd" },
  { prompt: "Tillverkningsf\u00f6retag med industriprodukter och fabriksinformation", intent: "website", expectedFamily: "landing-page", label: "Tillverkningsindustri" },
  { prompt: "G\u00f6r en fin sida \u00e5t mig", intent: "website", expectedFamily: "landing-page", label: "Vag prompt" },
  { prompt: "Jag vill ha n\u00e5t snyggt f\u00f6r mitt f\u00f6retag", intent: "website", expectedFamily: "landing-page", label: "Informell f\u00f6retagsprompt" },
  { prompt: "Bilverkstad med priser och onlinebokning av service", intent: "website", expectedFamily: "landing-page", label: "Bilverkstad" },

  // ===================================================================
  // RESTAURANT - Mat, dryck, cafe, hotell (SNI I)
  // ===================================================================
  { prompt: "En enkel sida f\u00f6r min restaurang med meny och \u00f6ppettider", intent: "website", expectedFamily: "restaurant", label: "Restaurang" },
  { prompt: "Caf\u00e9 i Stockholm med meny, \u00f6ppettider och Instagram-l\u00e4nk", intent: "website", expectedFamily: "restaurant", label: "Caf\u00e9" },
  { prompt: "Pizzeria med meny och leveransinfo", intent: "website", expectedFamily: "restaurant", label: "Pizzeria" },
  { prompt: "V\u00e5r bistro beh\u00f6ver en sida med meny och bordsbokning", intent: "website", expectedFamily: "restaurant", label: "Bistro" },
  { prompt: "Pub och bar med \u00f6lmeny och evenemang", intent: "website", expectedFamily: "restaurant", label: "Pub/bar" },
  { prompt: "Konditori och bageri med sortiment och \u00f6ppettider", intent: "website", expectedFamily: "restaurant", label: "Bageri/konditori" },
  { prompt: "Sushi och ramen med meny och take-away", intent: "website", expectedFamily: "restaurant", label: "Sushi" },
  { prompt: "Catering-f\u00f6retag med meny och offertf\u00f6rfr\u00e5gan f\u00f6r hotell", intent: "website", expectedFamily: "restaurant", label: "Catering/hotell" },
  { prompt: "Food truck med veckans meny och karta var vi st\u00e5r", intent: "website", expectedFamily: "restaurant", label: "Food truck" },

  // ===================================================================
  // BOOKING - Halsa, vard, skonhet, tidsbokning (SNI Q + S96)
  // ===================================================================
  { prompt: "Boka tid hos fris\u00f6r online", intent: "website", expectedFamily: "booking", label: "Fris\u00f6rbokning" },
  { prompt: "Tidsbokning f\u00f6r massage och behandlingar med prislista", intent: "website", expectedFamily: "booking", label: "Massagebokning" },
  { prompt: "Psykologmottagning med tidsbokning och information om behandling", intent: "website", expectedFamily: "booking", label: "Psykologmottagning" },
  { prompt: "Fysioterapeut med bokning av behandlingstider online", intent: "website", expectedFamily: "booking", label: "Fysioterapeut" },
  { prompt: "Spa och wellness med bokningssystem och behandlingsmeny", intent: "website", expectedFamily: "booking", label: "Spa/wellness" },
  { prompt: "Klinik f\u00f6r hudv\u00e5rd med tidsbokning och behandling", intent: "website", expectedFamily: "booking", label: "Hudv\u00e5rdsklinik" },
  { prompt: "Veterin\u00e4r med bokning och info om vaccinationer", intent: "website", expectedFamily: "booking", label: "Veterin\u00e4rklinik" },
  { prompt: "Personlig tr\u00e4nare \u2014 boka konsultation och schemal\u00e4ggning", intent: "website", expectedFamily: "booking", label: "Personlig tr\u00e4nare" },
  { prompt: "Nagelstudio med tidsbokning f\u00f6r gel\u00e9naglar och manikyr", intent: "website", expectedFamily: "booking", label: "Nagelstudio" },
  { prompt: "Tandl\u00e4karmottagning med lediga tider och bokning", intent: "website", expectedFamily: "booking", label: "Tandl\u00e4kare" },

  // ===================================================================
  // SAAS-LANDING - Mjukvara, SaaS, prenumerationsplattformar (SNI J62)
  // ===================================================================
  { prompt: "Bygg en landningssida f\u00f6r v\u00e5r SaaS-plattform med prisplaner och funktioner", intent: "website", expectedFamily: "saas-landing", label: "SaaS-landing" },
  { prompt: "Vi lanserar en ny mjukvarutj\u00e4nst med gratis testperiod och tre prispaket", intent: "website", expectedFamily: "saas-landing", label: "Mjukvarutj\u00e4nst" },
  { prompt: "Faktureringsverktyg online med prisplaner och gratis testperiod", intent: "website", expectedFamily: "saas-landing", label: "Faktureringsverktyg" },
  { prompt: "Bokf\u00f6ring online med abonnemang och prisplaner", intent: "website", expectedFamily: "saas-landing", label: "Bokf\u00f6ringsprogram" },
  { prompt: "Projekthanteringsplattform med subscription och olika prispaket", intent: "website", expectedFamily: "saas-landing", label: "Projektverktyg" },

  // ===================================================================
  // PORTFOLIO - Kreativa yrken, arkitektur, konst (SNI M71 + R)
  // ===================================================================
  { prompt: "Portfolio-sida f\u00f6r mig som fotograf med bildgalleri", intent: "website", expectedFamily: "portfolio", label: "Fotograf-portfolio" },
  { prompt: "Jag \u00e4r designer och vill visa mina projekt p\u00e5 ett snyggt s\u00e4tt", intent: "website", expectedFamily: "portfolio", label: "Designer-portfolio" },
  { prompt: "Arkitektkontor med portfolio och projektgalleri", intent: "website", expectedFamily: "portfolio", label: "Arkitektkontor" },
  { prompt: "Konstn\u00e4r som vill visa sina verk i ett galleri", intent: "website", expectedFamily: "portfolio", label: "Konstn\u00e4r" },
  { prompt: "Musiker och band \u2014 sida med musik, turn\u00e9datum och bilder", intent: "website", expectedFamily: "portfolio", label: "Musiker/band" },
  { prompt: "Inredare med portfolio av genomf\u00f6rda projekt och kundbilder", intent: "website", expectedFamily: "portfolio", label: "Inredare" },
  { prompt: "Filmare och regiss\u00f6r med showreel och projektlista", intent: "website", expectedFamily: "portfolio", label: "Filmare/regiss\u00f6r" },
  { prompt: "Tatuerare med galleri och verk fr\u00e5n mina projekt", intent: "website", expectedFamily: "portfolio", label: "Tatuerare" },

  // ===================================================================
  // BLOG - Innehall, nyhetsbrev, podcast
  // ===================================================================
  { prompt: "Jag vill starta en blogg om matlagning med artiklar och recept", intent: "website", expectedFamily: "blog", label: "Matblogg" },
  { prompt: "Personlig blogg med kategorier, taggar och s\u00f6kfunktion", intent: "website", expectedFamily: "blog", label: "Personlig blogg" },
  { prompt: "Reseblogg med reseber\u00e4ttelser, foton och tips", intent: "website", expectedFamily: "blog", label: "Reseblogg" },
  { prompt: "Podcast med avsnitt, nyhetsbrev och tips", intent: "website", expectedFamily: "blog", label: "Poddsida" },
  { prompt: "Modeblogg med artiklar, lookbooks och samarbeten", intent: "website", expectedFamily: "blog", label: "Modeblogg" },
  { prompt: "Teknikblogg med recensioner och inl\u00e4gg om nya prylar", intent: "website", expectedFamily: "blog", label: "Teknikblogg" },

  // ===================================================================
  // ECOMMERCE - Webshop, butik, e-handel (SNI G)
  // ===================================================================
  { prompt: "Bygg en webshop f\u00f6r handgjorda smycken med varukorgar och Stripe-betalning", intent: "website", expectedFamily: "ecommerce", label: "Smyckes-webshop" },
  { prompt: "E-handel med produktkatalog, filtrering och k\u00f6pfl\u00f6de", intent: "website", expectedFamily: "ecommerce", label: "E-handel generell" },
  { prompt: "N\u00e4tbutik med kl\u00e4der och mode, varukorg och betalning", intent: "website", expectedFamily: "ecommerce", label: "Kl\u00e4dbutik online" },
  { prompt: "Webbshop f\u00f6r presenter och g\u00e5vor med produktbilder", intent: "website", expectedFamily: "ecommerce", label: "Presentbutik" },
  { prompt: "Online-butik f\u00f6r inredning och m\u00f6bler med kassa", intent: "website", expectedFamily: "ecommerce", label: "Inredningsbutik" },
  { prompt: "H\u00e4lsokost-butik online med produkter och best\u00e4llning", intent: "website", expectedFamily: "ecommerce", label: "H\u00e4lsokostbutik" },

  // ===================================================================
  // DASHBOARD - Admin, analys, statistik
  // ===================================================================
  { prompt: "Jag beh\u00f6ver en admin-panel med statistik och anv\u00e4ndarhantering", intent: "app", expectedFamily: "dashboard", label: "Admin-panel" },
  { prompt: "Analysverktyg med diagram, rapporter och nyckeltal", intent: "app", expectedFamily: "dashboard", label: "Analysverktyg" },
  { prompt: "Instrumentpanel f\u00f6r att \u00f6vervaka serverresurser och statistik", intent: "app", expectedFamily: "dashboard", label: "Serverpanel" },

  // ===================================================================
  // APP-SHELL - CRM, verktyg, applikationer
  // ===================================================================
  { prompt: "Bygg ett CRM-verktyg med kontaktlista och pipeline-vy", intent: "app", expectedFamily: "app-shell", label: "CRM-verktyg" },
  { prompt: "Projekthanteringsapp med kanban-tavla och anv\u00e4ndarinst\u00e4llningar", intent: "app", expectedFamily: "app-shell", label: "Projekthanteringsapp" },
  { prompt: "Internt verktyg f\u00f6r att hantera inventarier och sidopanel", intent: "app", expectedFamily: "app-shell", label: "Inventariehantering" },

  // ===================================================================
  // AUTH-PAGES - Inloggning, registrering
  // ===================================================================
  { prompt: "Inloggningssida med registrering och gl\u00f6mt l\u00f6senord", intent: "app", expectedFamily: "auth-pages", label: "Inloggning" },
  { prompt: "Login och signup med Google OAuth", intent: "app", expectedFamily: "auth-pages", label: "OAuth-login" },
  { prompt: "Sida f\u00f6r registrering med verifiering och tv\u00e5faktor", intent: "app", expectedFamily: "auth-pages", label: "Registrering + 2FA" },

  // ===================================================================
  // CONTENT-SITE - Dokumentation, skola, kommun, museum (SNI O + P + R)
  // ===================================================================
  { prompt: "En informationssajt med flera undersidor om v\u00e5r kommun", intent: "website", expectedFamily: "content-site", label: "Kommunsajt" },
  { prompt: "Dokumentationssida med navigation i sidof\u00e4ltet", intent: "website", expectedFamily: "content-site", label: "Dokumentation" },
  { prompt: "Skolans hemsida med kurser, schema och information f\u00f6r f\u00f6r\u00e4ldrar", intent: "website", expectedFamily: "content-site", label: "Skolwebbplats" },
  { prompt: "Museum med utst\u00e4llningar, guider och bes\u00f6ksinformation", intent: "website", expectedFamily: "content-site", label: "Museum" },
  { prompt: "Kunskapsbas med artiklar, FAQ och s\u00f6kfunktion", intent: "website", expectedFamily: "content-site", label: "Kunskapsbas/FAQ" },
  { prompt: "Bibliotek med s\u00f6kfunktion, \u00f6ppettider och dokumentation", intent: "website", expectedFamily: "content-site", label: "Bibliotek" },

  // ===================================================================
  // ASSOCIATION - Foreningar, klubbar, stiftelser (SNI S94)
  // ===================================================================
  { prompt: "V\u00e5r idrottsklubb beh\u00f6ver en sajt med evenemang och medlemsinfo", intent: "website", expectedFamily: "association", label: "Idrottsklubb" },
  { prompt: "Hemsida f\u00f6r en ideell f\u00f6rening med styrelse och nyheter", intent: "website", expectedFamily: "association", label: "Ideell f\u00f6rening" },
  { prompt: "BRF-sajt med bostadsr\u00e4ttsf\u00f6rening, styrelse och dokument", intent: "website", expectedFamily: "association", label: "BRF" },
  { prompt: "Studentf\u00f6rening med evenemang, medlemmar och bli medlem", intent: "website", expectedFamily: "association", label: "Studentf\u00f6rening" },
  { prompt: "Hembygdsf\u00f6rening med arkiv, evenemang och styrelse", intent: "website", expectedFamily: "association", label: "Hembygdsf\u00f6rening" },
  { prompt: "Scoutk\u00e5r med aktiviteter, medlemmar och kontakt", intent: "website", expectedFamily: "association", label: "Scoutk\u00e5r" },
  { prompt: "Kyrka och f\u00f6rsamling med gudstj\u00e4nster och samfund", intent: "website", expectedFamily: "association", label: "Kyrka/f\u00f6rsamling" },
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

  const failures: Array<{ label: string; got: string; expected: string }> = [];
  let currentCategory = "";

  for (const tc of TEST_CASES) {
    const { scaffold, matchMeta } = await matchScaffoldWithEmbeddings(tc.prompt, tc.intent);
    const matchedId = scaffold?.id ?? "none";
    const ok = matchedId === tc.expectedFamily;

    if (ok) passed++;
    else {
      failed++;
      failures.push({ label: tc.label, got: matchedId, expected: tc.expectedFamily });
    }

    if (matchMeta.matchSource === "embedding") embeddingHits++;
    else keywordHits++;

    const icon = ok ? `${GREEN}OK${RESET}` : `${RED}MISS${RESET}`;
    const scoreStr =
      matchMeta.embeddingScore != null
        ? `${CYAN}${matchMeta.embeddingScore}${RESET}`
        : `${DIM}---${RESET}`;

    const expectedCategory = tc.expectedFamily;
    if (expectedCategory !== currentCategory) {
      currentCategory = expectedCategory;
      console.log(`\n  ${DIM}-- ${expectedCategory} --${RESET}`);
    }

    console.log(
      `  ${icon}  ${tc.label.padEnd(25)} -> ${matchedId.padEnd(16)} ${DIM}(via ${matchMeta.matchSource}, score: ${scoreStr}${DIM})${RESET}` +
        (ok ? "" : `  ${YELLOW}expected: ${tc.expectedFamily}${RESET}`),
    );
  }

  console.log(
    `\n${BOLD}Resultat:${RESET} ${GREEN}${passed} OK${RESET}, ${failed > 0 ? RED : DIM}${failed} missade${RESET}`,
  );
  console.log(
    `${DIM}Matchkalla: ${keywordHits} nyckelord, ${embeddingHits} embedding${RESET}`,
  );
  console.log(
    `${DIM}Tackning: ${TEST_CASES.length} prompter, ${scaffolds.length} scaffolds, ${new Set(TEST_CASES.map(t => t.expectedFamily)).size} kategorier${RESET}\n`,
  );

  if (failures.length > 0) {
    console.log(`${YELLOW}Missade:${RESET}`);
    for (const f of failures) {
      console.log(`  ${RED}x${RESET} ${f.label}: fick ${RED}${f.got}${RESET}, forvantade ${GREEN}${f.expected}${RESET}`);
    }
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(2);
});