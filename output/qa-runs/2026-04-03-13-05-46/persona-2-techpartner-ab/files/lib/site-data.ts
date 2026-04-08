export interface NavigationItem {
  label: string;
  href: string;
  type: "page" | "section";
}

export interface ServiceItem {
  title: string;
  description: string;
  bullets: string[];
  icon: "code" | "cloud" | "shield" | "operations";
}

export interface TestimonialItem {
  name: string;
  role: string;
  company: string;
  quote: string;
  rating: number;
}

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  image: string;
}

export interface TimelineItem {
  year: string;
  title: string;
  description: string;
}

export interface ValueItem {
  title: string;
  description: string;
}

export interface PricingPackage {
  name: string;
  price: string;
  billing: string;
  description: string;
  bestFor: string;
  featured: boolean;
  features: string[];
  ctaLabel: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: "linkedin" | "github";
}

export const siteConfig = {
  name: "TechPartner AB",
  url: "https://www.techpartnerab.se",
  phone: "070-123 45 67",
  phoneHref: "tel:+46701234567",
  email: "hej@techpartnerab.se",
  emailHref: "mailto:hej@techpartnerab.se",
  address: "Storgatan 12, 411 38 Göteborg",
  areaServed: "Stockholm",
  officeHours: "Måndag–fredag 08.00–17.00",
  heroTitle:
    "TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm.",
  defaultTitle:
    "TechPartner AB — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  defaultDescription:
    "TechPartner AB hjälper företag i Stockholm med systemutveckling, molnlösningar och IT-säkerhet. Få en trygg teknikpartner med tydliga paket.",
  socialLinks: [
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/techpartner-ab",
      icon: "linkedin",
    },
    {
      label: "GitHub",
      href: "https://github.com/techpartnerab",
      icon: "github",
    },
  ] as SocialLink[],
};

export const navigation: NavigationItem[] = [
  { label: "Hem", href: "/", type: "page" },
  { label: "Om oss", href: "/om-oss", type: "page" },
  { label: "Tjänster", href: "/#tjanster", type: "section" },
  { label: "Kontakt", href: "/kontakt", type: "page" },
  { label: "Priser", href: "/priser", type: "page" },
];

export const sharedKeywords = [
  "systemutveckling Stockholm",
  "molnlösningar företag",
  "IT-säkerhet Stockholm",
  "teknikpartner B2B",
  "systemintegration",
  "molnmigrering",
  "säkerhetsgranskning",
];

export const services: ServiceItem[] = [
  {
    title: "Systemutveckling",
    description:
      "Vi bygger digitala tjänster, interna verktyg och integrationer som klarar verklig belastning och höga krav på stabilitet. Vårt team arbetar nära verksamheten så att tekniken stödjer både dagens processer och morgondagens mål.",
    bullets: [
      "Nya affärssystem och kundportaler",
      "API:er, integrationer och automatisering",
      "Kodgranskning och teknisk roadmap",
    ],
    icon: "code",
  },
  {
    title: "Molnlösningar",
    description:
      "Vi hjälper dig att modernisera drift, etablera tydliga plattformar och få kontroll över kostnader i molnet. Oavsett om du står inför migrering eller optimering skapar vi en lösning som går att förvalta långsiktigt.",
    bullets: [
      "Azure, AWS och Google Cloud",
      "CI/CD, infrastruktur som kod och observabilitet",
      "Prestanda- och kostnadsoptimering",
    ],
    icon: "cloud",
  },
  {
    title: "IT-säkerhet",
    description:
      "Säkerhet behöver vara en naturlig del av arkitektur, utveckling och drift, inte ett separat sidospår. Vi stärker identitet, loggning, backup och beredskap så att risknivån minskar utan att tempot bromsas.",
    bullets: [
      "Säkerhetsgranskning och åtgärdsplan",
      "Identitetshantering och åtkomststyrning",
      "Backup, loggning och incidentberedskap",
    ],
    icon: "shield",
  },
  {
    title: "Förvaltning och rådgivning",
    description:
      "När lösningen är i drift kan vi fortsätta som ett aktivt stöd till din ledning och ditt teknikteam. Du får en partner som följer upp, prioriterar förbättringar och håller riktning i takt med att verksamheten förändras.",
    bullets: [
      "Löpande vidareutveckling",
      "Teknisk ledning och sprintplanering",
      "SLA, support och kapacitetsrådgivning",
    ],
    icon: "operations",
  },
];

