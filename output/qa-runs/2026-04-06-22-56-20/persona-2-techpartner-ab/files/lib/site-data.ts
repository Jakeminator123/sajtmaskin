export type NavItem = {
  label: string;
  href: string;
};

export type Service = {
  slug: string;
  title: string;
  description: string;
  highlights: string[];
};

export type Testimonial = {
  name: string;
  role: string;
  company: string;
  quote: string;
  imageQuery: string;
  result: string;
};

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  imageQuery: string;
};

export type ValueItem = {
  title: string;
  description: string;
};

export type PricingPlan = {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  suitability: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type DeliveryStep = {
  title: string;
  description: string;
};

export type TechArea = {
  title: string;
  description: string;
  tags: string[];
};

export type SupportOption = {
  title: string;
  description: string;
};

export const siteConfig = {
  name: "TechPartner AB",
  shortName: "TechPartner",
  tagline: "Systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm.",
  phone: "070-123 45 67",
  phoneHref: "tel:0701234567",
  email: "hej@techpartner.se",
  emailHref: "mailto:hej@techpartner.se",
  address: "Storgatan 12, 411 38 Göteborg",
  hours: "Måndag–fredag 08.00–17.00",
  locationNote:
    "Vi arbetar främst med företag i Stockholm och planerar gärna workshops på plats hos kund. Från vårt kontor i Göteborg driver vi också hybridleveranser för team som vill ha både närhet och specialistkompetens.",
  socialLinks: [
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/techpartner-ab",
      description: "Följ våra perspektiv på ledarskap, moln och säker digitalisering.",
    },
    {
      label: "GitHub",
      href: "https://github.com/techpartner-ab",
      description: "Se hur vi tänker kring kvalitet, struktur och tekniskt hantverk.",
    },
    {
      label: "E-post",
      href: "mailto:hej@techpartner.se",
      description: "Skicka en förfrågan direkt till vårt team och få snabb återkoppling.",
    },
  ],
};

export const primaryNav: NavItem[] = [
  { label: "Hem", href: "/" },
  { label: "Om oss", href: "/om-oss" },
  { label: "Tjänster", href: "/tjanster" },
  { label: "Priser", href: "/priser" },
  { label: "Kontakt", href: "/kontakt" },
];

export const footerNav: Record<string, NavItem[]> = {
  Sidor: [
    { label: "Hem", href: "/" },
    { label: "Om oss", href: "/om-oss" },
    { label: "Tjänster", href: "/tjanster" },
    { label: "Priser", href: "/priser" },
    { label: "Kontakt", href: "/kontakt" },
  ],
  Tjänster: [
    { label: "Systemutveckling", href: "/tjanster#systemutveckling" },
    { label: "Molnlösningar", href: "/tjanster#molnlosningar" },
    { label: "IT-säkerhet", href: "/tjanster#it-sakerhet" },
    { label: "Förvaltning", href: "/tjanster#forvaltning" },
  ],
  Support: [
    { label: "Support", href: "/support" },
    { label: "Kontaktvägar", href: "/kontakt" },
    { label: "Prispaket", href: "/priser" },
    { label: "Boka möte", href: "/kontakt" },
  ],
};

export const services: Service[] = [
  {
    slug: "systemutveckling",
    title: "Systemutveckling",
    description:
      "Vi bygger affärskritiska lösningar som är lätta att förvalta, vidareutveckla och integrera med resten av er verksamhet. Ni får senior kompetens från start och en leveransmodell som skapar beslutbarhet i varje steg.",
    highlights: [
      "Nya plattformar och interna verksamhetssystem",
      "Integrationer mellan affärssystem, API:er och kundgränssnitt",
      "Teknisk modernisering av äldre lösningar",
    ],
  },
  {
    slug: "molnlosningar",
    title: "Molnlösningar",
    description:
      "Vi hjälper er att migrera, strukturera och optimera er molnplattform så att den blir säker, kostnadseffektiv och skalbar. Arbetet omfattar både arkitektur, driftbarhet och tydliga rutiner för framtida tillväxt.",
    highlights: [
      "Molnarkitektur för Azure, AWS och hybridmiljöer",
      "Automatisering av infrastruktur och deploymentflöden",
      "Kostnadsstyrning, loggning och observability",
    ],
  },
  {
    slug: "it-sakerhet",
    title: "IT-säkerhet",
    description:
      "Säkerhet ska inte ligga bredvid utvecklingen utan vara en naturlig del av den. Vi stöttar er med riskreducering, identitetshantering och arbetssätt som stärker både teknik, processer och ledning.",
    highlights: [
      "Säkerhetsgranskningar och åtgärdsplaner",
      "Behörighetsstyrning, spårbarhet och logghantering",
      "Stöd inför revisioner och incidentberedskap",
    ],
  },
  {
    slug: "forvaltning",
    title: "Förvaltning och vidareutveckling",
    description:
      "Efter lansering tar vi ansvar för stabilitet, uppföljning och förbättringar så att lösningen fortsätter skapa värde över tid. Ni får en partner som både ser helheten och hanterar detaljerna i vardagen.",
    highlights: [
      "Löpande förbättringar och planerad utveckling",
      "Support, incidenthantering och prioriteringsstöd",
      "Rapportering, roadmap och kapacitetsplanering",
    ],
  },
];

