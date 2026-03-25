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
    description: "AI st\u00e4ller fr\u00e5gor",
    placeholder: "Ber\u00e4tta lite om ditt f\u00f6retag s\u00e5 st\u00e4ller v\u00e5r AI f\u00f6ljdfr\u00e5gor...",
  },
  {
    id: "template",
    label: "Template",
    icon: Palette,
    description: "Bl\u00e4ddra v0-templates och v\u00e4lj startpunkt",
    placeholder: "V\u00e4lj en template nedan eller beskriv din vision...",
  },
  {
    id: "audit",
    label: "Audit",
    icon: FileSearch,
    description: "Analysera befintlig sida",
    placeholder: "Klistra in din webbadress h\u00e4r, t.ex. https://mittforetag.se",
  },
  {
    id: "fritext",
    label: "Fritext",
    icon: MessageSquare,
    description: "Beskriv din vision",
    placeholder: "Skriv fritt \u2014 ber\u00e4tta vad du vill skapa...",
  },
]

export type ShapeVariant = "double" | "diamond" | "grid" | "triple" | "fast" | "pulse"

export const features = [
  {
    icon: Code2,
    title: "React & Next.js",
    description:
      "Varje sajt byggs med React 19 och Next.js 16 \u2014 samma ramverk som Spotify, Netflix och Klarna anv\u00e4nder. Snabbt, s\u00f6kv\u00e4nligt och framtidss\u00e4kert.",
    shape: "double" as ShapeVariant,
    modalSubtitle: "Ramverket bakom moderna webben",
    modalDescription:
      "React 19 och Next.js 16 utg\u00f6r ryggraden i varje sajt vi genererar. Server Components renderar sidan p\u00e5 servern f\u00f6r blixtsnabb laddtid, medan klientkomponenter ger interaktivitet utan overhead.",
    highlights: [
      "React 19 Server Components \u2014 HTML streamas direkt, JS skickas bara vid behov",
      "Next.js 16 App Router med layouter, laddningsstates och felgr\u00e4nser",
      "Inkrementell statisk regenerering (ISR) \u2014 statisk snabbhet, dynamisk fr\u00e4sch\u00f6r",
      "Automatisk koddelning per route och komponent",
    ],
    codeFile: "next.config.ts",
    codeSnippet: `import type { NextConfig } from "next"\n\nconst config: NextConfig = {\n  reactStrictMode: true,\n  images: { formats: ["image/avif", "image/webp"] },\n  experimental: { ppr: true },\n}\nexport default config`,
  },
  {
    icon: Server,
    title: "Node.js & Edge Functions",
    description:
      "Serverledd rendering och edge-funktioner som k\u00f6rs p\u00e5 Vercel. Din sajt laddas blixtsnabbt oavsett var i Sverige dina kunder befinner sig.",
    shape: "diamond" as ShapeVariant,
    modalSubtitle: "Millisekunder till din kund",
    modalDescription:
      "Edge Functions k\u00f6rs p\u00e5 Vercels globala n\u00e4tverk med noder i Stockholm och hela Europa. Cold start under 50ms inneb\u00e4r att din sajt alltid svarar snabbt \u2014 oavsett var bes\u00f6karen befinner sig.",
    highlights: [
      "Vercel Edge Runtime \u2014 < 50ms kall-start globalt",
      "Automatisk geo-routing till n\u00e4rmaste datacenter",
      "Streaming SSR f\u00f6r progressiv rendering av stora sidor",
      "Proxy (tidigare middleware) f\u00f6r auth, redirects och A/B-tester",
    ],
    codeFile: "proxy.ts",
    codeSnippet: `import { NextResponse } from "next/server"\nimport type { NextRequest } from "next/server"\n\nexport function proxy(req: NextRequest) {\n  const country = req.geo?.country ?? "SE"\n  const res = NextResponse.next()\n  res.headers.set("x-geo", country)\n  return res\n}`,
  },
  {
    icon: Layers,
    title: "Tailwind CSS & Headless UI",
    description:
      "Pixel-perfekt design med Tailwind CSS v4 och tillg\u00e4ngliga komponenter. Responsivt p\u00e5 alla sk\u00e4rmar, fr\u00e5n mobil till widescreen.",
    shape: "grid" as ShapeVariant,
    modalSubtitle: "Design utan kompromisser",
    modalDescription:
      "Tailwind CSS v4 med JIT-kompilering ger pixel-perfekt kontroll utan att skeppa oanv\u00e4nd CSS. Kombinerat med Headless UI f\u00e5r du tillg\u00e4ngliga, ostylda komponenter som du kan forma helt fritt.",
    highlights: [
      "Tailwind CSS v4 \u2014 JIT-kompilering, noll oanv\u00e4nd CSS i produktion",
      "Design tokens och custom themes f\u00f6r konsekvent varum\u00e4rke",
      "Headless UI-komponenter med inbyggd ARIA och tangentbordsnavigering",
      "Mobile-first responsive design \u2014 fungerar perfekt p\u00e5 alla sk\u00e4rmar",
    ],
    codeFile: "button.tsx",
    codeSnippet: `import { cva } from "class-variance-authority"\n\nconst button = cva(\n  "inline-flex items-center justify-center rounded-lg " +\n  "font-medium transition-colors focus-visible:ring-2",\n  {\n    variants: {\n      variant: {\n        primary: "bg-primary text-primary-foreground",\n        outline: "border border-border bg-transparent",\n      },\n    },\n  }\n)`,
  },
  {
    icon: ShieldCheck,
    title: "TypeScript & Zod-validering",
    description:
      "Typs\u00e4ker kod genomg\u00e5ende med TypeScript och Zod. F\u00e4rre buggar, s\u00e4krare formul\u00e4r och robust datahantering fr\u00e5n dag ett.",
    shape: "triple" as ShapeVariant,
    modalSubtitle: "Typs\u00e4kerhet i varje lager",
    modalDescription:
      "Med TypeScript i strict mode och Zod-schemas f\u00e5ngas fel redan vid kompilering \u2014 inte i produktion. Fr\u00e5n databasschema till API-respons till formul\u00e4rvalidering: varje steg \u00e4r typat.",
    highlights: [
      "TypeScript strict mode \u2014 inga implicit any, inga null-krascher",
      "Zod-schemas validerar all indata p\u00e5 server och klient",
      "End-to-end typs\u00e4kerhet: Drizzle \u2192 server actions/API \u2192 React-formul\u00e4r",
      "Automatisk TypeScript-generering fr\u00e5n API-kontrakt",
    ],
    codeFile: "schema.ts",
    codeSnippet: `import { z } from "zod"\n\nexport const contactSchema = z.object({\n  name: z.string().min(2, "Namn kr\u00e4vs"),\n  email: z.string().email("Ogiltig e-post"),\n  phone: z.string()\n    .regex(/^\\\\+?[\\\\d\\\\s-]{7,}$/, "Ogiltigt nummer")\n    .optional(),\n  message: z.string().min(10, "Minst 10 tecken"),\n})\n\nexport type ContactForm = z.infer<typeof contactSchema>`,
  },
  {
    icon: Gauge,
    title: "Lighthouse 95+",
    description:
      "Inbyggd s\u00f6kmotoroptimering, tillg\u00e4nglighet (WCAG 2.1) och prestanda-optimering. Varje sajt siktar p\u00e5 gr\u00f6nt i alla Lighthouse-kategorier.",
    shape: "fast" as ShapeVariant,
    modalSubtitle: "Gr\u00f6nt i alla kategorier",
    modalDescription:
      "Lighthouse m\u00e4ter prestanda, tillg\u00e4nglighet, SEO och best practices. V\u00e5ra sajter siktar p\u00e5 95+ i varje kategori \u2014 inte genom tricks, utan genom r\u00e4tt arkitektur fr\u00e5n start.",
    highlights: [
      "Core Web Vitals: LCP < 1.2s, INP < 200ms, CLS < 0.1",
      "Automatisk bildoptimering med next/image och AVIF/WebP",
      "WCAG 2.1 AA-tillg\u00e4nglighet \u2014 semantisk HTML, ARIA, kontrastcheck",
      "Strukturerad data (JSON-LD) och optimerade meta-taggar f\u00f6r SEO",
    ],
    codeFile: "layout.tsx",
    codeSnippet: `import type { Metadata } from "next"\n\nexport const metadata: Metadata = {\n  title: "Mitt F\u00f6retag | Professionella tj\u00e4nster",\n  openGraph: {\n    type: "website",\n    locale: "sv_SE",\n    images: [{ url: "/og.png", width: 1200, height: 630 }],\n  },\n  robots: { index: true, follow: true },\n}`,
  },
  {
    icon: Smartphone,
    title: "PWA & Offline-redo",
    description:
      "Progressive Web App-st\u00f6d s\u00e5 att dina kunder kan installera sajten p\u00e5 mobilen. Push-notiser, offline-cache och app-k\u00e4nsla.",
    shape: "pulse" as ShapeVariant,
    modalSubtitle: "Appen utan App Store",
    modalDescription:
      "Med PWA-st\u00f6d kan dina bes\u00f6kare installera sajten som en app direkt fr\u00e5n webbl\u00e4saren. Service Workers hanterar caching och offline-st\u00f6d, medan Web Push API m\u00f6jligg\u00f6r notiser.",
    highlights: [
      "Service Worker med precaching av kritiska resurser",
      "Web App Manifest \u2014 install\u00e9rbar direkt p\u00e5 hemsk\u00e4rmen",
      "Push-notiser via Web Push API f\u00f6r kundengagemang",
      "Offline-first strategi med stale-while-revalidate",
    ],
    codeFile: "manifest.json",
    codeSnippet: `{\n  "name": "Mitt F\u00f6retag",\n  "short_name": "MittF\u00f6retag",\n  "start_url": "/",\n  "display": "standalone",\n  "background_color": "#0a0a0a",\n  "theme_color": "#2dd4bf",\n  "icons": [\n    { "src": "/icon-192.png", "sizes": "192x192" },\n    { "src": "/icon-512.png", "sizes": "512x512" }\n  ]\n}`,
  },
]

