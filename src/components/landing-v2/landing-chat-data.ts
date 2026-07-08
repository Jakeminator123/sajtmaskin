"use client"

import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Braces,
  Code2,
  CreditCard,
  Database,
  FileSearch,
  Gauge,
  GitBranch,
  Layers,
  MessageCircleQuestion,
  MessageSquare,
  Palette,
  Rocket,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wind,
  Zap,
} from "lucide-react"

export const categories = [
  {
    id: "analyserad",
    label: "Analyserad",
    icon: MessageCircleQuestion,
    description: "AI ställer frågor",
    placeholder: "Berätta lite om ditt företag så ställer vår AI följdfrågor...",
  },
  {
    id: "template",
    label: "Template",
    icon: Palette,
    description: "Bläddra v0-templates och välj startpunkt",
    placeholder: "Välj en template nedan eller beskriv din vision...",
  },
  {
    id: "audit",
    label: "Audit",
    icon: FileSearch,
    description: "Analysera befintlig sida",
    placeholder: "Klistra in din webbadress här, t.ex. https://mittforetag.se",
  },
  {
    id: "fritext",
    label: "Fritext",
    icon: MessageSquare,
    description: "Beskriv din vision",
    placeholder: "Skriv fritt — berätta vad du vill skapa...",
  },
]

export type ShapeVariant = "double" | "diamond" | "grid" | "triple" | "fast" | "pulse"