export const testimonials: TestimonialItem[] = [
  {
    name: "Karin Holm",
    role: "CTO",
    company: "Nordverk Logistik",
    quote:
      "TechPartner AB tog över ett komplext integrationsprojekt och skapade ordning redan första månaden. Vi fick bättre tempo i utvecklingen och tydligare rapportering till ledningen.",
    rating: 5,
  },
  {
    name: "Mikael Sund",
    role: "IT-chef",
    company: "Eken Finans",
    quote:
      "Samarbetet gav oss en molnplattform som är enklare att drifta och betydligt tryggare ur säkerhetsperspektiv. Det märks att teamet kan prata både affär och teknik.",
    rating: 5,
  },
  {
    name: "Lovisa Nyström",
    role: "Digitaliseringsansvarig",
    company: "Svea Medtech",
    quote:
      "Vi behövde en partner som kunde gå från strategi till genomförande utan friktion. TechPartner AB levererade en tydlig plan, stark struktur och ett lugnt genomförande.",
    rating: 5,
  },
];

export const clientLogos = [
  {
    name: "Nordverk Logistik",
    image:
      "/placeholder.svg?height=80&width=180&text=Nordverk+Logistik",
  },
  {
    name: "Eken Finans",
    image: "/placeholder.svg?height=80&width=180&text=Eken+Finans",
  },
  {
    name: "Svea Medtech",
    image: "/placeholder.svg?height=80&width=180&text=Svea+Medtech",
  },
  {
    name: "Vinga Industri",
    image: "/placeholder.svg?height=80&width=180&text=Vinga+Industri",
  },
];

export const aboutStats = [
  {
    value: "10+ år",
    label: "erfarenhet av affärskritiska system",
  },
  {
    value: "120+",
    label: "levererade projekt och uppdrag",
  },
  {
    value: "2 timmar",
    label: "målsatt svarstid i pågående avtal",
  },
];

export const timeline: TimelineItem[] = [
  {
    year: "2015",
    title: "Bolaget startar",
    description:
      "TechPartner AB grundades med en tydlig idé: att ge svenska företag en teknikpartner som kombinerar affärsförståelse med stark leveranskapacitet. De första uppdragen handlade om integrationer och modernisering av äldre system.",
  },
  {
    year: "2019",
    title: "Moln och plattformsarbete blir kärna",
    description:
      "När fler kunder ville lämna tunga driftmiljöer byggde vi upp ett tydligt erbjudande inom molnarkitektur, automatisering och plattformsteam. Det gjorde att vi kunde ta större ansvar från strategi till införande.",
  },
  {
    year: "2023",
    title: "Säkerhet vävs in i varje leverans",
    description:
      "I takt med hårdare krav från marknaden och fler regulatoriska behov växte vårt säkerhetserbjudande fram. I dag är säkerhet en självklar del av varje uppdrag, från kod till drift och uppföljning.",
  },
];

export const team: TeamMember[] = [
  {
    name: "Anna Bergström",
    role: "VD och strategisk rådgivare",
    bio:
      "Anna leder kunddialoger och säkerställer att teknikinitiativ kopplas till tydliga affärsmål. Hon har lång erfarenhet av förändringsledning i växande B2B-bolag.",
    image:
      "/placeholder.svg?height=520&width=420&text=Anna+Bergstr%C3%B6m+portr%C3%A4tt+i+ljus+kontorsmilj%C3%B6",
  },
  {
    name: "Erik Lindholm",
    role: "Teknisk chef",
    bio:
      "Erik ansvarar för arkitektur, leveransmodell och teknisk kvalitet i våra projekt. Han har byggt plattformar inom logistik, finans och datatunga SaaS-miljöer.",
    image:
      "/placeholder.svg?height=520&width=420&text=Erik+Lindholm+portr%C3%A4tt+med+modern+teknikmilj%C3%B6",
  },
  {
    name: "Sofia Nyqvist",
    role: "Säkerhetsansvarig",
    bio:
      "Sofia driver frågor kring identitet, övervakning och incidentberedskap i kundernas miljöer. Hon är van vid att omsätta säkerhetskrav till praktiska förbättringar som håller över tid.",
    image:
      "/placeholder.svg?height=520&width=420&text=Sofia+Nyqvist+portr%C3%A4tt+i+stilren+arbetsmilj%C3%B6",
  },
];

export const values: ValueItem[] = [
  {
    title: "Affär först",
    description:
      "Vi börjar alltid i verksamhetsmålen och ser till att lösningen har en tydlig effekt på processer, tempo eller risknivå. Det gör att tekniska beslut blir lättare att prioritera och enklare att förankra i ledningen.",
  },
  {
    title: "Tydlig leverans",
    description:
      "Kunderna ska veta vad som händer, vad som är nästa steg och vad som krävs av varje part. Därför arbetar vi med konkret planering, raka rekommendationer och frekvent uppföljning.",
  },
  {
    title: "Säkerhet som standard",
    description:
      "Vi bygger inte först och säkrar senare, utan väver in säkerhet från början i arkitektur, åtkomst och drift. Det ger robustare lösningar och färre dyra omtag längre fram.",
  },
  {
    title: "Långsiktigt partnerskap",
    description:
      "Vårt mål är inte bara att leverera ett projekt, utan att bli ett stöd när tekniklandskapet förändras över tid. Därför kombinerar vi genomförande med rådgivning, förvaltning och förbättringsarbete.",
  },
];

