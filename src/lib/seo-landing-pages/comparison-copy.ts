export type ComparisonFaq = { q: string; a: string };

export type ComparisonCopy = {
  slug: "squarespace-alternativ" | "one-com-alternativ";
  competitorName: string;
  updatedAtIso: string;
  updatedAtLabel: string;
  eyebrow: string;
  lead: string;
  ctaLabel: string;
  previewLeftTitle: string;
  previewLeftBody: string;
  previewRightTitle: string;
  previewRightBody: string;
  previewCaption: string;
  criteriaLead: string;
  criteria: readonly { title: string; them: string; sm: string }[];
  chooseThemHeading: string;
  chooseThem: readonly string[];
  chooseSmHeading: string;
  chooseSm: readonly string[];
  stepsHeading: string;
  steps: readonly { title: string; body: string }[];
  noteHeading: string;
  note: string;
  faqs: readonly ComparisonFaq[];
};

export const COMPARISON_UPDATED_AT_ISO = "2026-10-18";

export const COMPARISON_COPY = {
  "squarespace-alternativ": {
    slug: "squarespace-alternativ",
    competitorName: "Squarespace",
    updatedAtIso: COMPARISON_UPDATED_AT_ISO,
    updatedAtLabel: "18 oktober 2026",
    eyebrow: "Jämförelse · skriven av Sajtmaskin",
    lead:
      "Squarespace och Sajtmaskin löser samma behov på olika sätt: välj mall och finslipa visuellt, eller beskriv verksamheten och granska ett utkast i kod. Jämför arbetssätt, hosting och hur ni betalar — inte featurelistor. Inga Squarespace-belopp här; de ändras och finns bara hos dem.",
    ctaLabel: "Prova med er beskrivning",
    previewLeftTitle: "Squarespace",
    previewLeftBody: "Mall · visuell editor · deras hosting",
    previewRightTitle: "Sajtmaskin",
    previewRightBody: "Beskrivning → utkast · credits",
    previewCaption:
      "Två arbetssätt, inte en ranking. Senast uppdaterad 18 oktober 2026. Skriven av Sajtmaskin.",
    criteriaLead:
      "Squarespace-raderna är stämda mot hur de brukar beskriva sig: mallar, designverktyg och att sajten lever i deras miljö. Verifiera aktuellt utbud hos Squarespace. Sajtmaskin-raderna är stämda mot produkten här.",
    criteria: [
      {
        title: "Editor",
        them: "Visuell editor ovanpå en mall. Ni flyttar block, byter typsnitt och justerar bilder. AI-hjälp kan finnas i deras verktyg — kolla deras docs samma vecka.",
        sm: "Beskrivning blir ett utkast. Därefter följdtext och sektionsredigering — inte punkt-och-klicka på en canvas.",
      },
      {
        title: "Designkontroll",
        them: "Starkt när ni vill att sidan ska kännas som en tidning eller ett varumärke, och ni trivs i deras mallfamilj.",
        sm: "Kontroll via innehåll och struktur efter generering. Pixeljustering är inte huvudvägen.",
      },
      {
        title: "Tempo till v1",
        them: "Högt om ni redan valt mall och har bilder. Lägre om ni slåss med mallens grid.",
        sm: "Högt när briefen är tydlig och ni granskar namn, tider och bilder i utkastet.",
      },
      {
        title: "Publicering och hosting",
        them: "Sajten hostas hos Squarespace. Egen domän och att ta bort deras märkning hör typiskt till betalda planer — belopp bara hos dem.",
        sm: "Preview är inte publicering. Utan egen domän får en publicerad sajt en Vercel-adress. Koppling av en domän ni redan äger kan vara stängd i vissa miljöer.",
      },
      {
        title: "Betalmodell",
        them: "Prenumeration för att hålla sajten publicerad i deras miljö. Planer och valuta varierar. Kolla Squarespace, inte den här sidan.",
        sm: "Credits som engångsköp, utan prenumeration. Publicering debiterar credits. Ett konto får en första slutförd generering gratis.",
      },
      {
        title: "Exit",
        them: "Innehåll kan ofta exporteras som CSV eller liknande enligt deras docs. Räkna inte med en komplett, körklar kopia av hela sajten utanför deras plattform.",
        sm: "Inloggad ägare kan ladda ner koden som ZIP eller exportera till GitHub. Med följer den genererade koden — inte databas, API-nycklar eller domän.",
      },
    ],
    chooseThemHeading: "Välj Squarespace om…",
    chooseThem: [
      "Ni vill styra look-and-feel i en visuell editor och redan gillar deras mallar.",
      "Portfolion eller varumärket är poängen, och ni accepterar att sajten lever i deras hosting.",
      "Teamet redan kan Squarespace-flödet och inte vill byta arbetssätt.",
    ],
    chooseSmHeading: "Överväg Sajtmaskin om…",
    chooseSm: [
      "Ni vill starta från en svensk beskrivning och granska ett utkast, inte välja mall först.",
      "Första bygget räcker med taket tre sidor, och ni vill kunna ta med koden som ZIP eller GitHub.",
      "Ni föredrar credits som engångsköp framför en löpande plattformsprenumeration.",
    ],
    stepsHeading: "Tre steg innan ni byter från Squarespace",
    steps: [
      {
        title: "Kartlägg vad som sitter i mallen",
        body: "Vilka block, blogg, butik eller bokning ni faktiskt använder — och vad som bara är dekoration.",
      },
      {
        title: "Testa samma brief",
        body: "Bygg samma enkla sida i Sajtmaskin med er riktiga pitch. Jämför hur ni ändrar text utan att förstöra layout.",
      },
      {
        title: "Räkna flytten",
        body: "Texter, bilder, redirects och domän. Ingen one-click-migration. Planera 301 från gamla URL:er.",
      },
    ],
    noteHeading: "Ingen one-click-flytt",
    note:
      "Räkna med att flytta innehåll manuellt. Vi lovar ingen automatisk migration från Squarespace. Domänbyte är ett eget steg. I Sajtmaskin är credits engångsköp; publicering debiterar credits. Squarespace-priser publiceras inte här — de ändras och ska läsas hos dem.",
    faqs: [
      {
        q: "Är Sajtmaskin bättre än Squarespace?",
        a: "Det beror på arbetssätt. Squarespace är starkt för visuell mall och varumärkeskänsla. Sajtmaskin är starkt för beskrivning → utkast och kod ni kan exportera. Sidan är skriven av Sajtmaskin.",
      },
      {
        q: "Vad kostar Squarespace?",
        a: "Inga belopp här. De säljer prenumerationer; planer och valuta varierar. Titta på Squarespace egna prissidor samma vecka ni beslutar.",
      },
      {
        q: "Har Squarespace AI?",
        a: "De har beskrivit AI-hjälp i design- och textflöden. Det ändrar inte grundskillnaden: ni landar i deras editor och hosting, eller i ett genererat utkast ni granskar som följdtext. Verifiera aktuellt läge hos dem.",
      },
      {
        q: "Kan ni flytta min Squarespace-sida automatiskt?",
        a: "Nej. Räkna med manuell flytt av texter, bilder och SEO-titlar. Planera redirects. I Sajtmaskin kan koppling av en domän ni redan äger vara stängd; köp i appen är inte allmänt live.",
      },
      {
        q: "Vem har skrivit den här sidan?",
        a: "Sajtmaskin. Senast uppdaterad 18 oktober 2026. Verifiera Squarespace-fakta hos Squarespace innan ni byter.",
      },
    ],
  },
  "one-com-alternativ": {
    slug: "one-com-alternativ",
    competitorName: "one.com",
    updatedAtIso: COMPARISON_UPDATED_AT_ISO,
    updatedAtLabel: "18 oktober 2026",
    eyebrow: "Jämförelse · skriven av Sajtmaskin",
    lead:
      "one.com är i Sverige mest känt som stället man köper domän och hosting — och de har också ett hemsideprogram, tidvis med AI-hjälp. Sajtmaskin är en AI-builder med credits, inte ett webbhotell. Jämför om ni behöver paket (adress + drift + editor) eller ett utkast i kod. Inga one.com-belopp här.",
    ctaLabel: "Prova med er beskrivning",
    previewLeftTitle: "one.com",
    previewLeftBody: "Domän · hosting · hemsideprogram",
    previewRightTitle: "Sajtmaskin",
    previewRightBody: "Beskrivning → utkast · credits",
    previewCaption:
      "Paket versus builder. Senast uppdaterad 18 oktober 2026. Skriven av Sajtmaskin.",
    criteriaLead:
      "one.com-raderna beskriver deras vanliga modell: sälja adress och drift, plus ett byggverktyg i samma familj. Utbudet ändras. Läs deras sidor. Sajtmaskin-raderna är stämda mot produkten här.",
    criteria: [
      {
        title: "Vad ni egentligen köper",
        them: "Ofta ett paket: domännamn, e-post och webbhotell, ibland tillsammans med deras hemsideprogram. Det är en leverantör för flera saker.",
        sm: "En builder. Ni beskriver företaget och får ett utkast. Hosting av den publicerade sajten är Vercel-baserad. Domän ni redan äger kopplas separat — och kan vara stängd i vissa miljöer.",
      },
      {
        title: "Editor",
        them: "Deras hemsideprogram (de har också beskrivit AI-stöd i byggaren). Ni arbetar i deras miljö. Verifiera namn och funktioner hos one.com — de byter produktnamn ibland.",
        sm: "Beskrivning → utkast, sedan följdtext. Ingen klassisk drag-and-drop-canvas.",
      },
      {
        title: "Svensk vardag",
        them: "Stark igenkänning i Norden för just domän och drift. Support och kassa är byggda för den affären.",
        sm: "Byggd för svenska småföretagssidor: svenska copy-flöden, credits, första generering gratis.",
      },
      {
        title: "Betalmodell",
        them: "Typiskt periodvis betalning för domän, hosting och ev. builder. Bindningstid och paket varierar — bara hos one.com.",
        sm: "Credits som engångsköp, utan prenumeration. Publicering debiterar credits.",
      },
      {
        title: "När sajten är “klar”",
        them: "När den är publicerad på deras drift, ofta på en domän ni köpt där eller pekat dit.",
        sm: "När ni granskat utkastet och publicerar. Preview under arbetet är inte en live-sajt. Utan egen domän blir adressen en Vercel-URL.",
      },
      {
        title: "Exit",
        them: "Domänen kan flyttas enligt deras och registrarens regler. Själva sidbygget sitter ofta kvar i deras program. Räkna inte med en magisk export av hela affären.",
        sm: "Genererad kod som ZIP eller GitHub för inloggad ägare — inte databas, nycklar eller domän.",
      },
    ],
    chooseThemHeading: "Välj one.com om…",
    chooseThem: [
      "Ni främst behöver en svensk/nordisk ställe att köpa domän, e-post och hosting, och builder är sekundärt.",
      "Ni redan har mejl och drift där och vill hålla allt hos samma leverantör.",
      "Ni trivs i deras hemsideprogram och inte behöver exportera kod.",
    ],
    chooseSmHeading: "Överväg Sajtmaskin om…",
    chooseSm: [
      "Behovet är en företagssida från en beskrivning, inte ett webbhotellskonto.",
      "Ni redan äger en domän någon annanstans och vill testa ett AI-utkast först.",
      "Ni vill kunna ta med den genererade koden och betala credits i stället för en löpande builder-prenumeration.",
    ],
    stepsHeading: "Tre steg innan ni byter från one.com:s builder",
    steps: [
      {
        title: "Separera domän och sida",
        body: "Domänen kan stanna hos one.com eller flyttas senare. Sidbygget är en annan fråga. Blanda inte ihop uppsägning av hosting med att tappa namnet.",
      },
      {
        title: "Bygg samma brief i Sajtmaskin",
        body: "En startsida med ert riktiga innehåll. Jämför hur ni ändrar texter och vad som händer vid publicering.",
      },
      {
        title: "Planera DNS och mejl",
        body: "Peka A/CNAME eller behåll mejl hos nuvarande drift. Det är lätt att slå sönder e-post om man bara “flyttar allt”. Ingen one-click-flytt.",
      },
    ],
    noteHeading: "Domän och builder är olika köp",
    note:
      "Att lämna ett hemsideprogram är inte samma sak som att säga upp domänen. Vi lovar ingen automatisk import från one.com. I Sajtmaskin är credits engångsköp; publicering debiterar credits. one.com-priser och kampanjer publiceras inte här.",
    faqs: [
      {
        q: "Är Sajtmaskin ett webbhotell som one.com?",
        a: "Nej. Sajtmaskin genererar och publicerar en sajt (Vercel under huven). one.com säljer typiskt domän, drift och ofta e-post, plus ett byggverktyg. Välj efter vilket problem ni har först.",
      },
      {
        q: "Vad kostar one.com?",
        a: "Inga belopp här. De har paket för domän, hosting och extra tjänster som ändras. Läs deras prissidor. Sajtmaskin säljer credits som engångsköp.",
      },
      {
        q: "Har one.com AI-hemsideprogram?",
        a: "De har kommunicerat AI-hjälp i sitt hemsideprogram. Namn och omfattning ändras. Verifiera hos one.com. Skillnaden mot Sajtmaskin är fortfarande paket+deras editor versus beskrivning → utkast i kod.",
      },
      {
        q: "Måste jag flytta min .se-domän för att testa Sajtmaskin?",
        a: "Nej. Ni kan ta fram ett utkast och publicera på en tillfällig adress först. Att peka en domän ni redan äger är ett senare steg och kan vara stängt i vissa miljöer.",
      },
      {
        q: "Vem har skrivit sidan?",
        a: "Sajtmaskin. Senast uppdaterad 18 oktober 2026. Verifiera one.com-fakta hos one.com innan ni säger upp något.",
      },
    ],
  },
} as const satisfies Record<"squarespace-alternativ" | "one-com-alternativ", ComparisonCopy>;

export function getComparisonCopy(slug: ComparisonCopy["slug"]): ComparisonCopy {
  return COMPARISON_COPY[slug];
}