export type TechStackItem = {
  name: string
  category: string
  detail: string
  icon: LucideIcon
  glow: string
}

export const techStack: TechStackItem[] = [
  { name: "React 19", category: "Frontend", detail: "Server Components", icon: Code2, glow: "rgba(56, 189, 248, 0.16)" },
  { name: "Next.js 16", category: "Framework", detail: "App Router", icon: Layers, glow: "rgba(148, 163, 184, 0.14)" },
  { name: "TypeScript", category: "Språk", detail: "Strict mode", icon: Braces, glow: "rgba(59, 130, 246, 0.16)" },
  { name: "Tailwind CSS v4", category: "Styling", detail: "Design tokens", icon: Wind, glow: "rgba(45, 212, 191, 0.16)" },
  { name: "Node.js", category: "Runtime", detail: "API & automation", icon: Server, glow: "rgba(74, 222, 128, 0.16)" },
  { name: "Vercel Edge", category: "Hosting", detail: "Global rendering", icon: Rocket, glow: "rgba(244, 244, 245, 0.12)" },
  { name: "PostgreSQL", category: "Databas", detail: "Relational core", icon: Database, glow: "rgba(96, 165, 250, 0.15)" },
  { name: "Zod", category: "Validering", detail: "Trusted input", icon: ShieldCheck, glow: "rgba(250, 204, 21, 0.15)" },
  { name: "Drizzle ORM", category: "ORM", detail: "Typsäkra SQL-queries", icon: GitBranch, glow: "rgba(167, 139, 250, 0.16)" },
  { name: "Stripe", category: "Betalning", detail: "Checkout & billing", icon: CreditCard, glow: "rgba(139, 92, 246, 0.16)" },
  { name: "Resend", category: "E-post", detail: "Transactional flows", icon: Send, glow: "rgba(251, 146, 60, 0.15)" },
  { name: "Vercel Analytics", category: "Insikter", detail: "Analytics + Speed Insights", icon: Activity, glow: "rgba(244, 63, 94, 0.16)" },
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
    description: "Ge feedback, klicka vidare och f\u00e5 en sajt som fungerar p\u00e5 riktigt \u2014 inte en statisk mockup.",
    bullets: ["Sex till sju f\u00f6rb\u00e4ttringar mot r\u00e4tt version", "Design, struktur och inneh\u00e5ll i samma fl\u00f6de"],
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
  { value: "~30 sek", label: "F\u00f6rsta utkast", tooltip: "Beroende p\u00e5 komplexitet" },
  { value: "95+", label: "Google-po\u00e4ng", tooltip: "Prestanda, tillg\u00e4nglighet, SEO" },
  { value: "100%", label: "Mobilanpassat", tooltip: "Responsiv design p\u00e5 alla sk\u00e4rmar" },
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
    description: "Perfekt f\u00f6r att testa",
    features: ["AI-generering & f\u00f6rfining", "Aldrig utg\u00e5ngsdatum", "Eng\u00e5ngsk\u00f6p - ingen prenumeration"],
    cta: "K\u00f6p Starter",
  },
  {
    id: "25_credits",
    name: "Popular",
    credits: 25,
    price: 99,
    popular: true,
    savings: 19,
    description: "B\u00e4sta balans f\u00f6r de flesta",
    features: ["AI-generering & f\u00f6rfining", "Aldrig utg\u00e5ngsdatum", "Eng\u00e5ngsk\u00f6p - ingen prenumeration"],
    cta: "K\u00f6p Popular",
  },
  {
    id: "50_credits",
    name: "Pro",
    credits: 50,
    price: 179,
    popular: false,
    savings: 27,
    description: "F\u00f6r h\u00f6gre tempo och fler iterationer",
    features: ["AI-generering & f\u00f6rfining", "Aldrig utg\u00e5ngsdatum", "Eng\u00e5ngsk\u00f6p - ingen prenumeration"],
    cta: "K\u00f6p Pro",
  },
]