export const features = [
  {
    icon: Code2,
    title: "React & Next.js",
    description:
      "Varje sajt byggs med React 19 och Next.js 16 — samma ramverk som Spotify, Netflix och Klarna använder. Snabbt, sökvänligt och framtidssäkert.",
    shape: "double" as ShapeVariant,
    modalSubtitle: "Ramverket bakom moderna webben",
    modalDescription:
      "React 19 och Next.js 16 utgör ryggraden i varje sajt vi genererar. Server Components renderar sidan på servern för blixtsnabb laddtid, medan klientkomponenter ger interaktivitet utan overhead.",
    highlights: [
      "React 19 Server Components — HTML streamas direkt, JS skickas bara vid behov",
      "Next.js 16 App Router med layouter, laddningsstates och felgränser",
      "Inkrementell statisk regenerering (ISR) — statisk snabbhet, dynamisk fräschör",
      "Automatisk koddelning per route och komponent",
    ],
    codeFile: "next.config.ts",
    codeSnippet: `import type { NextConfig } from "next"\n\nconst config: NextConfig = {\n  reactStrictMode: true,\n  images: { formats: ["image/avif", "image/webp"] },\n  experimental: { ppr: true },\n}\nexport default config`,
  },
  {
    icon: Server,
    title: "Node.js & Edge Functions",
    description:
      "Serverledd rendering och edge-funktioner som körs globalt. Din sajt laddas blixtsnabbt oavsett var i Sverige dina kunder befinner sig.",
    shape: "diamond" as ShapeVariant,
    modalSubtitle: "Millisekunder till din kund",
    modalDescription:
      "Edge Functions körs på ett globalt nätverk med noder i Stockholm och hela Europa. Cold start under 50ms innebär att din sajt alltid svarar snabbt — oavsett var besökaren befinner sig.",
    highlights: [
      "Edge runtime — < 50ms kall-start globalt",
      "Automatisk geo-routing till närmaste datacenter",
      "Streaming SSR för progressiv rendering av stora sidor",
      "Proxy (tidigare middleware) för auth, redirects och A/B-tester",
    ],
    codeFile: "proxy.ts",
    codeSnippet: `import { NextResponse } from "next/server"\nimport type { NextRequest } from "next/server"\n\nexport function proxy(req: NextRequest) {\n  const country = req.geo?.country ?? "SE"\n  const res = NextResponse.next()\n  res.headers.set("x-geo", country)\n  return res\n}`,
  },
  {
    icon: Layers,
    title: "Tailwind CSS & Headless UI",
    description:
      "Pixel-perfekt design med Tailwind CSS v4 och tillgängliga komponenter. Responsivt på alla skärmar, från mobil till widescreen.",
    shape: "grid" as ShapeVariant,
    modalSubtitle: "Design utan kompromisser",
    modalDescription:
      "Tailwind CSS v4 med JIT-kompilering ger pixel-perfekt kontroll utan att skeppa oanvänd CSS. Kombinerat med Headless UI får du tillgängliga, ostylda komponenter som du kan forma helt fritt.",
    highlights: [
      "Tailwind CSS v4 — JIT-kompilering, noll oanvänd CSS i produktion",
      "Design tokens och custom themes för konsekvent varumärke",
      "Headless UI-komponenter med inbyggd ARIA och tangentbordsnavigering",
      "Mobile-first responsive design — fungerar perfekt på alla skärmar",
    ],
    codeFile: "button.tsx",
    codeSnippet: `import { cva } from "class-variance-authority"\n\nconst button = cva(\n  "inline-flex items-center justify-center rounded-lg " +\n  "font-medium transition-colors focus-visible:ring-2",\n  {\n    variants: {\n      variant: {\n        primary: "bg-primary text-primary-foreground",\n        outline: "border border-border bg-transparent",\n      },\n    },\n  }\n)`,
  },
  {
    icon: ShieldCheck,
    title: "TypeScript & Zod-validering",
    description:
      "Typsäker kod genomgående med TypeScript och Zod. Färre buggar, säkrare formulär och robust datahantering från dag ett.",
    shape: "triple" as ShapeVariant,
    modalSubtitle: "Typsäkerhet i varje lager",
    modalDescription:
      "Med TypeScript i strict mode och Zod-schemas fångas fel redan vid kompilering — inte i produktion. Från databasschema till API-respons till formulärvalidering: varje steg är typat.",
    highlights: [
      "TypeScript strict mode — inga implicit any, inga null-krascher",
      "Zod-schemas validerar all indata på server och klient",
      "End-to-end typsäkerhet: Drizzle → server actions/API → React-formulär",
      "Automatisk TypeScript-generering från API-kontrakt",
    ],
    codeFile: "schema.ts",
    codeSnippet: `import { z } from "zod"\n\nexport const contactSchema = z.object({\n  name: z.string().min(2, "Namn krävs"),\n  email: z.string().email("Ogiltig e-post"),\n  phone: z.string()\n    .regex(/^\\\\+?[\\\\d\\\\s-]{7,}$/, "Ogiltigt nummer")\n    .optional(),\n  message: z.string().min(10, "Minst 10 tecken"),\n})\n\nexport type ContactForm = z.infer<typeof contactSchema>`,
  },
  {
    icon: Gauge,
    title: "Lighthouse 95+",
    description:
      "Inbyggd sökmotoroptimering, tillgänglighet (WCAG 2.1) och prestanda-optimering. Varje sajt siktar på grönt i alla Lighthouse-kategorier.",
    shape: "fast" as ShapeVariant,
    modalSubtitle: "Grönt i alla kategorier",
    modalDescription:
      "Lighthouse mäter prestanda, tillgänglighet, SEO och best practices. Våra sajter siktar på 95+ i varje kategori — inte genom tricks, utan genom rätt arkitektur från start.",
    highlights: [
      "Core Web Vitals: LCP < 1.2s, INP < 200ms, CLS < 0.1",
      "Automatisk bildoptimering med next/image och AVIF/WebP",
      "WCAG 2.1 AA-tillgänglighet — semantisk HTML, ARIA, kontrastcheck",
      "Strukturerad data (JSON-LD) och optimerade meta-taggar för SEO",
    ],
    codeFile: "layout.tsx",
    codeSnippet: `import type { Metadata } from "next"\n\nexport const metadata: Metadata = {\n  title: "Mitt Företag | Professionella tjänster",\n  openGraph: {\n    type: "website",\n    locale: "sv_SE",\n    images: [{ url: "/og.png", width: 1200, height: 630 }],\n  },\n  robots: { index: true, follow: true },\n}`,
  },
  {
    icon: Smartphone,
    title: "PWA & Offline-redo",
    description:
      "Progressive Web App-stöd så att dina kunder kan installera sajten på mobilen. Push-notiser, offline-cache och app-känsla.",
    shape: "pulse" as ShapeVariant,
    modalSubtitle: "Appen utan App Store",
    modalDescription:
      "Med PWA-stöd kan dina besökare installera sajten som en app direkt från webbläsaren. Service Workers hanterar caching och offline-stöd, medan Web Push API möjliggör notiser.",
    highlights: [
      "Service Worker med precaching av kritiska resurser",
      "Web App Manifest — installérbar direkt på hemskärmen",
      "Push-notiser via Web Push API för kundengagemang",
      "Offline-first strategi med stale-while-revalidate",
    ],
    codeFile: "manifest.json",
    codeSnippet: `{\n  "name": "Mitt Företag",\n  "short_name": "MittFöretag",\n  "start_url": "/",\n  "display": "standalone",\n  "background_color": "#0a0a0a",\n  "theme_color": "#2dd4bf",\n  "icons": [\n    { "src": "/icon-192.png", "sizes": "192x192" },\n    { "src": "/icon-512.png", "sizes": "512x512" }\n  ]\n}`,
  },
]

