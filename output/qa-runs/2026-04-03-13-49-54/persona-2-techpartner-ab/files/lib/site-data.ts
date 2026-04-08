import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Cloud,
  Code2,
  GitBranch,
  Layers3,
  LifeBuoy,
  Search,
  Shield,
  ShieldCheck,
  Workflow,
} from "lucide-react";

export const siteConfig = {
  name: "TechPartner AB",
  siteUrl: "https://techpartner.se",
  defaultTitle:
    "TechPartner AB — systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  titleSuffix: "TechPartner AB — systemutveckling, molnlösningar och IT-säkerhet i Stockholm",
  description:
    "TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm. Tydliga paket, senior kompetens och snabb start.",
  phoneDisplay: "070-123 45 67",
  phoneHref: "tel:+46701234567",
  email: "kontakt@techpartner.se",
  emailHref: "mailto:kontakt@techpartner.se",
  bookingHref: "mailto:kontakt@techpartner.se?subject=Boka%20tid%20med%20TechPartner%20AB",
  address: "Storgatan 12, 411 38 Göteborg",
  hours: "Mån–Fre 09:00–17:00",
  linkedinUrl: "https://www.linkedin.com/company/techpartner-ab",
  githubUrl: "https://github.com/techpartner-ab",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Storgatan+12%2C+411+38+G%C3%B6teborg",
};

export const metadataKeywords = [
  "TechPartner AB",
  "systemutveckling Stockholm",
  "molnlösningar Stockholm",
  "IT-säkerhet företag",
  "cloud migration Sverige",
  "AWS konsult Stockholm",
  "Azure konsult Stockholm",
  "apputveckling företag",
  "säkerhetsgranskning IT",
  "förvaltning och support IT",
];

export type NavItem = {
  label: string;
  href: string;
};

export const navigation: NavItem[] = [
  { label: "Hem", href: "/" },
  { label: "Om oss", href: "/om-oss" },
  { label: "Tjänster", href: "/tjanster" },
  { label: "Kontakt", href: "/kontakt" },
  { label: "Priser", href: "/priser" },
];

export type StatItem = {
  value: string;
  label: string;
  description: string;
};

export const heroStats: StatItem[] = [
  {
    value: "1–2 veckor",
    label: "Vanlig starttid",
    description: "När beslut, åtkomst och prioriteringar är på plats kan vi ofta starta snabbt.",
  },
  {
    value: "Senior nivå",
    label: "Kompetens i leveransen",
    description: "Ni arbetar direkt med erfarna specialister inom utveckling, moln och säkerhet.",
  },
  {
    value: "Tydliga paket",
    label: "Förutsägbart upplägg",
    description: "Kostnad, omfattning och ansvar förklaras tidigt så att besluten blir enklare.",
  },
];

export type ServiceItem = {
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  icon: LucideIcon;
};

export const services: ServiceItem[] = [
  {
    id: "systemutveckling",
    title: "Systemutveckling",
    description:
      "Vi bygger webbapplikationer, integrationer och API:er med fokus på prestanda, testbarhet och underhåll över tid. Resultatet blir lösningar som går att vidareutveckla utan att teknisk skuld bromsar verksamheten.",
    deliverables: [
      "Webbapplikationer för interna och externa användare",
      "API:er och integrationer mellan affärssystem",
      "Kodgranskning, tester och teknisk dokumentation",
    ],
    icon: Code2,
  },
  {
    id: "molnlosningar",
    title: "Molnlösningar",
    description:
      "Vi planerar migrering, containerplattformar och kostnadsoptimering i AWS och Azure. Ni får en miljö som är stabil i drift och tydlig att följa upp ekonomiskt.",
    deliverables: [
      "Molnarkitektur för AWS och Azure",
      "Migrering från befintliga miljöer",
      "Kostnadsstyrning, rättigheter och driftsäkerhet",
    ],
    icon: Cloud,
  },
  {
    id: "it-sakerhet",
    title: "IT-säkerhet",
    description:
      "Vi genomför säkerhetsgranskningar, hårdning och incidentberedskap som passar verkliga verksamhetskrav. Säkerhetsarbetet byggs in från start så att risker minskar utan att tempot försvinner.",
    deliverables: [
      "Säkerhetsgranskning och riskbild",
      "Hårdning av miljöer och rutiner",
      "Praktiska förbättringsplaner och incidentberedskap",
    ],
    icon: ShieldCheck,
  },
  {
    id: "forvaltning-support",
    title: "Förvaltning & support",
    description:
      "Vi tar ansvar för övervakning, patchning och strukturerad förbättring efter lansering. Med rätt SLA och löpande uppföljning blir drift och förändring enklare att planera.",
    deliverables: [
      "Övervakning, patchning och återkommande uppföljning",
      "Supportflöden med tydliga kontaktvägar",
      "Löpande förbättringar utifrån mål och incidenter",
    ],
    icon: LifeBuoy,
  },
];