export const studioTiers = [
  { name: "Start", range: "5 000 - 10 000 kr", description: "1-5 sidor, grundl\u00e4ggande anpassning" },
  { name: "Plus", range: "10 000 - 20 000 kr", description: "5-10 sidor, mer funktionalitet" },
  { name: "Pro", range: "20 000 - 40 000+ kr", description: "Unika l\u00f6sningar, integrationer och e-handel" },
]

export const studioTeam = [
  { name: "Jakob", role: "Strategi & flöden" },
  { name: "Erik", role: "Design & konvertering" },
  { name: "Teamet", role: "Kod, integrationer & lansering" },
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
  { name: "Vercel", detail: "Preview & deploy", icon: Rocket, glow: "rgba(148, 163, 184, 0.14)" },
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
  { key: "editorCms", label: "Redakt\u00f6r/CMS" },
  { key: "performance", label: "Prestanda" },
  { key: "seo", label: "SEO" },
  { key: "appCustomization", label: "App-anpassning" },
  { key: "scalability", label: "Skalbarhet" },
  { key: "security", label: "S\u00e4kerhet" },
  { key: "maintenance", label: "Underh\u00e5ll" },
  { key: "cost", label: "Kostnad" },
  { key: "ecosystem", label: "Ekosystem" },
]