export type TechStackItem = {
  name: string
  category: string
  detail: string
  icon: LucideIcon
  glow: string
}

/** Marketing-rad på landningen — håll versionsnamn ungefärligt i linje med `package.json` (React/Next/TS/Tailwind/Drizzle m.fl.). */
export const techStack: TechStackItem[] = [
  { name: "React 19", category: "Frontend", detail: "Server Components", icon: Code2, glow: "rgba(56, 189, 248, 0.16)" },
  { name: "Next.js 16", category: "Framework", detail: "App Router", icon: Layers, glow: "rgba(148, 163, 184, 0.14)" },
  { name: "TypeScript", category: "Språk", detail: "Strict mode", icon: Braces, glow: "rgba(59, 130, 246, 0.16)" },
  { name: "Tailwind CSS v4", category: "Styling", detail: "Design tokens", icon: Wind, glow: "rgba(45, 212, 191, 0.16)" },
  { name: "Node.js", category: "Runtime", detail: "API & automation", icon: Server, glow: "rgba(74, 222, 128, 0.16)" },
  { name: "Edge runtime", category: "Hosting", detail: "Global rendering", icon: Rocket, glow: "rgba(244, 244, 245, 0.12)" },
  { name: "PostgreSQL", category: "Databas", detail: "Relational core", icon: Database, glow: "rgba(96, 165, 250, 0.15)" },
  { name: "Zod", category: "Validering", detail: "Trusted input", icon: ShieldCheck, glow: "rgba(250, 204, 21, 0.15)" },
  { name: "Drizzle ORM", category: "ORM", detail: "Typsäkra SQL-queries", icon: GitBranch, glow: "rgba(167, 139, 250, 0.16)" },
  { name: "Stripe", category: "Betalning", detail: "Checkout & billing", icon: CreditCard, glow: "rgba(139, 92, 246, 0.16)" },
  { name: "Resend", category: "E-post", detail: "Transactional flows", icon: Send, glow: "rgba(251, 146, 60, 0.15)" },
  { name: "Analytics", category: "Insikter", detail: "Analytics + Speed Insights", icon: Activity, glow: "rgba(244, 63, 94, 0.16)" },
]