export type Testimonial = {
  name: string;
  role: string;
  company: string;
  quote: string;
};

export const testimonials: Testimonial[] = [
  {
    name: "Sara Lind",
    role: "CTO",
    company: "Nordkust Logistik",
    quote:
      "TechPartner tog oss från prototyp till stabil produktion utan överraskningar. Det märktes snabbt att teamet hade både teknisk tyngd och ett lugnt sätt att driva beslut framåt.",
  },
  {
    name: "Johan Berg",
    role: "IT-chef",
    company: "Svealab AB",
    quote:
      "Vi fick ordning på både molnkostnader och säkerhet på bara några veckor. Arbetet var tydligt prioriterat och vi visste hela tiden vad nästa steg skulle vara.",
  },
  {
    name: "Elin Karlsson",
    role: "Produktchef",
    company: "Fintek Stockholm",
    quote:
      "Snabba, strukturerade och lätta att jobba med. Vi fortsätter i förvaltning eftersom leveransen blev både stabil och enkel att bygga vidare på.",
  },
];

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  alt: string;
};

export const teamMembers: TeamMember[] = [
  {
    name: "Sara Lindholm",
    role: "Lösningsarkitekt",
    bio:
      "Sara leder tekniska roadmapar, integrationer och plattformsval med fokus på skalbarhet. Hon är van att översätta affärsbehov till tydliga beslut som håller i både utveckling och drift.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=480&h=560&fit=crop&q=80",
    alt: "Porträtt av lösningsarkitekt i ljust nordiskt kontor",
  },
  {
    name: "Oskar Nyström",
    role: "Senior utvecklare",
    bio:
      "Oskar bygger robusta tjänster och API:er där testbarhet och prestanda är en självklar del av leveransen. Han trivs bäst i uppdrag där kodkvalitet, tydliga gränssnitt och samarbete med interna team går hand i hand.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=480&h=560&fit=crop&q=80",
    alt: "Porträtt av senior utvecklare i skandinavisk kontorsmiljö",
  },
  {
    name: "Maja Ek",
    role: "Säkerhetsspecialist",
    bio:
      "Maja genomför granskningar, hotmodellering och förbättringsplaner som är praktiska att införa. Hennes styrka är att göra säkerhetsarbete begripligt, prioriterat och användbart för verksamheten.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=480&h=560&fit=crop&q=80",
    alt: "Porträtt av säkerhetsspecialist i modernt kontor",
  },
];

export type ValueItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const values: ValueItem[] = [
  {
    title: "Transparens",
    description:
      "Ni ser status, risker och beslut i tid. Det gör det lättare att prioritera rätt och skapa lugn i projekt där många beroenden behöver hänga ihop.",
    icon: Search,
  },
  {
    title: "Kvalitet",
    description:
      "Automatiserade tester, kodgranskning och användbar dokumentation är en del av arbetssättet. Vi bygger för hållbar förändring, inte bara för nästa leverans.",
    icon: BadgeCheck,
  },
  {
    title: "Ansvar",
    description:
      "Vi äger vår del av resultatet och kommunicerar proaktivt när något behöver justeras. Det skapar förtroende i både styrning, leverans och förvaltning.",
    icon: Workflow,
  },
  {
    title: "Säkerhet",
    description:
      "Säkerhet byggs in från start i arkitektur, process och drift. Ni slipper lägga viktiga frågor sist i kedjan när tid och budget redan är pressade.",
    icon: Shield,
  },
];

export type ProcessStep = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const processSteps: ProcessStep[] = [
  {
    title: "Förstudie & målbild",
    description:
      "Vi kartlägger nuläge, risker och prioriteringar tillsammans med ert team. Därefter tar vi fram en plan som går att följa upp både tekniskt och affärsmässigt.",
    icon: Search,
  },
  {
    title: "Iterativa leveranser",
    description:
      "Vi arbetar i korta sprintar med demo, avstämningar och tydliga resultat för varje steg. På så sätt blir riktning, kvalitet och tempo lättare att hålla över tid.",
    icon: GitBranch,
  },
  {
    title: "Drift & förvaltning",
    description:
      "Efter lansering fortsätter vi med övervakning, incidentrutiner och kontinuerliga förbättringar. Det minskar risk, ökar stabilitet och ger bättre kontroll över kostnad.",
    icon: Layers3,
  },
];