export const testimonials: Testimonial[] = [
  {
    name: "Helena Sjöberg",
    role: "CTO",
    company: "Nordhamn Logistik",
    quote:
      "TechPartner AB tog över ett splittrat utvecklingsarbete och skapade ordning direkt. Vi fick bättre kontroll på både roadmap, kvalitet och leveranstakt utan att bygga upp ett större internt team.",
    imageQuery: "Professional Swedish CTO portrait woman minimal office",
    result: "Kortare ledtid från idé till release",
  },
  {
    name: "Markus Eklund",
    role: "IT-chef",
    company: "Valvet Fastighetssystem",
    quote:
      "Vi behövde både modernisera vår plattform och stärka säkerheten utan att störa verksamheten. Teamet arbetade metodiskt, kommunicerade tydligt och blev snabbt en naturlig del av vårt eget IT-arbete.",
    imageQuery: "Professional Swedish IT manager portrait man Scandinavian office",
    result: "Trygg molnflytt med tydlig kostnadskontroll",
  },
  {
    name: "Anna Rydén",
    role: "Operativ chef",
    company: "CareFlow Nordic",
    quote:
      "Det som skiljde TechPartner AB från andra leverantörer var kombinationen av affärsförståelse och tekniskt djup. Vi fick rekommendationer som gick att agera på direkt och en lösning som faktiskt håller över tid.",
    imageQuery: "Professional Swedish operations executive portrait woman business",
    result: "Starkare drift och bättre beslutsunderlag",
  },
];

export const teamMembers: TeamMember[] = [
  {
    name: "Sofia Lindberg",
    role: "VD och strategisk rådgivare",
    bio:
      "Sofia arbetar nära ledningsgrupper som vill få bättre styrning i teknikfrågor. Hon ansvarar för att varje uppdrag får rätt affärsfokus och en tydlig plan från första workshop till uppföljning.",
    imageQuery: "Swedish female technology CEO portrait clean studio",
  },
  {
    name: "Erik Nyström",
    role: "Teknisk chef",
    bio:
      "Erik leder arkitektur, plattformsval och kvalitetssäkring i våra leveranser. Han har lång erfarenhet av att modernisera komplexa systemmiljöer utan att tappa fart i verksamheten.",
    imageQuery: "Swedish male CTO portrait minimal light office",
  },
  {
    name: "Maja Berg",
    role: "Lead inom IT-säkerhet",
    bio:
      "Maja hjälper kunder att bygga säkerhet som fungerar i praktiken, inte bara på papper. Hon fokuserar på identitet, spårbarhet och robusta processer som håller även när tempot är högt.",
    imageQuery: "Swedish female cybersecurity specialist portrait office",
  },
];

export const values: ValueItem[] = [
  {
    title: "Tydlighet före prestige",
    description:
      "Vi tror på raka rekommendationer, tydliga underlag och ett arbetssätt där alla vet vad som ska göras och varför. Det skapar lugn i både projektgrupper och ledning.",
  },
  {
    title: "Säkerhet från start",
    description:
      "Säkerhet byggs in i arkitektur, kod, processer och uppföljning redan från första beslutet. Det ger färre brandkårsutryckningar och bättre motståndskraft över tid.",
  },
  {
    title: "Partnerskap på riktigt",
    description:
      "Vi säljer inte bara timmar utan tar ansvar för helhet, prioritering och framdrift. Målet är att bli den partner ni kan luta er mot när kraven ökar.",
  },
  {
    title: "Mätbar affärsnytta",
    description:
      "Varje tekniskt initiativ ska gå att koppla till bättre tempo, lägre risk eller effektivare arbetssätt. Det hjälper er att fatta kloka beslut även i komplexa miljöer.",
  },
];

export const milestones = [
  {
    year: "2016",
    title: "Starten",
    description:
      "TechPartner AB grundades med målet att ge företag tillgång till senior teknisk kompetens utan att behöva bygga stora interna specialistteam från dag ett.",
  },
  {
    year: "2020",
    title: "Fokus på moln och säkerhet",
    description:
      "När fler kunder gick från traditionell drift till moderna plattformar breddade vi erbjudandet med molnarkitektur, säkerhetsarbete och långsiktig förvaltning.",
  },
  {
    year: "Idag",
    title: "Strategisk leveranspartner",
    description:
      "Vi arbetar med företag som behöver en partner som både kan lösa dagens problem och lägga grunden för morgondagens teknikbeslut.",
  },
];