export const landingJourneySteps = [
  {
    number: "01",
    scenePosition: 0,
    title: "Registrera företaget",
    description: "Börja med bolaget, målet och vad verksamheten ska åstadkomma. Plattformen tar vid där pappersarbetet slutar.",
    bullets: ["Bolagsstart och identitet", "Skatteverket, mål och erbjudande"],
  },
  {
    number: "02",
    scenePosition: 1,
    title: "Välj spår och fyll i input",
    description: "Fritext, Template, analyserad eller audit. Du kan skriva, tala eller visa referenser för att styra riktningen.",
    bullets: ["Fyra inmatningslägen", "Prompt, röst, video och v0-templates"],
  },
  {
    number: "03",
    scenePosition: 2,
    title: "AI bygger i iterationer",
    description: "Ge feedback, klicka vidare och få en sajt som fungerar på riktigt — inte en statisk mockup.",
    bullets: ["Sex till sju förbättringar mot rätt version", "Design, struktur och innehåll i samma flöde"],
  },
  {
    number: "04",
    scenePosition: 3,
    title: "Koppla data och publicera",
    description: "När flödet sitter går det vidare till preview, integrationer och deploy. Sidan blir en arbetande digital tillgång.",
    bullets: ["Betalningar, databas, e-post och fler integrationer", "Preview, publicering och fortsatt utveckling"],
  },
  {
    number: "05",
    scenePosition: 4,
    title: "Optimera mot gröna siffror",
    description: "Målet är inte bara trafik utan ett bolag som växer. Sidan ska kunna driva leads, bokningar och bättre årsresultat över tid.",
    bullets: ["Leads, bokningar och konvertering", "Rapporter, uppföljning och gröna siffror"],
  },
]

export const stats = [
  { value: "~30 sek", label: "Första utkast", tooltip: "Beroende på komplexitet" },
  { value: "95+", label: "Google-poäng", tooltip: "Prestanda, tillgänglighet, SEO" },
  { value: "100%", label: "Mobilanpassat", tooltip: "Responsiv design på alla skärmar" },
  { value: "0 kr", label: "Att starta", tooltip: "Inga kreditkort, inga bindningstider" },
]

export const creditPackages = [
  {
    id: "10_credits",
    name: "Starter",
    credits: 10,
    price: 49,
    popular: false,
    savings: 0,
    description: "Perfekt för att testa",
    features: ["AI-generering & förfining", "Aldrig utgångsdatum", "Engångsköp - ingen prenumeration"],
    cta: "Köp Starter",
  },
  {
    id: "25_credits",
    name: "Popular",
    credits: 25,
    price: 99,
    popular: true,
    savings: 19,
    description: "Bästa balans för de flesta",
    features: ["AI-generering & förfining", "Aldrig utgångsdatum", "Engångsköp - ingen prenumeration"],
    cta: "Köp Popular",
  },
  {
    id: "50_credits",
    name: "Pro",
    credits: 50,
    price: 179,
    popular: false,
    savings: 27,
    description: "För högre tempo och fler iterationer",
    features: ["AI-generering & förfining", "Aldrig utgångsdatum", "Engångsköp - ingen prenumeration"],
    cta: "Köp Pro",
  },
]

export const studioTiers = [
  { name: "Start", range: "5 000 - 10 000 kr", description: "1-5 sidor, grundläggande anpassning" },
  { name: "Plus", range: "10 000 - 20 000 kr", description: "5-10 sidor, mer funktionalitet" },
  { name: "Pro", range: "20 000 - 40 000+ kr", description: "Unika lösningar, integrationer och e-handel" },
]

export const studioTeam = [
  { name: "Strategi", role: "Mål, struktur & flöden" },
  { name: "Design", role: "Visuellt uttryck & konvertering" },
  { name: "Leverans", role: "Kod, integrationer & lansering" },
]

export const trustLogos = [
  "Netflix",
  "Spotify",
  "TikTok",
  "Twitch",
  "Notion",
  "Nike",
  "Hulu",
  "GitHub",
  "OpenAI",
  "Loom",
  "Hashicorp",
  "Washington Post",
  "Target",
  "Sonos",
]