export const comparisonScenarios: ComparisonScenario[] = [
  {
    id: "growth",
    label: "Tillv\u00e4xt & m\u00e4tbarhet",
    description:
      "Viktning f\u00f6r sm\u00e5f\u00f6retag som vill v\u00e4xa med SEO, prestanda, integrationer och m\u00f6jlighet att bygga vidare till portal/app.",
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
    label: "Redakt\u00f6r & enkel drift",
    description:
      "Fokus p\u00e5 att redigera inneh\u00e5ll snabbt och h\u00e5lla nere teknisk komplexitet i vardagen f\u00f6r team utan utvecklare.",
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
    label: "Prestanda & framtidss\u00e4kring",
    description:
      "Tyngdpunkt p\u00e5 Core Web Vitals, s\u00e4kerhet och teknisk flexibilitet n\u00e4r sajten ska t\u00e5la avancerade funktioner \u00f6ver tid.",
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
    bestFor: "F\u00f6retag som vill kombinera snabb sajt med framtida app-funktioner.",
    summary: "Balanserar topprestanda, SEO och utvecklingsfrihet utan att l\u00e5sa fast aff\u00e4ren i ett plugin-ekosystem.",
    strengths: ["Stark p\u00e5 prestanda och SEO", "H\u00f6g app-anpassning och skalbarhet", "Bra s\u00e4kerhetsniv\u00e5 med modern stack"],
    caveats: ["Redakt\u00f6rsfl\u00f6de kr\u00e4ver ofta headless CMS eller anpassad admin"],
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
    bestFor: "Team som vill ha b\u00e5de redakt\u00f6rsgr\u00e4nssnitt och modern frontend.",
    summary: "Vanlig hybrid n\u00e4r man vill beh\u00e5lla WordPress f\u00f6r content men f\u00e5 fart, SEO och UX fr\u00e5n Next.js.",
    strengths: ["Mycket stark CMS-upplevelse", "N\u00e4stan samma frontend-f\u00f6rdelar som ren Next", "Stort ekosystem"],
    caveats: ["Tv\u00e5 system att drifta ger h\u00f6gre underh\u00e5ll och mer komplex kostnadsbild"],
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
    bestFor: "Landningssidor med minimalt attackutrymme och mycket h\u00f6g fart.",
    summary: "Ger extrem prestanda och l\u00e5g driftkostnad, men kr\u00e4ver mer struktur f\u00f6r inneh\u00e5llsarbete och app-funktioner.",
    strengths: ["Mycket h\u00f6g prestanda och s\u00e4kerhet", "Skalar och driftar billigt", "Bra f\u00f6r SEO och statiskt inneh\u00e5ll"],
    caveats: ["Svagare redakt\u00f6rsfl\u00f6de och mindre app-k\u00e4nsla utan extra setup"],
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
    bestFor: "F\u00f6retag d\u00e4r e-handel \u00e4r huvudfl\u00f6det fr\u00e5n dag ett.",
    summary: "Stabil e-handelsplattform med snabb start, men mindre frihet och h\u00f6gre plattformskostnad \u00f6ver tid.",
    strengths: ["V\u00e4ldigt stark f\u00f6r e-handel", "L\u00e5g driftfriktion", "H\u00f6g s\u00e4kerhet och bra ekosystem"],
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
    summary: "Mogen och stabil modell f\u00f6r aff\u00e4rslogik, men mindre frontend-flexibilitet \u00e4n modern React/Next-stack.",
    strengths: ["Bra app-logik och serverkontroll", "Mogen teknik med bred kompetens", "Stabil SEO med SSR"],
    caveats: ["Kan bli l\u00e5ngsammare att iterera i UI/UX j\u00e4mf\u00f6rt med komponentbaserad frontend"],
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
    bestFor: "Produkter med app-beteende d\u00e4r SEO inte \u00e4r h\u00f6gsta prioritet.",
    summary: "Mycket flexibel app-arkitektur, men tappar ofta SEO och initial prestanda j\u00e4mf\u00f6rt med SSR/SSG-first uppl\u00e4gg.",
    strengths: ["Maximal frihet f\u00f6r interaktivitet", "Bra f\u00f6r dashboard/portal", "Skalar v\u00e4l med tydlig API-arkitektur"],
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
    summary: "Snabb v\u00e4g till snygg sajt och bra redigering, men mer begr\u00e4nsat n\u00e4r avancerad logik kr\u00e4vs.",
    strengths: ["H\u00f6g dev-hastighet", "Bra redakt\u00f6rsfl\u00f6de", "L\u00e5g teknisk tr\u00f6skel i teamet"],
    caveats: ["Mindre flexibilitet f\u00f6r komplex app-funktionalitet"],
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
    bestFor: "Inneh\u00e5llstunga sajter med fokus p\u00e5 redakt\u00f6rsarbete framf\u00f6r produktlogik.",
    summary: "Enorm spridning och CMS-styrka, men l\u00e5ngsiktigt kan plugin-beroenden ge prestanda- och s\u00e4kerhetsskuld.",
    strengths: [
      "V\u00e4ldigt stark CMS/redakt\u00f6r",
      "Snabb start med teman/plugins",
      "Stort ekosystem och h\u00f6g tillg\u00e5nglighet p\u00e5 kompetens",
    ],
    caveats: ["Prestanda, s\u00e4kerhet och underh\u00e5ll varierar kraftigt med plugin- och hostingsetup"],
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
    bestFor: "Sm\u00e5 bolag som vill publicera snabbt med l\u00e5g teknisk komplexitet.",
    summary: "V\u00e4ldigt enkelt att komma ig\u00e5ng, men begr\u00e4nsningar m\u00e4rks n\u00e4r kraven p\u00e5 unik funktionalitet \u00f6kar.",
    strengths: ["Mycket snabb start", "L\u00e4tt att underh\u00e5lla", "F\u00f6ruts\u00e4gbar drift"],
    caveats: ["L\u00e4gre tak f\u00f6r avancerad anpassning och skalning"],
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
  "Fris\u00f6rsalong",
  "Webbshop",
  "Portfolio",
  "Hantverkare",
  "Bokningssida",
  "Redovisningsbyr\u00e5",
]