export const pricingPlans: PricingPlan[] = [
  {
    name: "Bas",
    price: "29 000 kr/mån",
    description:
      "För mindre team som behöver senior rådgivning, tydlig struktur och punktinsatser i utveckling eller moln. Upplägget passar när ni vill komma igång snabbt utan att låsa upp en stor budget.",
    features: [
      "Löpande rådgivning upp till 16 timmar per månad",
      "Teknisk genomgång och prioriteringsstöd",
      "Mindre utvecklings- eller molninsatser",
      "Månadsvis statusrapport och rekommendationer",
    ],
    cta: "Boka genomgång",
    suitability: "Passar mindre teknikteam och verksamheter i förändring",
  },
  {
    name: "Tillväxt",
    price: "59 000 kr/mån",
    description:
      "För företag som behöver kontinuerlig leverans, snabbare utvecklingstakt och tätare samarbete med en extern teknikpartner. Här kombineras utveckling, molnstöd och säkerhetsarbete i ett tydligt paket.",
    features: [
      "Dedikerat seniorstöd upp till 40 timmar per månad",
      "Utveckling, molnarkitektur och säkerhetsrådgivning",
      "Prioriteringsmöte varannan vecka",
      "Incidentstöd under kontorstid",
      "Roadmap och beslutsunderlag för nästa steg",
    ],
    cta: "Välj Tillväxt",
    suitability: "Passar växande bolag med flera parallella teknikbehov",
    highlighted: true,
  },
  {
    name: "Strategisk partner",
    price: "119 000 kr/mån",
    description:
      "För organisationer som vill ha en nära partner med kapacitet att driva större initiativ, koordinera flera intressenter och ta långsiktigt ansvar. Ni får hög tillgänglighet, senior ledning och en tydlig leveransstruktur.",
    features: [
      "Prioriterad tillgång till specialistteam",
      "Arkitekturstöd, säkerhetsarbete och vidareutveckling",
      "Veckovis styrning och tät uppföljning",
      "Stöd inför revisioner, migreringar och större lanseringar",
      "Strategiskt beslutsstöd för CTO och IT-chef",
    ],
    cta: "Prata med oss",
    suitability: "Passar företag med affärskritiska system och höga krav",
  },
];

export const sharedDeliverables = [
  {
    title: "Förstudie och nulägesbild",
    description:
      "Vi börjar med att skapa en begriplig bild av teknik, risker och beroenden. Det gör att rekommendationer och prioriteringar blir enklare att förankra internt.",
  },
  {
    title: "Arkitektur och riktning",
    description:
      "Varje paket innehåller stöd i arkitekturfrågor så att ni kan fatta hållbara beslut. Fokus ligger på skalbarhet, driftbarhet och realistiska vägval.",
  },
  {
    title: "Säkerhetsfokus",
    description:
      "Oavsett nivå arbetar vi med säkerhet som en integrerad del av leveransen. Det minskar risken för att viktiga frågor skjuts upp till ett senare skede.",
  },
  {
    title: "Rapportering och uppföljning",
    description:
      "Ni får tydlig återkoppling på vad som gjorts, vad som är nästa steg och vilka beslut som behöver tas. Det skapar kontroll för både teknikteam och ledning.",
  },
];

export const pricingFaqs: FaqItem[] = [
  {
    question: "Är priserna fasta eller frånpriser?",
    answer:
      "Paketen fungerar som tydliga månadsnivåer för återkommande samarbete. Om ni har ett större projekt eller särskilda krav tar vi fram ett separat förslag med egen omfattning och tidsplan.",
  },
  {
    question: "Kan vi börja med ett mindre upplägg och skala upp senare?",
    answer:
      "Ja, det är vanligt att starta i ett mindre paket för att få struktur, prioriteringar och rätt arbetsform. När behoven växer kan vi sedan utöka med fler timmar, fler roller eller ett tydligare leveransteam.",
  },
  {
    question: "Binder vi upp oss under lång tid?",
    answer:
      "Vi föredrar tydliga och rimliga upplägg framför långa låsningar. Därför går vi igenom mål, arbetssätt och förväntningar tidigt så att samarbetet ska kännas tryggt för båda parter.",
  },
  {
    question: "Ingår support och incidenthantering?",
    answer:
      "Det beror på valt paket och hur affärskritisk lösningen är. I större upplägg kan vi sätta upp tydliga kontaktvägar, prioriteringar och överenskomna svarstider för supportärenden.",
  },
];