export type IntegrationItem = {
  name: string
  detail: string
  icon: LucideIcon
  glow: string
}

export const integrations: IntegrationItem[] = [
  { name: "Upstash", detail: "Redis på edge", icon: Zap, glow: "rgba(251, 146, 60, 0.16)" },
  { name: "Redis", detail: "Caching & köer", icon: Database, glow: "rgba(239, 68, 68, 0.14)" },
  { name: "Supabase", detail: "Auth & data", icon: Layers, glow: "rgba(34, 197, 94, 0.16)" },
  { name: "Hosting", detail: "Preview & publicering", icon: Rocket, glow: "rgba(148, 163, 184, 0.14)" },
  { name: "Stripe", detail: "Checkout & billing", icon: CreditCard, glow: "rgba(139, 92, 246, 0.16)" },
  { name: "Resend", detail: "E-postflöden", icon: Send, glow: "rgba(251, 146, 60, 0.16)" },
  { name: "OpenAI", detail: "Modeller i generering", icon: Sparkles, glow: "rgba(56, 189, 248, 0.14)" },
]

export type ComparisonParamKey =
  | "devSpeed"
  | "editorCms"
  | "performance"
  | "seo"
  | "appCustomization"
  | "scalability"
  | "security"
  | "maintenance"
  | "cost"
  | "ecosystem"

export type ComparisonScenarioId = "growth" | "editor" | "speed"

export type ComparisonParameter = {
  key: ComparisonParamKey
  label: string
}

export type ComparisonMethod = {
  key: string
  label: string
  bestFor: string
  summary: string
  strengths: string[]
  caveats: string[]
  scores: Record<ComparisonParamKey, number>
}

export type ComparisonScenario = {
  id: ComparisonScenarioId
  label: string
  description: string
  weights: Record<ComparisonParamKey, number>
}

export const comparisonParameters: ComparisonParameter[] = [
  { key: "devSpeed", label: "Dev-hastighet" },
  { key: "editorCms", label: "Redaktör/CMS" },
  { key: "performance", label: "Prestanda" },
  { key: "seo", label: "SEO" },
  { key: "appCustomization", label: "App-anpassning" },
  { key: "scalability", label: "Skalbarhet" },
  { key: "security", label: "Säkerhet" },
  { key: "maintenance", label: "Underhåll" },
  { key: "cost", label: "Kostnad" },
  { key: "ecosystem", label: "Ekosystem" },
]

export const comparisonScenarios: ComparisonScenario[] = [
  {
    id: "growth",
    label: "Tillväxt & mätbarhet",
    description:
      "Viktning för småföretag som vill växa med SEO, prestanda, integrationer och möjlighet att bygga vidare till portal/app.",
    weights: {
      devSpeed: 8,
      editorCms: 6,
      performance: 14,
      seo: 12,
      appCustomization: 15,
      scalability: 10,
      security: 9,
      maintenance: 8,
      cost: 8,
      ecosystem: 10,
    },
  },
  {
    id: "editor",
    label: "Redaktör & enkel drift",
    description:
      "Fokus på att redigera innehåll snabbt och hålla nere teknisk komplexitet i vardagen för team utan utvecklare.",
    weights: {
      devSpeed: 12,
      editorCms: 20,
      performance: 10,
      seo: 10,
      appCustomization: 8,
      scalability: 7,
      security: 8,
      maintenance: 12,
      cost: 8,
      ecosystem: 5,
    },
  },
  {
    id: "speed",
    label: "Prestanda & framtidssäkring",
    description:
      "Tyngdpunkt på Core Web Vitals, säkerhet och teknisk flexibilitet när sajten ska tåla avancerade funktioner över tid.",
    weights: {
      devSpeed: 6,
      editorCms: 4,
      performance: 18,
      seo: 14,
      appCustomization: 20,
      scalability: 12,
      security: 12,
      maintenance: 6,
      cost: 3,
      ecosystem: 5,
    },
  },
]

