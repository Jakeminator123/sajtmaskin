import { publicCanonicalPath } from "@/lib/public-canonical-url";

/**
 * Published blog posts. Sitemap and `/blogg` robots follow this list:
 * noindex + omit from sitemap while empty; indexable as soon as a post exists.
 *
 * Compatible with the empty `PUBLISHED_BLOG_POSTS` contract introduced for
 * editorial gating — we add real posts here.
 */
export type BlogPostSection = {
  heading: string;
  paragraphs: readonly string[];
};

export type PublishedBlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  keyword: string;
  excerpt: string;
  sections: readonly BlogPostSection[];
  faqs: readonly { q: string; a: string }[];
  related: readonly { href: string; label: string }[];
};

export const PUBLISHED_BLOG_POSTS: readonly PublishedBlogPost[] = [
  {
    slug: "vad-kostar-en-hemsida-2026",
    title: "Vad kostar en hemsida 2026?",
    description:
      "Vad som påverkar priset på en hemsida 2026: omfattning, innehåll, drift och arbetssätt. Inga påhittade marknadsstatistik — en praktisk genomgång.",
    publishedAt: "2026-10-18",
    updatedAt: "2026-10-18",
    keyword: "vad kostar en hemsida 2026",
    excerpt:
      "Priset styrs av omfattning, vem som skriver innehållet och hur ni driftar sidan — inte av ett enda magiskt belopp. Så tänker ni 2026.",
    sections: [
      {
        heading: "Det finns inget fast “hemsidepris”",
        paragraphs: [
          "Frågan “vad kostar en hemsida 2026?” har samma svar som tidigare år: det beror på vad sidan ska göra, vem som tar fram texter och bilder, och vad som händer efter publicering. En one-pager med korrekt öppettider är en annan sak än en sajt med inloggning, butik och flera språk.",
          "Den här artikeln ger inga påhittade medelpriser från “marknaden”. Sådana siffror blir snabbt inaktuella och jämför ofta olika saker. I stället: vilka poster ni ska räkna med, och hur arbetssättet ändrar notan.",
          "En mer produktnära genomgång av kostnadsdelar finns på sidan Vad kostar en hemsida. Här håller vi oss till hur ni planerar året ni är i.",
        ],
      },
      {
        heading: "Poster som alltid finns — oavsett verktyg",
        paragraphs: [
          "Skapande: tid att enas om budskap, struktur, design och första publicering. Det kan vara er egen tid, en byrå, en frilansare eller ett builder-verktyg.",
          "Innehåll: texter, foton ni har rätt att använda, ev. översättning. Det här underskattas oftast. Ett tomt “lorem”-utkast är inte en färdig sida.",
          "Domän och drift: namnet ni syns på, och stället sidan ligger. Ibland i samma paket, ibland separat.",
          "Ändringar efteråt: nya priser, ny personal, en kampanj. En sida som ingen får röra blir inaktuell.",
          "Integrationer: formulär som faktiskt kommer fram, bokning, betalkort, nyhetsbrev. Demo-knappar är billiga. Kopplingar som ska hålla i vardagen är det inte.",
        ],
      },
      {
        heading: "Fyra vanliga arbetssätt 2026",
        paragraphs: [
          "Byrå eller frilans: ni köper tid och omdöme. Bra när varumärket eller integrationerna är tunga. Dyrare i kronor, billigare i er kalender om ni inte vill lära er ett verktyg.",
          "Klassiskt CMS (till exempel WordPress): låg start om ni redan kan det, mer ansvar för uppdateringar, tillägg och säkerhet.",
          "Visuell builder med prenumeration: mall och editor, sidan lever ofta i leverantörens hosting. Månadskostnaden är förutsägbar så länge ni stannar.",
          "AI-builder med credits: ni beskriver verksamheten och granskar ett utkast. I Sajtmaskin är credits engångsköp, inte en månadsavgift, och första slutförda genereringen kan ske utan att credits dras. Publicering debiterar credits. Aktuella paket finns på prissidan.",
        ],
      },
      {
        heading: "Vad som faktiskt blivit annorlunda på senare år",
        paragraphs: [
          "Det går fortare att få en första version. Det betyder inte att faktakollen försvunnit. AI kan föreslå struktur och brödtext — ni måste fortfarande rätta namn, priser, öppettider och bildrättigheter.",
          "Prenumeration kontra engångsköp syns tydligare i jämförelser. Räkna tre år framåt: vad betalar ni för editor, vad för drift, vad för att få med er sidan om ni slutar.",
          "Mobilen är inte “en extra vy”. De flesta öppnar sidan i telefon. En offert som bara ser bra ut på bred skärm är ofullständig.",
        ],
      },
      {
        heading: "En enkel plan ni kan göra på en timme",
        paragraphs: [
          "Skriv i en mening vad sidan ska åstadkomma: fler samtal, bokningar, eller bara att ni syns som ett riktigt bolag.",
          "Lista tre bevis ni får använda och minsta innehåll: adress, erbjudande, nästa steg.",
          "Välj arbetssätt efter tempo och vem som underhåller — inte efter vilken logotyp som syns i en annons.",
          "Räkna start plus tre månaders ändringar. Hoppa över “genomsnittspris i Sverige” som ni inte kan källbelägga.",
        ],
      },
    ],
    faqs: [
      {
        q: "Kan ni säga ett belopp i kronor?",
        a: "Inte ett belopp som gäller alla. Omfattning och underhåll styr mer än verktygets startsida. Sajtmaskins egna paket finns på prissidan; de är credits, inte ett fast “hemsidepris”.",
      },
      {
        q: "Är AI alltid billigast 2026?",
        a: "Det kan sänka tiden till första utkast. Det sänker inte automatiskt kostnaden för innehåll, domän, specialintegrationer eller er tid att granska.",
      },
    ],
    related: [
      { href: "/vad-kostar-en-hemsida", label: "Vad kostar en hemsida?" },
      { href: "/hemsideprogram", label: "Jämför hemsideprogram" },
      { href: "/blogg/hemsida-enskild-firma", label: "Hemsida för enskild firma" },
    ],
  },
  {
    slug: "hemsida-enskild-firma",
    title: "Hemsida för enskild firma – steg för steg",
    description:
      "Så tar du fram en hemsida som enskild näringsidkare: vad som måste synas, i vilken ordning, och vad du kan vänta med. Ingen juridisk rådgivning.",
    publishedAt: "2026-10-18",
    updatedAt: "2026-10-18",
    keyword: "hemsida enskild firma",
    excerpt:
      "En enskild firma behöver sällan femton sidor. Den behöver avsändare, erbjudande och ett sätt att bli kontaktad — i rätt ordning.",
    sections: [
      {
        heading: "Vad “hemsida för enskild firma” egentligen betyder",
        paragraphs: [
          "Du är avsändaren. Besökaren vill veta vem hen anlitar, vad du gör, och hur hen når dig. Det är närmare en tydlig visitkortssida än en tidning.",
          "Den här texten är praktisk, inte juridisk rådgivning. Regler för märkning, bokföring och personuppgifter finns hos Bolagsverket, Skatteverket och IMY. Läs där när något ska stå i avtal eller i footern.",
        ],
      },
      {
        heading: "Steg 1 — Skriv pitch och nästa steg",
        paragraphs: [
          "En mening: vad du säljer, till vem, var. “Redovisning för enskilda i Örebro” är bättre än “lösningar för din tillväxt”.",
          "Ett primärt nästa steg du faktiskt svarar på: ring, mejla eller boka. Inte fem knappar.",
        ],
      },
      {
        heading: "Steg 2 — Samla det som måste synas",
        paragraphs: [
          "Företagsnamn så som du använder det mot kunder, och hur man känner igen att det är en enskild firma om det spelar roll för kunden.",
          "Kontakt: telefon eller mejl du läser. Postadress eller område om du tar jobb på plats.",
          "Organisationsnummer när du säljer till andra företag eller när kunden frågar. Det är vanligt på svenska företagssidor.",
          "Två eller tre bevis: uppdrag du får nämna, en kort om-dig, en bild som ser ut som du. Inga påhittade recensioner.",
        ],
      },
      {
        heading: "Steg 3 — Välj minsta sidstruktur",
        paragraphs: [
          "Start: erbjudande + nästa steg. Tjänster: tre kort. Om: du. Kontakt: formulär eller uppgifter. Det räcker för de flesta enskilda.",
          "Blogg, kundcase-arkiv och shop kan vänta. En tom blogg sänker förtroendet mer än ingen blogg.",
          "I Sajtmaskin är taket tre sidor i första bygget. Det matchar den här miniminivån. Extra sidor är merarbete senare.",
        ],
      },
      {
        heading: "Steg 4 — Välj arbetssätt",
        paragraphs: [
          "Gör det själv med en builder om du kan avsätta tid att granska texter. Anlita hjälp om du inte kommer att underhålla sidan.",
          "Beskriv firman i Sajtmaskin, titta på utkastet, rätta namn och påståenden. Credits är engångsköp; första slutförda genereringen kan ske utan att credits dras. Publicering är ett eget steg och debiterar credits.",
        ],
      },
      {
        heading: "Steg 5 — Publicera först när faktan stämmer",
        paragraphs: [
          "Preview är inte live. Kontrollera telefon, område och vad du lovar. Utan egen domän kan den publicerade adressen vara en tillfällig URL. Att koppla en .se du redan äger kan vara stängt i vissa miljöer — planera det som ett senare steg.",
          "Samma namn och telefon som i mejlunderskrift och ev. Google-profil. En siffra som skiljer sig skapar onödiga samtal.",
        ],
      },
      {
        heading: "Vanliga fallgropar för enskilda",
        paragraphs: [
          "Att vänta på den “perfekta” sidan i sex månader. En ärlig one-pager slår ingen sida.",
          "Att kopiera en byrås jargong. Du är personen. Skriv som du pratar med en kund i telefon.",
          "Att gömma kontakt för att “samla leads i ett system” du inte har. Ett mejl räcker.",
          "Att lova tider, garantier eller priser utkastet hittade på. Det är ditt namn på F-skattsedeln.",
        ],
      },
    ],
    faqs: [
      {
        q: "Måste enskild firma ha hemsida enligt lag?",
        a: "Den här artikeln är inte juridisk rådgivning. Många enskilda klarar sig på mejl och en profil. En sida behövs när någon ska kunna slå upp dig, vidarebefordra en länk eller jämföra två leverantörer.",
      },
      {
        q: "Behöver jag eget aktiebolag först?",
        a: "Nej, inte för att publicera en enkel sida. Bolagsform är en separat fråga. Använd det namn och de uppgifter som stämmer med hur du fakturerar i dag.",
      },
      {
        q: "Var börjar jag om jag inte kan kod?",
        a: "Skriv pitchen, samla kontaktuppgifter, välj tre tjänster. Öppna sedan en builder eller be någon hjälpa till. Guiden Skapa hemsida utan kod går igenom vad du kan göra själv.",
      },
    ],
    related: [
      { href: "/hemsida-till-foretag", label: "Hemsida till företag" },
      { href: "/hemsida-utan-kod", label: "Hemsida utan kod" },
      { href: "/hemsida-konsult", label: "Hemsida för konsult" },
      { href: "/skapa-hemsida", label: "Skapa hemsida" },
    ],
  },
  {
    slug: "skapa-hemsida-med-ai-sa-funkar-det",
    title: "Skapa hemsida med AI: så funkar det",
    description:
      "Så fungerar det att skapa hemsida med AI i praktiken: brief, utkast, granskning och publicering. Vad du fortfarande måste göra själv.",
    publishedAt: "2026-10-18",
    updatedAt: "2026-10-18",
    keyword: "skapa hemsida med AI",
    excerpt:
      "AI kan ta fram en första version i kod. Den kan inte ta ansvar för era priser, bilder eller om sidan får gå live. Så ser flödet ut.",
    sections: [
      {
        heading: "Vad “skapa hemsida med AI” betyder — och inte",
        paragraphs: [
          "En chatt kan skriva brödtext. En hemsidebyggare ska också ge struktur, layout och något ni kan öppna som en sajt. I Sajtmaskin är resultatet kod i en preview, inte bara ett dokument.",
          "AI gissar utifrån er beskrivning. Den känner inte era öppettider, era avtal eller vilka foton ni får använda. Granskning är en del av arbetet, inte ett extra moment för pedanter.",
          "Den produktnära steg-för-steg-sidan Skapa hemsida med AI visar flödet i verktyget. Den här artikeln förklarar vad ni som människor gör före, under och efter.",
        ],
      },
      {
        heading: "Före: en brief som går att bygga på",
        paragraphs: [
          "Skriv vad ni gör, för vem, var ni finns, och vad besökaren ska göra. Ju mer konkret, desto mindre hittepå i utkastet.",
          "Ha priser, namn på personal och tre bilder ni äger till hands. Utan det fyller modellen luckor — ibland felaktigt.",
          "Säg vad ni inte är. “Ingen e-handel i v1” eller “bara Östergötland” hindrar extra sektioner ni måste rensa.",
        ],
      },
      {
        heading: "Under: utkast, inte leverans",
        paragraphs: [
          "Ni beskriver, får en första version, tittar i preview. I Sajtmaskin ändrar ni sedan med vanliga meningar och sektionsredigering. Första bygget har taket tre sidor.",
          "Ett konto får en första slutförd generering utan att credits dras. Mallimport räknas inte som den gratis genereringen. Vidare ändringar och publicering använder credits som engångsköp.",
          "Läs varje påstående högt. Skulle ni säga det till en kund i telefon? Om inte — rätta eller ta bort.",
        ],
      },
      {
        heading: "Efter: publicering är ett beslut",
        paragraphs: [
          "Preview är inte publicering. När ni publicerar syns sidan på en adress. Utan egen domän kan det vara en Vercel-adress. Egen domän kopplas när ni är redo — och kan vara stängd i vissa miljöer.",
          "Formulär, bokning och betalning i första utkastet är ofta demo tills ni uttryckligen bygger dem. Räkna inte med att “kontakta oss” mejlar er förrän ni testat.",
          "Inloggad ägare kan exportera koden som ZIP eller till GitHub. Med följer den genererade koden, inte databas, nycklar eller domän.",
        ],
      },
      {
        heading: "När AI-vägen inte är rätt",
        paragraphs: [
          "Ni behöver en butik, tunga integrationer eller ett varumärkesarbete som tar månader. Då är byrå eller kod från start ärligare.",
          "Ni vägrar läsa utkastet. Då är en billig första version bara ett snabbt sätt att publicera fel.",
          "Jämför gärna med andra AI-verktyg efter mål: företagssida versus app. Sidan AI-hemsidebyggare tar upp valkriterier utan ranking.",
        ],
      },
    ],
    faqs: [
      {
        q: "Kan AI skapa en hel hemsida åt mig?",
        a: "Den kan skapa en första version: struktur, layout och texter. Den kan inte intyga att uppgifterna stämmer. Publicering är ert beslut.",
      },
      {
        q: "Behöver jag kunna koda?",
        a: "Nej för att ta fram och ändra ett utkast i Sajtmaskin. Kod ger mer kontroll senare, och exporten finns om ni vill ta med filerna.",
      },
      {
        q: "Hur lång tid tar det?",
        a: "Första utkastet kan komma snabbt. Tiden ni ska räkna med är att samla fakta och rätta. Det är samma tid ni annars betalar någon annan för att gissa.",
      },
    ],
    related: [
      { href: "/skapa-hemsida-med-ai", label: "Skapa hemsida med AI" },
      { href: "/ai-hemsidebyggare", label: "AI-hemsidebyggare" },
      { href: "/hemsida-utan-kod", label: "Hemsida utan kod" },
      { href: "/blogg/vad-kostar-en-hemsida-2026", label: "Vad kostar en hemsida 2026?" },
    ],
  },
];

export function hasPublishedBlogPosts(
  posts: readonly { slug: string; title: string }[] = PUBLISHED_BLOG_POSTS,
): boolean {
  return posts.length > 0;
}

export function getPublishedBlogPost(slug: string): PublishedBlogPost | undefined {
  return PUBLISHED_BLOG_POSTS.find((post) => post.slug === slug);
}

export function getIndexableBlogRelPaths(
  posts: readonly PublishedBlogPost[] = PUBLISHED_BLOG_POSTS,
): string[] {
  if (!hasPublishedBlogPosts(posts)) return [];
  return ["/blogg", ...posts.map((post) => `/blogg/${post.slug}`)];
}

export function blogPostCanonical(slug: string): string {
  return publicCanonicalPath(`/blogg/${slug}`);
}