export const deliverySteps: DeliveryStep[] = [
  {
    title: "Analys och förankring",
    description:
      "Vi börjar med att förstå nuläge, affärsmål och tekniska begränsningar. Det ger ett gemensamt underlag som gör det lättare att prioritera rätt från början.",
  },
  {
    title: "Lösningsdesign",
    description:
      "Därefter formar vi en teknisk riktning som fungerar i verkligheten, inte bara i teorin. Vi väger samman tempo, kostnad, säkerhet och långsiktig förvaltning.",
  },
  {
    title: "Genomförande",
    description:
      "När planen är tydlig går vi in i leverans med korta beslutsvägar och tät uppföljning. Det ger bättre kontroll och minskar risken för att frågor blir liggande.",
  },
  {
    title: "Förvaltning och förbättring",
    description:
      "Efter leverans följer vi upp, prioriterar vidareutveckling och säkrar stabil drift. På så sätt fortsätter lösningen att ge affärsvärde även efter lansering.",
  },
];

export const techAreas: TechArea[] = [
  {
    title: "Plattformar och moln",
    description:
      "Vi hjälper kunder att välja och strukturera rätt plattform för verksamhetens krav. Arbetet omfattar både migrering, automatisering och en hållbar driftmodell.",
    tags: ["Azure", "AWS", "Hybridmoln", "CI/CD", "Observability"],
  },
  {
    title: "Applikationer och integrationer",
    description:
      "Vi bygger lösningar som fungerar väl tillsammans med befintliga system och processer. Målet är att skapa flöden som är robusta, begripliga och möjliga att vidareutveckla.",
    tags: ["API:er", ".NET", "Node.js", "Next.js", "Integrationer"],
  },
  {
    title: "Säker utveckling",
    description:
      "Vi väver in säkerhet i hela leveranskedjan genom kodgranskning, behörighetsstyrning och uppföljning. Det skapar bättre motståndskraft utan att bromsa tempot.",
    tags: ["IAM", "Loggning", "Sårbarhetsarbete", "Revision", "Spårbarhet"],
  },
];

export const supportOptions: SupportOption[] = [
  {
    title: "Incidentstöd",
    description:
      "När något behöver hanteras snabbt ska kontaktvägarna vara tydliga och kommunikationen lugn. Vi hjälper er att få överblick, prioritera rätt och ta nästa steg utan onödigt brus.",
  },
  {
    title: "Teknisk support",
    description:
      "För frågor som rör drift, moln, kod eller arkitektur finns vi som ett seniort stöd till ert interna team. Ni får svar som går att agera på direkt, inte bara generella råd.",
  },
  {
    title: "Vidareutveckling",
    description:
      "Support handlar inte bara om att lösa fel utan också om att förbättra det som redan fungerar. Vi hjälper er att planera förbättringar så att ni får mer värde av befintliga system.",
  },
];

export const supportLevels = [
  {
    title: "Första respons samma arbetsdag",
    description:
      "Alla supportförfrågningar bekräftas snabbt så att ni vet att ärendet är mottaget och prioriterat. Det skapar trygghet redan från första kontakten.",
  },
  {
    title: "Tydlig status under arbetet",
    description:
      "Vi kommunicerar vad som händer, vilka beroenden som finns och när nästa uppdatering kommer. Det minskar osäkerheten för både verksamhet och teknikteam.",
  },
  {
    title: "Uppföljning efter åtgärd",
    description:
      "När ett ärende är löst följer vi upp orsaker, åtgärder och förbättringar för att minska risken att samma problem återkommer senare.",
  },
];

export const supportFaqs: FaqItem[] = [
  {
    question: "Vilka typer av ärenden hanterar ni?",
    answer:
      "Vi hjälper till med frågor inom utveckling, moln, säkerhet, drift och vidareutveckling. Om ett ärende kräver djupare analys sätter vi snabbt upp ett lämpligt arbetssätt tillsammans med er.",
  },
  {
    question: "Behöver vi vara befintlig kund för att få support?",
    answer:
      "Nej, men vi brukar börja med en kort genomgång av er miljö och era mål för att kunna ge rätt stöd. För återkommande behov rekommenderar vi ett tydligt paket eller supportupplägg.",
  },
  {
    question: "Hur rapporterar vi en incident?",
    answer:
      "Ni kan kontakta oss via telefon eller e-post beroende på överenskommen modell. Vid återkommande samarbete sätter vi upp en tydlig prioriteringsordning så att rätt personer kopplas in direkt.",
  },
];

export function createPlaceholderSrc(width: number, height: number, text: string) {
  return `https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=NaN&h=NaN&fit=crop&q=80
}