export const comparisonMethods: ComparisonMethod[] = [
  {
    key: "next",
    label: "Next.js (React)",
    bestFor: "Företag som vill kombinera snabb sajt med framtida app-funktioner.",
    summary: "Balanserar topprestanda, SEO och utvecklingsfrihet utan att låsa fast affären i ett plugin-ekosystem.",
    strengths: ["Stark på prestanda och SEO", "Hög app-anpassning och skalbarhet", "Bra säkerhetsnivå med modern stack"],
    caveats: ["Redaktörsflöde kräver ofta headless CMS eller anpassad admin"],
    scores: {
      devSpeed: 80,
      editorCms: 65,
      performance: 92,
      seo: 92,
      appCustomization: 95,
      scalability: 90,
      security: 88,
      maintenance: 78,
      cost: 70,
      ecosystem: 90,
    },
  },
  {
    key: "headlessWpNext",
    label: "Headless WordPress + Next.js",
    bestFor: "Team som vill ha både redaktörsgränssnitt och modern frontend.",
    summary: "Vanlig hybrid när man vill behålla WordPress för content men få fart, SEO och UX från Next.js.",
    strengths: ["Mycket stark CMS-upplevelse", "Nästan samma frontend-fördelar som ren Next", "Stort ekosystem"],
    caveats: ["Två system att drifta ger högre underhåll och mer komplex kostnadsbild"],
    scores: {
      devSpeed: 70,
      editorCms: 95,
      performance: 92,
      seo: 92,
      appCustomization: 92,
      scalability: 88,
      security: 80,
      maintenance: 62,
      cost: 60,
      ecosystem: 92,
    },
  },
  {
    key: "static",
    label: "Static (Astro/Hugo) + Git CMS",
    bestFor: "Landningssidor med minimalt attackutrymme och mycket hög fart.",
    summary: "Ger extrem prestanda och låg driftkostnad, men kräver mer struktur för innehållsarbete och app-funktioner.",
    strengths: ["Mycket hög prestanda och säkerhet", "Skalar och driftar billigt", "Bra för SEO och statiskt innehåll"],
    caveats: ["Svagare redaktörsflöde och mindre app-känsla utan extra setup"],
    scores: {
      devSpeed: 72,
      editorCms: 60,
      performance: 96,
      seo: 92,
      appCustomization: 70,
      scalability: 96,
      security: 96,
      maintenance: 82,
      cost: 85,
      ecosystem: 75,
    },
  },
  {
    key: "shopify",
    label: "Shopify",
    bestFor: "Företag där e-handel är huvudflödet från dag ett.",
    summary: "Stabil e-handelsplattform med snabb start, men mindre frihet och högre plattformskostnad över tid.",
    strengths: ["Väldigt stark för e-handel", "Låg driftfriktion", "Hög säkerhet och bra ekosystem"],
    caveats: ["Kostnad och anpassning styrs av Shopify-modellen"],
    scores: {
      devSpeed: 82,
      editorCms: 88,
      performance: 78,
      seo: 82,
      appCustomization: 75,
      scalability: 88,
      security: 92,
      maintenance: 88,
      cost: 55,
      ecosystem: 92,
    },
  },
  {
    key: "mvc",
    label: "Server-rendered MVC (Django/Laravel/Rails)",
    bestFor: "Team med backendfokus som vill bygga funktionstunga system.",
    summary: "Mogen och stabil modell för affärslogik, men mindre frontend-flexibilitet än modern React/Next-stack.",
    strengths: ["Bra app-logik och serverkontroll", "Mogen teknik med bred kompetens", "Stabil SEO med SSR"],
    caveats: ["Kan bli långsammare att iterera i UI/UX jämfört med komponentbaserad frontend"],
    scores: {
      devSpeed: 70,
      editorCms: 65,
      performance: 82,
      seo: 86,
      appCustomization: 88,
      scalability: 82,
      security: 82,
      maintenance: 78,
      cost: 70,
      ecosystem: 82,
    },
  },
  {
    key: "reactSpaNode",
    label: "React SPA + Node API",
    bestFor: "Produkter med app-beteende där SEO inte är högsta prioritet.",
    summary: "Mycket flexibel app-arkitektur, men tappar ofta SEO och initial prestanda jämfört med SSR/SSG-first upplägg.",
    strengths: ["Maximal frihet för interaktivitet", "Bra för dashboard/portal", "Skalar väl med tydlig API-arkitektur"],
    caveats: ["Svagare SEO om SSR saknas"],
    scores: {
      devSpeed: 70,
      editorCms: 45,
      performance: 85,
      seo: 70,
      appCustomization: 95,
      scalability: 88,
      security: 85,
      maintenance: 72,
      cost: 70,
      ecosystem: 85,
    },
  },
  {
    key: "webflow",
    label: "Webflow",
    bestFor: "Designdrivna sajter som ska lanseras snabbt utan kodteam.",
    summary: "Snabb väg till snygg sajt och bra redigering, men mer begränsat när avancerad logik krävs.",
    strengths: ["Hög dev-hastighet", "Bra redaktörsflöde", "Låg teknisk tröskel i teamet"],
    caveats: ["Mindre flexibilitet för komplex app-funktionalitet"],
    scores: {
      devSpeed: 88,
      editorCms: 88,
      performance: 78,
      seo: 82,
      appCustomization: 60,
      scalability: 78,
      security: 88,
      maintenance: 88,
      cost: 65,
      ecosystem: 65,
    },
  },
  {
    key: "wordpress",
    label: "WordPress (tema + plugins)",
    bestFor: "Innehållstunga sajter med fokus på redaktörsarbete framför produktlogik.",
    summary: "Enorm spridning och CMS-styrka, men långsiktigt kan plugin-beroenden ge prestanda- och säkerhetsskuld.",
    strengths: [
      "Väldigt stark CMS/redaktör",
      "Snabb start med teman/plugins",
      "Stort ekosystem och hög tillgånglighet på kompetens",
    ],
    caveats: ["Prestanda, säkerhet och underhåll varierar kraftigt med plugin- och hostingsetup"],
    scores: {
      devSpeed: 85,
      editorCms: 95,
      performance: 60,
      seo: 82,
      appCustomization: 70,
      scalability: 72,
      security: 55,
      maintenance: 60,
      cost: 85,
      ecosystem: 95,
    },
  },
  {
    key: "wixSquarespace",
    label: "Wix / Squarespace",
    bestFor: "Små bolag som vill publicera snabbt med låg teknisk komplexitet.",
    summary: "Väldigt enkelt att komma igång, men begränsningar märks när kraven på unik funktionalitet ökar.",
    strengths: ["Mycket snabb start", "Lätt att underhålla", "Förutsägbar drift"],
    caveats: ["Lägre tak för avancerad anpassning och skalning"],
    scores: {
      devSpeed: 92,
      editorCms: 82,
      performance: 68,
      seo: 72,
      appCustomization: 50,
      scalability: 68,
      security: 88,
      maintenance: 92,
      cost: 70,
      ecosystem: 65,
    },
  },
]

export function getComparisonScore(method: ComparisonMethod, scenario: ComparisonScenario): number {
  const totalWeight = comparisonParameters.reduce((sum, parameter) => sum + scenario.weights[parameter.key], 0)
  if (totalWeight === 0) return 0
  const weightedTotal = comparisonParameters.reduce(
    (sum, parameter) => sum + method.scores[parameter.key] * scenario.weights[parameter.key],
    0,
  )
  return Math.round(weightedTotal / totalWeight)
}

export const siteTypes = [
  "Restaurangsida",
  "Konsultsajt",
  "Frisårsalong",
  "Webbshop",
  "Portfolio",
  "Hantverkare",
  "Bokningssida",
  "Redovisningsbyrå",
]