export type PricingPlan = {
  name: string;
  price: string;
  summary: string;
  highlighted: boolean;
  ctaLabel: string;
  ctaHref: string;
  features: string[];
};

export const pricingPlans: PricingPlan[] = [
  {
    name: "Start",
    price: "från 45 000 kr/mån",
    summary:
      "För er som vill komma igång snabbt med ett tydligt första leveransmål. Paketet passar när ni behöver ett senior team som kan ta tag i rätt sak direkt och skapa ordning i nästa steg.",
    highlighted: false,
    ctaLabel: "Kom igång",
    ctaHref: "/kontakt",
    features: [
      "1–2 leveranser per månad",
      "Teknisk genomgång och prioritering",
      "Grundläggande CI/CD",
      "Dokumentation på plats",
      "Månadsrapport",
    ],
  },
  {
    name: "Tillväxt",
    price: "från 95 000 kr/mån",
    summary:
      "För kontinuerlig utveckling, förbättringar och en tydlig leveransplan. Det här är upplägget för team som vill ha högre takt, tätare samverkan och bättre förutsägbarhet över flera områden samtidigt.",
    highlighted: true,
    ctaLabel: "Boka tid",
    ctaHref: "/kontakt",
    features: [
      "Allt i Start",
      "Prioriteringsmöten och sprintplanering",
      "Automatiserade tester",
      "Prestanda- och kostnadsoptimering",
      "Samverkan med flera team",
    ],
  },
  {
    name: "Trygg drift",
    price: "från 140 000 kr/mån",
    summary:
      "För verksamheter med högre krav på säkerhet, övervakning och responstid. Paketet kombinerar utveckling och förvaltning med ett mer strukturerat arbetssätt för driftkritiska miljöer.",
    highlighted: false,
    ctaLabel: "Kontakta oss",
    ctaHref: "/kontakt",
    features: [
      "Allt i Tillväxt",
      "Kvartalsvis säkerhetsgranskning",
      "Övervakning och alerting",
      "Incidentprocess och SLA-alternativ",
      "Backup och återställning",
    ],
  },
];

export type FaqItem = {
  question: string;
  answer: string;
};

export const pricingFaqs: FaqItem[] = [
  {
    question: "Kan ni fakturera per timme?",
    answer:
      "I vissa fall, men vi rekommenderar paket när målet är att skapa bättre förutsägbarhet och tydligare ansvar. Paket gör det enklare att prioritera rätt och följa upp resultat över tid.",
  },
  {
    question: "Hur snabbt kan ni starta?",
    answer:
      "Ofta inom 1–2 veckor efter första mötet, beroende på tillgänglighet och hur snabbt åtkomst kan sättas upp. När nuläge och målbild är tydliga går uppstarten vanligtvis snabbare än många tror.",
  },
  {
    question: "Ingår molnkostnader i priserna?",
    answer:
      "Nej, kostnader från AWS, Azure eller andra leverantörer faktureras separat. Vi hjälper gärna till att analysera nuläge och optimera användning så att kostnadsbilden blir mer kontrollerad.",
  },
  {
    question: "Kan vi byta paket när behovet ändras?",
    answer:
      "Ja, vi utvärderar löpande och justerar upp eller ned när behovet förändras. Det viktiga är att upplägget fortsätter stödja ert tempo, era risker och era prioriteringar.",
  },
];

export const footerPageLinks: NavItem[] = [
  { label: "Hem", href: "/" },
  { label: "Om oss", href: "/om-oss" },
  { label: "Tjänster", href: "/tjanster" },
  { label: "Priser", href: "/priser" },
  { label: "Kontakt", href: "/kontakt" },
];

export const footerServiceLinks: NavItem[] = [
  { label: "Systemutveckling", href: "/tjanster#systemutveckling" },
  { label: "Molnlösningar", href: "/tjanster#molnlosningar" },
  { label: "IT-säkerhet", href: "/tjanster#it-sakerhet" },
  { label: "Förvaltning & support", href: "/tjanster#forvaltning-support" },
];