export const pricingPackages: PricingPackage[] = [
  {
    name: "Start",
    price: "18 000 kr",
    billing: "/månad",
    description:
      "För mindre teknikteam som behöver en trygg specialistresurs och en tydlig riktning i ett avgränsat område.",
    bestFor: "Passar företag som vill komma i gång snabbt med ett prioriterat projekt eller en teknisk genomlysning.",
    featured: false,
    features: [
      "En workshop per månad",
      "Upp till 2 utvecklingsdagar",
      "Månatlig statusrapport",
      "Rådgivning inom moln eller säkerhet",
      "Prioriterad support via e-post",
      "Förslag på nästa steg efter varje månad",
    ],
    ctaLabel: "Boka startmöte",
  },
  {
    name: "Tillväxt",
    price: "42 000 kr",
    billing: "/månad",
    description:
      "För bolag som behöver både leveranskapacitet och löpande tekniskt stöd i en stabil takt över tid.",
    bestFor: "Passar företag med flera initiativ samtidigt och behov av tätare samarbete med CTO eller IT-chef.",
    featured: true,
    features: [
      "Två workshops per månad",
      "Upp till 6 utvecklingsdagar",
      "Molnoptimering och säkerhetsgranskning",
      "Sprintplanering och backlogstöd",
      "Veckovis uppföljning",
      "Svarstid inom en arbetsdag",
    ],
    ctaLabel: "Välj tillväxt",
  },
  {
    name: "Strategisk partner",
    price: "89 000 kr",
    billing: "/månad",
    description:
      "För företag som vill ha ett nära partnerskap med både strategisk styrning och aktiv leverans i flera spår.",
    bestFor: "Passar organisationer som växer snabbt, hanterar höga krav eller vill driva ett större teknikskifte.",
    featured: false,
    features: [
      "Löpande styrgruppsmöten",
      "Upp till 14 utvecklingsdagar",
      "Dedikerad teknisk ledare",
      "Fördjupad säkerhets- och plattformsuppföljning",
      "SLA med snabbare svarstider",
      "Kvartalsvis roadmap och prioriteringsstöd",
    ],
    ctaLabel: "Prata med oss",
  },
];

export const pricingFaq: FaqItem[] = [
  {
    question: "Kan vi börja med ett mindre upplägg och skala upp senare?",
    answer:
      "Ja, det är vanligt att kunder startar med ett avgränsat paket för att komma vidare i ett konkret behov. När vi har byggt en gemensam bild av mål, kapacitet och tempo kan vi skala upp stegvis utan att tappa riktning.",
  },
  {
    question: "Arbetar ni med fast pris eller löpande upplägg?",
    answer:
      "Vi erbjuder båda delarna beroende på uppdragets natur och hur tydligt omfattningen är definierad. För löpande partnerskap fungerar månadsupplägg ofta bäst, medan avgränsade insatser kan prissättas som fast projekt.",
  },
  {
    question: "Ingår säkerhet i alla paket?",
    answer:
      "Ja, säkerhet finns med i samtliga paket som en grundprincip i vårt arbete. Skillnaden ligger i hur djupt vi går i analys, uppföljning och operativa förbättringar beroende på behov och ambitionsnivå.",
  },
  {
    question: "Kan ni arbeta på plats hos oss i Stockholm?",
    answer:
      "Absolut, vi arbetar både hybrid och på plats när uppdraget kräver det. Många kunder väljer en kombination där workshops och styrmöten sker fysiskt medan löpande arbete drivs effektivt digitalt.",
  },
];

export const contactProcess = [
  {
    title: "Första avstämning",
    description:
      "Vi börjar med ett kort samtal där du beskriver nuläge, mål och eventuella hinder. Därefter avgör vi tillsammans om nästa steg ska vara workshop, genomlysning eller direkt leveransstart.",
  },
  {
    title: "Teknisk behovsbild",
    description:
      "Om det behövs går vi djupare i arkitektur, organisation och säkerhetskrav för att förstå helheten. Det gör att rekommendationen blir konkret och användbar redan från första mötet.",
  },
  {
    title: "Förslag och nästa steg",
    description:
      "Du får ett tydligt upplägg med omfattning, ansvarsfördelning och rekommenderad väg framåt. Målet är att du ska kunna fatta beslut snabbt och känna trygghet i vad som händer därefter.",
  },
];