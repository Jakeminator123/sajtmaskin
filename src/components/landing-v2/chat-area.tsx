"use client"

import {
  MessageSquare,
  ArrowUp,
  Mic,
  Zap,
  Rocket,
  X,
  Check,
  Video,
  Layout,
  MessageCircleQuestion,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Palette,
  Code2,
  Smartphone,
  ShieldCheck,
  Gauge,
  Layers,
  Server,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useRef, useEffect, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react"
import { useRouter } from "next/navigation"
import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent"
import { createProject } from "@/lib/project-client"
import { toast } from "sonner"
import { ParticleOrb } from "@/components/landing-v2/particle-orb"
import { LanyardBadge } from "@/components/landing-v2/lanyard-badge"
import { VoiceRecorder } from "@/components/forms/voice-recorder"

/* ──────────────────── 3D TILT HOOK ──────────────────── */

function use3DTilt(intensity = 12) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState({ transform: "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)" })

  const handleMove = useCallback(
    (e: ReactMouseEvent) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      setStyle({
        transform: `perspective(800px) rotateX(${-y * intensity}deg) rotateY(${x * intensity}deg) scale(1.02)`,
      })
    },
    [intensity]
  )

  const handleLeave = useCallback(() => {
    setStyle({ transform: "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)" })
  }, [])

  return { ref, style, handleMove, handleLeave }
}

/* ──────────────────── TERMINAL TYPEWRITER HOOK ──────────────────── */

function useTerminalTypewriter() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleLines, setVisibleLines] = useState(0)
  const [cursorLine, setCursorLine] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const totalLines = 6
          let line = 0
          const interval = setInterval(() => {
            line++
            setVisibleLines(line)
            setCursorLine(line)
            if (line >= totalLines) clearInterval(interval)
          }, 420)
        }
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { containerRef, visibleLines, cursorLine }
}

/* ──────────────────── DATA ──────────────────── */

const categories = [
  {
    id: "mall",
    label: "Mall",
    icon: Layout,
    description: "Webbplats / App",
    placeholder: "Vilken typ av webbplats vill du skapa? Ber\u00e4tta om ditt f\u00f6retag...",
  },
  {
    id: "analyserad",
    label: "Analyserad",
    icon: MessageCircleQuestion,
    description: "AI st\u00e4ller fr\u00e5gor",
    placeholder: "Ber\u00e4tta lite om ditt f\u00f6retag s\u00e5 st\u00e4ller v\u00e5r AI f\u00f6ljdfr\u00e5gor...",
  },
  {
    id: "kategori",
    label: "Kategori",
    icon: Palette,
    description: "V\u00e4lj typ av sida",
    placeholder: "V\u00e4lj en kategori nedan eller beskriv din vision...",
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

type LandingRouteTarget = {
  buildMethod: BuildMethod
  buildIntent: BuildIntent
  source?: string
}

function resolveRouteTarget(categoryId: string | null): LandingRouteTarget {
  switch (categoryId) {
    case "mall":
      return { buildMethod: "category", buildIntent: "template" }
    case "analyserad":
      return { buildMethod: "wizard", buildIntent: "website" }
    case "kategori":
      return { buildMethod: "category", buildIntent: "template" }
    case "audit":
      return { buildMethod: "audit", buildIntent: "website", source: "audit" }
    case "fritext":
    default:
      return { buildMethod: "freeform", buildIntent: "website" }
  }
}

type ShapeVariant = "double" | "diamond" | "grid" | "triple" | "fast" | "pulse"

const features = [
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
      "End-to-end typs\u00e4kerhet: Prisma \u2192 tRPC/API \u2192 React-formul\u00e4r",
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

const techStack = [
  { name: "React 19", category: "Frontend" },
  { name: "Next.js 16", category: "Framework" },
  { name: "TypeScript", category: "Spr\u00e5k" },
  { name: "Tailwind CSS v4", category: "Styling" },
  { name: "Node.js", category: "Runtime" },
  { name: "Vercel Edge", category: "Hosting" },
  { name: "PostgreSQL", category: "Databas" },
  { name: "Zod", category: "Validering" },
  { name: "Prisma", category: "ORM" },
  { name: "Stripe", category: "Betalning" },
  { name: "Resend", category: "E-post" },
  { name: "Sentry", category: "Monitoring" },
]

const steps = [
  {
    number: "01",
    title: "Beskriv ditt f\u00f6retag",
    description: "Ber\u00e4tta om din verksamhet med text, r\u00f6st eller video. V\u00e5r AI f\u00f6rst\u00e5r kontexten.",
  },
  {
    number: "02",
    title: "AI skapar din sajt",
    description: "P\u00e5 under 5 sekunder genereras en skr\u00e4ddarsydd, responsiv webbplats med modern teknik.",
  },
  {
    number: "03",
    title: "Anpassa & publicera",
    description: "Finjustera med drag-and-drop och publicera med ett enda klick till Vercel Edge.",
  },
]

const stats = [
  { value: "~30 sek", label: "F\u00f6rsta utkast", tooltip: "Beroende p\u00e5 komplexitet" },
  { value: "React 19", label: "Frontend", tooltip: "Server Components & Actions" },
  { value: "95+", label: "Lighthouse", tooltip: "Performance, A11y, SEO, PWA" },
  { value: "Vercel", label: "Deploy", tooltip: "Edge Network, global CDN" },
]

const creditPackages = [
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

const creditCostBreakdown = [
  { label: "Generering (Mini)", cost: "5" },
  { label: "Generering (Pro)", cost: "7" },
  { label: "Generering (Max)", cost: "10" },
  { label: "F\u00f6rfining (Mini)", cost: "3" },
  { label: "F\u00f6rfining (Pro)", cost: "4" },
  { label: "F\u00f6rfining (Max)", cost: "6" },
  { label: "Wizard-l\u00e4ge", cost: "11" },
  { label: "Audit (Basic)", cost: "15" },
  { label: "Audit (Advanced)", cost: "25" },
  { label: "Publicering", cost: "20" },
  { label: "Hosting (per m\u00e5nad)", cost: "10" },
]

const studioTiers = [
  { name: "Start", range: "5 000 - 10 000 kr", description: "1-5 sidor, grundl\u00e4ggande anpassning" },
  { name: "Plus", range: "10 000 - 20 000 kr", description: "5-10 sidor, mer funktionalitet" },
  { name: "Pro", range: "20 000 - 40 000+ kr", description: "Unika l\u00f6sningar, integrationer och e-handel" },
]

const faqs = [
  {
    q: "Beh\u00f6ver jag kunna programmera?",
    a: "Nej, absolut inte. SajtMaskin \u00e4r byggt f\u00f6r att vem som helst ska kunna skapa en professionell hemsida. Ber\u00e4tta bara om ditt f\u00f6retag s\u00e5 sk\u00f6ter AI:n resten. Under huven anv\u00e4nds React och Next.js, men du beh\u00f6ver aldrig r\u00f6ra en rad kod.",
  },
  {
    q: "Vilken teknik byggs mina sidor med?",
    a: "Alla sajter byggs med React 19, Next.js 16, TypeScript och Tailwind CSS \u2014 samma teknikstack som v\u00e4rldens ledande webbplatser anv\u00e4nder. Det inneb\u00e4r topprestanda, SEO och framtidss\u00e4kerhet.",
  },
  {
    q: "Hur snabbt kan jag f\u00e5 en f\u00e4rdig sajt?",
    a: "Det f\u00f6rsta utkastet genereras p\u00e5 cirka 5 sekunder. Sedan kan du finjustera och publicera n\u00e4r du \u00e4r n\u00f6jd \u2014 ofta inom samma dag.",
  },
  {
    q: "Kan jag anv\u00e4nda min egna dom\u00e4n?",
    a: "Ja! Med Pro-planen och upp\u00e5t kan du koppla din egen dom\u00e4n med automatisk SSL. Vi hj\u00e4lper dig med DNS-inst\u00e4llningarna.",
  },
  {
    q: "\u00c4r det GDPR-anpassat?",
    a: "Ja. Plattformen \u00e4r byggd med GDPR i \u00e5tanke. Databas och lagring k\u00f6rs inom EU (Supabase EU, Vercel Edge Network) och vi samlar inte in on\u00f6diga personuppgifter.",
  },
  {
    q: "Kan jag byta plan n\u00e4r som helst?",
    a: "Ja, du kan uppgradera eller nedgradera din plan n\u00e4r som helst utan bindningstid.",
  },
]

const trustLogos = [
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

type ComparisonParamKey =
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

type ComparisonScenarioId = "growth" | "editor" | "speed"

type ComparisonParameter = {
  key: ComparisonParamKey
  label: string
}

type ComparisonMethod = {
  key: string
  label: string
  bestFor: string
  summary: string
  strengths: string[]
  caveats: string[]
  scores: Record<ComparisonParamKey, number>
}

type ComparisonScenario = {
  id: ComparisonScenarioId
  label: string
  description: string
  weights: Record<ComparisonParamKey, number>
}

const comparisonParameters: ComparisonParameter[] = [
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

const comparisonScenarios: ComparisonScenario[] = [
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

const comparisonMethods: ComparisonMethod[] = [
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

function getComparisonScore(method: ComparisonMethod, scenario: ComparisonScenario): number {
  const totalWeight = comparisonParameters.reduce((sum, parameter) => sum + scenario.weights[parameter.key], 0)
  if (totalWeight === 0) return 0
  const weightedTotal = comparisonParameters.reduce(
    (sum, parameter) => sum + method.scores[parameter.key] * scenario.weights[parameter.key],
    0,
  )
  return Math.round(weightedTotal / totalWeight)
}

const siteTypes = [
  "Restaurangsida",
  "Konsultsajt",
  "Fris\u00f6rsalong",
  "Webbshop",
  "Portfolio",
  "Hantverkare",
  "Bokningssida",
  "Redovisningsbyr\u00e5",
]

/* ──────────────────── HONEST COUNTER HOOK ──────────────────── */

function useHonestCounter(fakeTarget: number, realValue: number, message: string) {
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState<"idle" | "inflating" | "glitch" | "honest">("idle")
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          setPhase("inflating")

          // Phase 1: Count up fast to the fake number
          const duration = 1600
          const start = performance.now()
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1)
            // Ease-out for dramatic effect
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.floor(eased * fakeTarget))
            if (progress < 1) {
              requestAnimationFrame(step)
            } else {
              // Phase 2: Brief pause, then "glitch"
              setTimeout(() => {
                setPhase("glitch")
                // Rapid glitch numbers
                let glitchCount = 0
                const glitchInterval = setInterval(() => {
                  setCount(Math.floor(Math.random() * fakeTarget))
                  glitchCount++
                  if (glitchCount > 8) {
                    clearInterval(glitchInterval)
                    // Phase 3: Drop to real number
                    setCount(realValue)
                    setPhase("honest")
                  }
                }, 60)
              }, 800)
            }
          }
          requestAnimationFrame(step)
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [fakeTarget, realValue])

  return { count, phase, ref, message }
}

/* ──────────────────── ROTATING SITE TYPE ──────────────────── */

function useRotatingText(items: string[], interval = 2400) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % items.length)
        setVisible(true)
      }, 300)
    }, interval)
    return () => clearInterval(timer)
  }, [items.length, interval])

  return { text: items[index], visible }
}

/* ──────────────────── SCROLL TRIGGER ──────────────────── */

function useInView(threshold = 0.3) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}

/* ──────────────────── FAQ ITEM ──────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border/30 rounded-xl overflow-hidden transition-colors hover:border-border/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-sm md:text-base font-medium text-foreground">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">{a}</p>
      </div>
    </div>
  )
}

/* ──────────────────── 3D WIREFRAME COMPONENTS ──────────────────── */

const modalParticles = [
  { x: 22, y: 28, dur: 4.2, delay: -1.3 },
  { x: 72, y: 18, dur: 3.7, delay: -0.5 },
  { x: 38, y: 72, dur: 5.1, delay: -2.4 },
  { x: 58, y: 35, dur: 3.9, delay: -1.8 },
  { x: 28, y: 58, dur: 4.5, delay: -3.1 },
  { x: 78, y: 62, dur: 3.3, delay: -0.9 },
  { x: 48, y: 22, dur: 4.8, delay: -2.7 },
  { x: 65, y: 78, dur: 3.6, delay: -1.6 },
]

type MeshProps = { size: number; className: string; borderOpacity?: number }

function CubeMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const face = (transform: string) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    border: `1px solid oklch(0.72 0.15 192 / ${borderOpacity})`,
    background: `oklch(0.72 0.15 192 / 0.02)`,
    transform,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={face(`translateZ(${half}px)`)} />
      <div style={face(`rotateY(180deg) translateZ(${half}px)`)} />
      <div style={face(`rotateY(90deg) translateZ(${half}px)`)} />
      <div style={face(`rotateY(-90deg) translateZ(${half}px)`)} />
      <div style={face(`rotateX(90deg) translateZ(${half}px)`)} />
      <div style={face(`rotateX(-90deg) translateZ(${half}px)`)} />
    </div>
  )
}

function SphereMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const ring = (ry: number, rx = 0) => ({
    position: "absolute" as const,
    width: size, height: size,
    borderRadius: "50%",
    border: `1px solid oklch(0.72 0.15 192 / ${borderOpacity})`,
    transform: `rotateY(${ry}deg) rotateX(${rx}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={ring(0)} />
      <div style={ring(60)} />
      <div style={ring(120)} />
      <div style={ring(0, 90)} />
    </div>
  )
}

function PyramidMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const tri = (ry: number) => ({
    position: "absolute" as const,
    width: size, height: size,
    clipPath: "polygon(50% 8%, 8% 92%, 92% 92%)",
    background: `linear-gradient(to bottom, oklch(0.72 0.15 192 / ${borderOpacity * 0.6}), oklch(0.72 0.15 192 / ${borderOpacity * 0.08}))`,
    transform: `rotateY(${ry}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={tri(0)} />
      <div style={tri(60)} />
      <div style={tri(120)} />
    </div>
  )
}

function OctaMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const diamond = (ry: number) => ({
    position: "absolute" as const,
    width: size, height: size,
    clipPath: "polygon(50% 5%, 95% 50%, 50% 95%, 5% 50%)",
    background: `linear-gradient(135deg, oklch(0.72 0.15 192 / ${borderOpacity * 0.5}), oklch(0.72 0.15 192 / ${borderOpacity * 0.08}))`,
    transform: `rotateY(${ry}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={diamond(0)} />
      <div style={diamond(60)} />
      <div style={diamond(120)} />
    </div>
  )
}

function RingMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const s = size * 0.85
  const pad = (size - s) / 2
  const ring = (ry: number, rx: number) => ({
    position: "absolute" as const,
    width: s, height: s,
    left: pad, top: pad,
    borderRadius: "50%",
    border: `1.5px solid oklch(0.72 0.15 192 / ${borderOpacity})`,
    transform: `rotateY(${ry}deg) rotateX(${rx}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={ring(0, 65)} />
      <div style={ring(60, 65)} />
      <div style={ring(120, 65)} />
    </div>
  )
}

function HexMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const s = size * 0.85
  const pad = (size - s) / 2
  const hex = (z: number) => ({
    position: "absolute" as const,
    width: s, height: s,
    left: pad, top: pad,
    clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
    background: `linear-gradient(135deg, oklch(0.72 0.15 192 / ${borderOpacity * 0.25}), oklch(0.72 0.15 192 / ${borderOpacity * 0.06}))`,
    transform: `translateZ(${z}px)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={hex(size * 0.22)} />
      <div style={hex(0)} />
      <div style={hex(-size * 0.22)} />
    </div>
  )
}

function renderMiniShape(variant: ShapeVariant) {
  switch (variant) {
    case "double": return <CubeMesh size={44} className="wf-spin-slow" borderOpacity={0.8} />
    case "diamond": return <SphereMesh size={50} className="wf-spin-slow" borderOpacity={0.6} />
    case "grid": return <HexMesh size={48} className="wf-spin-slow" borderOpacity={0.7} />
    case "triple": return <PyramidMesh size={50} className="wf-spin-slow" borderOpacity={0.7} />
    case "fast": return <OctaMesh size={46} className="wf-spin-slow" borderOpacity={0.8} />
    case "pulse": return <RingMesh size={50} className="wf-spin-slow" borderOpacity={0.6} />
  }
}

function WireframeShape({ variant }: { variant: ShapeVariant }) {
  const configs: Record<ShapeVariant, React.ReactNode> = {
    double: (
      <>
        <CubeMesh size={120} className="wf-spin" borderOpacity={0.2} />
        <CubeMesh size={68} className="wf-spin-reverse" borderOpacity={0.12} />
      </>
    ),
    diamond: (
      <>
        <SphereMesh size={120} className="wf-spin-slow" borderOpacity={0.22} />
        <SphereMesh size={70} className="wf-spin-reverse" borderOpacity={0.12} />
      </>
    ),
    grid: (
      <>
        <HexMesh size={120} className="wf-spin-slow" borderOpacity={0.3} />
        <HexMesh size={72} className="wf-spin-slow-offset" borderOpacity={0.15} />
      </>
    ),
    triple: (
      <>
        <PyramidMesh size={130} className="wf-spin" borderOpacity={0.28} />
        <PyramidMesh size={75} className="wf-spin-reverse" borderOpacity={0.15} />
      </>
    ),
    fast: (
      <>
        <OctaMesh size={120} className="wf-spin-fast" borderOpacity={0.3} />
        <OctaMesh size={65} className="wf-spin-reverse" borderOpacity={0.15} />
      </>
    ),
    pulse: (
      <>
        <RingMesh size={120} className="wf-spin-pulse" borderOpacity={0.25} />
        <RingMesh size={70} className="wf-spin-reverse" borderOpacity={0.12} />
      </>
    ),
  }

  return (
    <div className="relative" style={{ width: 200, height: 200, perspective: 800 }}>
      {configs[variant]}
      <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
    </div>
  )
}

/* ──────────────────── ANIMATED BAR ──────────────────── */

function AnimatedBar({
  value,
  max = 100,
  delay = 0,
  className,
  barClass,
}: {
  value: number
  max?: number
  delay?: number
  className?: string
  barClass?: string
}) {
  const { ref, visible } = useInView(0.2)
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div ref={ref} className={`h-1.5 rounded-full bg-secondary/60 overflow-hidden ${className ?? ""}`}>
      <div
        className={`h-full rounded-full transition-all duration-1000 ease-out ${barClass ?? "bg-primary/70"}`}
        style={{
          width: visible ? `${pct}%` : "0%",
          transitionDelay: `${delay}ms`,
        }}
      />
    </div>
  )
}

/* ──────────────────── LIGHTHOUSE GAUGES ──────────────────── */

const lighthouseScores = [
  { label: "Performance", score: 96 },
  { label: "Tillg\u00e4nglighet", score: 98 },
  { label: "Best Practices", score: 100 },
  { label: "SEO", score: 98 },
]

function LighthouseGauges() {
  const { ref, visible } = useInView(0.25)
  return (
    <div ref={ref} className="flex flex-wrap justify-center gap-8 md:gap-14 mt-14">
      {lighthouseScores.map((item, i) => {
        const r = 40
        const c = 2 * Math.PI * r
        const offset = c - (item.score / 100) * c
        return (
          <div key={item.label} className="flex flex-col items-center gap-3">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r={r}
                  fill="none" stroke="oklch(0.15 0 0)" strokeWidth="3.5"
                />
                <circle
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke="oklch(0.72 0.15 192)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={visible ? offset : c}
                  style={{
                    transition: `stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.2}s`,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`text-xl font-(--font-heading) transition-all duration-700 ${visible ? "text-foreground opacity-100" : "text-muted-foreground opacity-0"}`}
                  style={{ transitionDelay: `${i * 0.2 + 0.6}s` }}
                >
                  {item.score}
                </span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ──────────────────── FEATURE CARD ──────────────────── */

function FeatureCard({
  feature,
  onClick,
  index = 0,
}: {
  feature: (typeof features)[number]
  onClick: () => void
  index?: number
}) {
  const { ref: scrollRef, visible: scrollVisible } = useInView(0.15)
  const Icon = feature.icon

  const handleMouse = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    el.style.setProperty("--glow-x", `${e.clientX - rect.left}px`)
    el.style.setProperty("--glow-y", `${e.clientY - rect.top}px`)
  }, [])

  return (
    <div
      ref={scrollRef}
      className={`card-3d group relative bg-card/50 backdrop-blur-sm rounded-2xl border border-border/20 p-6 flex flex-col gap-4 hover:border-primary/20 cursor-pointer overflow-hidden transition-all duration-700 ${scrollVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      style={{ transitionDelay: `${index * 100}ms` }}
      onClick={onClick}
      onMouseMove={handleMouse}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick()
      }}
    >
      {/* Mouse-follow radial glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(250px circle at var(--glow-x, 50%) var(--glow-y, 50%), oklch(0.72 0.15 192 / 0.07) 0%, transparent 70%)",
        }}
      />

      {/* Mini wireframe decoration — unique shape per card */}
      <div
        className="absolute -top-1 -right-1 opacity-[0.08] group-hover:opacity-[0.25] transition-opacity duration-700 pointer-events-none"
        style={{ width: 80, height: 80, perspective: 400 }}
      >
        {renderMiniShape(feature.shape)}
      </div>

      <div className="relative z-10 w-11 h-11 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center group-hover:bg-primary/12 group-hover:border-primary/25 transition-colors">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <h3 className="relative z-10 text-base text-foreground font-(--font-heading)">
        {feature.title}
      </h3>
      <p className="relative z-10 text-sm text-muted-foreground leading-relaxed">
        {feature.description}
      </p>
      <span className="relative z-10 text-xs text-primary/60 group-hover:text-primary transition-colors mt-auto flex items-center gap-1">
        L&auml;s mer <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
      </span>

      {/* Bottom edge glow */}
      <div className="absolute bottom-0 left-[10%] right-[10%] h-px bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </div>
  )
}

/* ──────────────────── FEATURE MODAL ──────────────────── */

function FeatureModal({
  feature,
  onClose,
}: {
  feature: (typeof features)[number] | null
  onClose: () => void
}) {
  if (!feature) return null

  const Icon = feature.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl modal-backdrop-enter" />

      <div
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border border-border/30 rounded-3xl shadow-2xl modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          aria-label="St&auml;ng"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 3D Shape Header */}
        <div className="relative h-52 md:h-64 overflow-hidden rounded-t-3xl bg-linear-to-b from-secondary/40 to-transparent border-b border-border/20">
          <div className="absolute inset-0 grid-background opacity-[0.15]" />
          <div className="modal-scan-line" />
          <div className="absolute inset-0 flex items-center justify-center">
            <WireframeShape variant={feature.shape} />
          </div>
          {modalParticles.map((p, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-primary/40"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                animation: `float-particle-kf ${p.dur}s ease-in-out infinite`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-card/95 to-transparent" />
        </div>

        {/* Content */}
        <div className="px-7 md:px-8 pb-8 -mt-8 relative z-10">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-(--font-heading) text-foreground">{feature.title}</h3>
              <p className="text-sm text-primary/70">{feature.modalSubtitle}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-7">
            {feature.modalDescription}
          </p>

          <div className="space-y-3 mb-7">
            {feature.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-3 group/h">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-[7px] shrink-0 group-hover/h:scale-150 transition-transform" />
                <span className="text-sm text-foreground/80 leading-relaxed">{h}</span>
              </div>
            ))}
          </div>

          <div className="bg-secondary/30 border border-border/20 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/15">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-chart-4/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
              <span className="ml-2 text-xs text-muted-foreground font-mono">{feature.codeFile}</span>
            </div>
            <pre className="p-4 text-[11px] md:text-xs font-mono text-muted-foreground leading-relaxed overflow-x-auto">
              <code>{feature.codeSnippet}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────── MAIN COMPONENT ──────────────────── */

export interface ChatAreaProps {
  selectedCategory?: string | null
  onSelectedCategoryChange?: (id: string | null) => void
  expandedContent?: React.ReactNode
  heroPrefix?: React.ReactNode
  auditUrl?: string
  onAuditUrlChange?: (url: string) => void
  onAuditSubmit?: () => void
}

export function ChatArea({
  selectedCategory: controlledCategory,
  onSelectedCategoryChange,
  expandedContent,
  heroPrefix,
  auditUrl,
  onAuditUrlChange,
  onAuditSubmit,
}: ChatAreaProps = {}) {
  const router = useRouter()
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [internalCategory, setInternalCategory] = useState<string | null>("fritext")
  const selectedCategory = controlledCategory !== undefined ? controlledCategory : internalCategory
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeFeature, setActiveFeature] = useState<(typeof features)[number] | null>(null)
  const [activeComparisonScenarioId, setActiveComparisonScenarioId] = useState<ComparisonScenarioId>("growth")
  const [selectedComparisonMethodKey, setSelectedComparisonMethodKey] = useState("next")
  const activeComparisonScenario =
    comparisonScenarios.find((scenario) => scenario.id === activeComparisonScenarioId) ?? comparisonScenarios[0]!
  const rankedComparisonMethods = useMemo(
    () =>
      comparisonMethods
        .map((method) => ({
          method,
          total: getComparisonScore(method, activeComparisonScenario),
        }))
        .sort((a, b) => b.total - a.total),
    [activeComparisonScenario],
  )
  const fallbackComparisonMethod = comparisonMethods[0]!
  const selectedComparisonMethod = useMemo(
    () =>
      rankedComparisonMethods.find((entry) => entry.method.key === selectedComparisonMethodKey) ?? {
        method: fallbackComparisonMethod,
        total: getComparisonScore(fallbackComparisonMethod, activeComparisonScenario),
      },
    [activeComparisonScenario, fallbackComparisonMethod, rankedComparisonMethods, selectedComparisonMethodKey],
  )
  const comparisonLeaderScore = rankedComparisonMethods[0]?.total ?? selectedComparisonMethod.total
  const wordpressComparisonMethod = comparisonMethods.find((method) => method.key === "wordpress") ?? fallbackComparisonMethod
  const wordpressScenarioScore = getComparisonScore(wordpressComparisonMethod, activeComparisonScenario)
  const selectedVsWordpressDelta = selectedComparisonMethod.total - wordpressScenarioScore
  const selectedComparisonDrivers = useMemo(
    () =>
      comparisonParameters
        .map((parameter) => {
          const weight = activeComparisonScenario.weights[parameter.key]
          const score = selectedComparisonMethod.method.scores[parameter.key]
          return {
            parameter,
            weight,
            score,
            weightedContribution: Math.round((score * weight) / 100),
          }
        })
        .sort((a, b) => b.weightedContribution - a.weightedContribution),
    [activeComparisonScenario, selectedComparisonMethod],
  )
  const websitesCounter = useHonestCounter(2480, 3, "Varje stor resa b\u00f6rjar med tre steg. Dessa tre sajter laddar dock p\u00e5 under 50ms.")
  const usersCounter = useHonestCounter(850, 2, "Tv\u00e5 f\u00f6retagare som valde framtiden. Snart \u00e4r ni hundratals.")
  const rotatingType = useRotatingText(siteTypes)
  const headlineTilt = use3DTilt(10)
  const terminal = useTerminalTypewriter()
  const [terminalMouse, setTerminalMouse] = useState({ x: 0, y: 0 })
  const terminalBoxRef = useRef<HTMLDivElement>(null)

  const handleTerminalMouse = useCallback((e: ReactMouseEvent) => {
    const el = terminalBoxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setTerminalMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const activeCategory = categories.find((c) => c.id === selectedCategory)

  useEffect(() => {
    if (!activeFeature) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveFeature(null)
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [activeFeature])
  const isAuditMode = selectedCategory === "audit"
  const currentAuditUrl = auditUrl ?? inputValue

  const handleAuditUrlChange = useCallback(
    (value: string) => {
      if (onAuditUrlChange) {
        onAuditUrlChange(value)
        return
      }
      setInputValue(value)
    },
    [onAuditUrlChange],
  )

  useEffect(() => {
    if (isAuditMode && showVoiceRecorder) {
      setShowVoiceRecorder(false)
    }
  }, [isAuditMode, showVoiceRecorder])

  const startBuild = useCallback(
    async (categoryOverride?: string | null, promptOverride?: string) => {
      if (isSubmitting) return

      const targetCategory = categoryOverride ?? selectedCategory
      const prompt = (promptOverride ?? inputValue).trim()
      const routeTarget = resolveRouteTarget(targetCategory)

      setIsSubmitting(true)

      try {
        const categoryLabel = categories.find((category) => category.id === targetCategory)?.label ?? "Sajt"
        const project = await createProject(
          `${categoryLabel} - ${new Date().toLocaleDateString("sv-SE")}`,
          routeTarget.buildMethod,
          prompt ? prompt.slice(0, 100) : undefined,
        )

        const params = new URLSearchParams()
        params.set("project", project.id)
        params.set("buildMethod", routeTarget.buildMethod)
        params.set("buildIntent", routeTarget.buildIntent)
        if (routeTarget.source) {
          params.set("source", routeTarget.source)
        }

        if (prompt.length > 0) {
          const response = await fetch("/api/prompts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              source: routeTarget.source ?? routeTarget.buildMethod,
              projectId: project.id,
            }),
          })

          const data = (await response.json().catch(() => null)) as
            | {
                success?: boolean
                promptId?: string
                error?: string
              }
            | null

          if (!response.ok || !data?.promptId) {
            throw new Error(data?.error || "Kunde inte spara prompten")
          }

          params.set("promptId", data.promptId)
        }

        router.push(`/builder?${params.toString()}`)
      } catch (error) {
        console.error("[LandingV2] Failed to start builder flow:", error)
        toast.error(error instanceof Error ? error.message : "Kunde inte starta buildern")
      } finally {
        setIsSubmitting(false)
      }
    },
    [inputValue, isSubmitting, router, selectedCategory],
  )

  const submitPrimaryInput = useCallback(() => {
    if (isAuditMode && onAuditSubmit) {
      onAuditSubmit()
      return
    }
    void startBuild()
  }, [isAuditMode, onAuditSubmit, startBuild])

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="shader-orb shader-orb-1" />
        <div className="shader-orb shader-orb-2" />
        <div className="shader-orb shader-orb-3" />
      </div>
      <div className="absolute inset-0 opacity-[0.06] grid-background" />
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-soft-light pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Scrollable content */}
      <div
        className="relative z-10 flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
        data-scroll-container
      >

        {/* ━━━ HERO ━━━ */}
        <section className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 pt-10 pb-8 supports-[height:100svh]:min-h-[calc(100svh-57px)] md:pt-16 md:pb-12">
          {heroPrefix}
          {/* Particle orb */}
          <div className="relative mb-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <ParticleOrb />
          </div>

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/8 border border-primary/15 px-4 py-1.5 rounded-full mb-5 animate-fade-up"
            style={{ animationDelay: "0.2s" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Byggd med React, Next.js & TypeScript
          </div>

          {/* Headline with 3D tilt */}
          <div
            ref={headlineTilt.ref}
            onMouseMove={headlineTilt.handleMove}
            onMouseLeave={headlineTilt.handleLeave}
            style={{ ...headlineTilt.style, transition: "transform 0.15s ease-out", willChange: "transform" }}
            className="cursor-default"
          >
            <h1
              className="text-3xl md:text-5xl lg:text-6xl text-foreground mb-4 text-center font-(--font-heading) tracking-tight text-balance animate-fade-up leading-[1.1]"
              style={{ animationDelay: "0.3s" }}
            >
              Din n&auml;sta{" "}
              <span className="relative inline-block">
                <span
                  className={`text-primary transition-all duration-300 inline-block ${rotatingType.visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 -translate-y-3 blur-sm"}`}
                >
                  {rotatingType.text}
                </span>
                {/* Underline glow */}
                <span className="absolute -bottom-1 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
              </span>
              <br className="hidden md:block" />
              {" "}p&aring; 30 sekunder
            </h1>
          </div>
          <p
            className="text-base md:text-lg text-muted-foreground text-center max-w-2xl mb-8 leading-relaxed animate-fade-up text-pretty"
            style={{ animationDelay: "0.4s" }}
          >
            Beskriv ditt f&ouml;retag &mdash; v&aring;r AI bygger en professionell sajt med React och Next.js &aring;t dig.
            Inga f&ouml;rkunskaper kr&auml;vs. Anpassat f&ouml;r svenska sm&aring;f&ouml;retagare.
          </p>

          {/* Category buttons */}
          <div
            className="flex flex-wrap items-center justify-center gap-2.5 mb-8 animate-fade-up"
            style={{ animationDelay: "0.5s" }}
          >
            {categories.map((cat, i) => {
              const Icon = cat.icon
              const isActive = selectedCategory === cat.id
              // Each button gets a unique hover accent
              const hoverColors = [
                "hover:border-sky-500/40 hover:shadow-sky-500/10",
                "hover:border-violet-500/40 hover:shadow-violet-500/10",
                "hover:border-amber-500/40 hover:shadow-amber-500/10",
                "hover:border-rose-500/40 hover:shadow-rose-500/10",
                "hover:border-emerald-500/40 hover:shadow-emerald-500/10",
              ]
              const iconHoverColors = [
                "group-hover:text-sky-400",
                "group-hover:text-violet-400",
                "group-hover:text-amber-400",
                "group-hover:text-rose-400",
                "group-hover:text-emerald-400",
              ]
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    const newVal = isActive ? null : cat.id
                    if (onSelectedCategoryChange) {
                      onSelectedCategoryChange(newVal)
                    } else {
                      setInternalCategory(newVal)
                    }
                  }}
                  className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${
                    isActive
                      ? "bg-primary/12 border-primary/40 text-foreground shadow-lg shadow-primary/5 -translate-y-0.5"
                      : `bg-secondary/50 border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/70 ${hoverColors[i]}`
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-all duration-300 ${
                      isActive
                        ? "text-primary"
                        : `text-muted-foreground ${iconHoverColors[i]}`
                    } group-hover:scale-110`}
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium leading-tight">{cat.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{cat.description}</span>
                  </div>
                  {/* Subtle glow dot on hover */}
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-current scale-0 group-hover:scale-100" />
                </button>
              )
            })}
          </div>

          {/* Input area */}
          <div className={`w-full ${isAuditMode ? "max-w-xl" : "max-w-2xl"} animate-fade-up`} style={{ animationDelay: "0.6s" }}>
            {showVoiceRecorder && !isAuditMode && (
              <div className="mb-3 input-3d bg-secondary/80 backdrop-blur-xl rounded-2xl border border-border/50 px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-2 fade-in duration-300">
                <div className="flex items-center justify-between gap-4">
                  <VoiceRecorder
                    compact
                    language="sv"
                    onTranscript={(t) => {
                      setInputValue((prev) => (prev ? prev + " " + t : t))
                      setShowVoiceRecorder(false)
                    }}
                    onRecordingChange={() => {}}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowVoiceRecorder(false)}
                    aria-label="Stäng röstinspelning"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className={`input-3d bg-secondary/50 backdrop-blur-xl rounded-2xl border border-border/30 ${isAuditMode ? "p-3" : "p-4"} shadow-2xl`}>
              <div className={isAuditMode ? "space-y-2" : "space-y-3"}>
                {isAuditMode ? (
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder={activeCategory?.placeholder ?? "Klistra in din webbadress här, t.ex. https://mittforetag.se"}
                    value={currentAuditUrl}
                    onChange={(e) => handleAuditUrlChange(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        submitPrimaryInput()
                      }
                    }}
                    className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 text-base font-normal leading-relaxed py-2"
                  />
                ) : (
                  <textarea
                    placeholder={activeCategory?.placeholder ?? "Beskriv ditt f\u00f6retag \u2014 t.ex. \u201dJag driver en fris\u00f6rsalong i G\u00f6teborg med 3 anst\u00e4llda\u201d"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        submitPrimaryInput()
                      }
                    }}
                    className="w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/60 text-base min-h-[68px] font-normal leading-relaxed"
                  />
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border/15">
                  <p className="text-xs text-muted-foreground">
                    {activeCategory
                      ? `L\u00e4ge: ${activeCategory.label}`
                      : "V\u00e4lj en kategori ovan eller skriv fritt"}
                  </p>
                  <div className="flex items-center gap-2">
                    {!isAuditMode && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                          onClick={() => setShowVoiceRecorder((v) => !v)}
                          aria-label="Spela in röst"
                        >
                          <Mic className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                          aria-label="Spela in video (tillgänglig i wizard)"
                          title="Videoinspelning med analys av hållning och blickkontakt finns i Analyserad-wizarden"
                        >
                          <Video className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                      aria-label="Skicka"
                      disabled={isSubmitting || (isAuditMode && currentAuditUrl.trim().length === 0)}
                      onClick={() => {
                        submitPrimaryInput()
                      }}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {expandedContent && (
            <div className="w-full flex justify-center mt-8 animate-fade-up">
              {expandedContent}
            </div>
          )}

          {/* Stats badges */}
          <div
            className="flex flex-wrap items-center justify-center gap-3 md:gap-4 mt-10 animate-fade-up"
            style={{ animationDelay: "0.7s" }}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="group relative flex items-center gap-2 bg-secondary/40 border border-border/20 hover:border-primary/30 rounded-xl px-4 py-2.5 transition-all duration-300 hover:bg-secondary/60 cursor-default"
              >
                <span className="text-base md:text-lg text-primary font-(--font-heading) transition-transform duration-300 group-hover:scale-105">
                  {stat.value}
                </span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                {/* Tooltip */}
                <span className="absolute -top-9 left-1/2 -translate-x-1/2 text-[10px] text-foreground bg-card border border-border/30 rounded-lg px-2.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none -translate-y-1 group-hover:translate-y-0 shadow-lg">
                  {stat.tooltip}
                </span>
              </div>
            ))}
          </div>

          {/* Scroll hint */}
          <div className="mt-12 animate-fade-up opacity-40" style={{ animationDelay: "1s" }}>
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Scrolla ner</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground animate-bounce" />
            </div>
          </div>
        </section>

        {/* ━━━ TRUST MARQUEE ━━━ */}
        <section className="py-10 border-t border-border/15">
          <p className="text-xs text-muted-foreground/60 text-center mb-1.5 tracking-widest uppercase">
            Byggd med samma teknik som
          </p>
          <p className="text-[10px] text-muted-foreground/40 text-center mb-6">
            Dessa f&ouml;retag anv&auml;nder React &amp; Next.js &mdash; samma ramverk vi bygger din sajt med
          </p>
          <div className="relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-32 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-32 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee whitespace-nowrap">
              {[...trustLogos, ...trustLogos].map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className="mx-10 text-base md:text-lg text-muted-foreground/30 font-(--font-heading) tracking-tight select-none"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ FEATURES - TECH FOCUS ━━━ */}
        <section id="funktioner" className="px-6 py-20 md:py-28">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">State of the Art</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Samma teknik som tech-j&auml;ttarna
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed text-pretty">
                Vi levererar sajter byggda med produktionsklar kod i React, Next.js och TypeScript &mdash; inte dra-och-sl&auml;pp-byggen som faller ihop.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, i) => (
                <FeatureCard
                  key={feature.title}
                  feature={feature}
                  onClick={() => setActiveFeature(feature)}
                  index={i}
                />
              ))}
            </div>

            <LighthouseGauges />
          </div>
        </section>

        {/* ━━━ SITE BUILD METHOD COMPARISON ━━━ */}
        <section className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">J&auml;mf&ouml;relse</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Olika s&auml;tt att bygga sajt
              </h2>
              <p className="text-muted-foreground max-w-3xl mx-auto leading-relaxed text-pretty">
                H&auml;r j&auml;mf&ouml;r vi 9 metoder fr&aring;n matrisen i <code>docs/analyses/sajtmaskin-matris.md</code> med 10 parametrar. V&auml;lj scenario
                f&ouml;r att se hur rankingen f&ouml;r&auml;ndras beroende p&aring; vad som &auml;r viktigast f&ouml;r ditt bolag.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 mb-3">
              {comparisonScenarios.map((scenario) => {
                const isActive = scenario.id === activeComparisonScenario.id
                return (
                  <button
                    key={scenario.id}
                    onClick={() => setActiveComparisonScenarioId(scenario.id)}
                    aria-pressed={isActive}
                    className={`rounded-xl border px-4 py-2 text-sm transition-all cursor-pointer ${
                      isActive
                        ? "bg-primary/12 border-primary/40 text-foreground shadow-lg shadow-primary/5"
                        : "bg-secondary/40 border-border/20 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {scenario.label}
                  </button>
                )
              })}
            </div>
            <p className="text-center text-xs text-muted-foreground/70 mb-8 max-w-2xl mx-auto leading-relaxed">
              {activeComparisonScenario.description}
            </p>

            <div className="grid gap-5 lg:grid-cols-[1.65fr_1fr]">
              <div className="rounded-2xl border border-border/20 overflow-hidden bg-card/30 backdrop-blur-sm">
                <div className="grid grid-cols-[48px_1fr_auto] gap-3 items-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider border-b border-border/20 text-muted-foreground">
                  <span>#</span>
                  <span>Metod</span>
                  <span>Total</span>
                </div>

                {rankedComparisonMethods.map((entry, index) => {
                  const isSelected = entry.method.key === selectedComparisonMethod.method.key
                  const behindLeader = Math.max(0, comparisonLeaderScore - entry.total)
                  return (
                    <button
                      key={entry.method.key}
                      onClick={() => setSelectedComparisonMethodKey(entry.method.key)}
                      aria-pressed={isSelected}
                      className={`w-full text-left px-4 py-3.5 border-b border-border/10 transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/8" : "hover:bg-secondary/25"
                      }`}
                    >
                      <div className="grid grid-cols-[48px_1fr_auto] gap-3 items-center">
                        <span
                          className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs ${
                            isSelected
                              ? "border-primary/50 text-primary bg-primary/10"
                              : "border-border/30 text-muted-foreground"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{entry.method.label}</p>
                          <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">{entry.method.bestFor}</p>
                          <AnimatedBar value={entry.total} className="mt-2" delay={index * 80} />
                        </div>
                        <div className="text-right">
                          <p className="text-lg text-foreground font-(--font-heading) leading-none">{entry.total}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {behindLeader === 0 ? "Ledare" : `-${behindLeader} fr\u00e5n #1`}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-sm p-5">
                <p className="text-[11px] uppercase tracking-wider text-primary/80 font-semibold">Vald metod</p>
                <h3 className="mt-2 text-lg text-foreground font-(--font-heading)">{selectedComparisonMethod.method.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{selectedComparisonMethod.method.summary}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary font-medium">
                    Score {selectedComparisonMethod.total}/100
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 ${
                      selectedVsWordpressDelta >= 0
                        ? "border-primary/25 text-primary/90 bg-primary/5"
                        : "border-destructive/35 text-destructive/90 bg-destructive/5"
                    }`}
                  >
                    {selectedVsWordpressDelta >= 0 ? `+${selectedVsWordpressDelta}` : selectedVsWordpressDelta} mot WordPress
                  </span>
                </div>

                <div className="mt-5 space-y-2.5">
                  {selectedComparisonMethod.method.strengths.map((strength) => (
                    <div key={strength} className="flex items-start gap-2 text-sm text-foreground/85">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{strength}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-border/15">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-2">Att tänka på</p>
                  {selectedComparisonMethod.method.caveats.map((caveat) => (
                    <p key={caveat} className="text-sm text-muted-foreground leading-relaxed">
                      {caveat}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border/20 bg-card/20 p-5">
              <p className="text-sm text-foreground font-medium">Varf&ouml;r den h&auml;r score:n?</p>
              <p className="text-xs text-muted-foreground mt-1">
                Toppfaktorer i vald scenario-viktning f&ouml;r <span className="text-foreground">{selectedComparisonMethod.method.label}</span>.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {selectedComparisonDrivers.slice(0, 4).map((driver) => (
                  <div key={driver.parameter.key} className="rounded-xl border border-border/15 bg-secondary/30 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs mb-2">
                      <span className="text-foreground/90">{driver.parameter.label}</span>
                      <span className="text-muted-foreground">
                        {driver.score}p • vikt {driver.weight}
                      </span>
                    </div>
                    <AnimatedBar value={driver.score} />
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Bidrar med ungef\u00e4r {driver.weightedContribution} po\u00e4ng till totalen.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border/20 bg-card/20 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
                <p className="text-sm text-foreground font-medium">Alla 10 parametrar</p>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary/70" />
                    <span className="text-muted-foreground">{selectedComparisonMethod.method.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="text-muted-foreground">WordPress</span>
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Viktade po&auml;ng per parameter. Scenario-viktning justerar rankingen.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {comparisonParameters.map((parameter, idx) => {
                  const selectedScore = selectedComparisonMethod.method.scores[parameter.key]
                  const wpScore = wordpressComparisonMethod.scores[parameter.key]
                  const weight = activeComparisonScenario.weights[parameter.key]
                  const delta = selectedScore - wpScore
                  return (
                    <div key={parameter.key} className="rounded-xl border border-border/15 bg-secondary/20 px-3.5 py-3">
                      <div className="flex items-center justify-between gap-2 text-xs mb-2.5">
                        <span className="text-foreground/90 font-medium">{parameter.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground/50 text-[10px]">vikt&nbsp;{weight}</span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              delta >= 0
                                ? "text-primary bg-primary/8"
                                : "text-destructive bg-destructive/8"
                            }`}
                          >
                            {delta >= 0 ? `+${delta}` : delta}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <AnimatedBar value={selectedScore} className="h-[7px]!" delay={idx * 60} />
                        <AnimatedBar value={wpScore} className="h-[7px]!" barClass="bg-muted-foreground/25" delay={idx * 60 + 150} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground/50">
                        <span>{selectedScore}p</span>
                        <span>{wpScore}p</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ TECH STACK SHOWCASE ━━━ */}
        <section id="teknik" className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Teknisk stack</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Varje sajt levereras med
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed text-pretty">
                Produktionsklar infrastruktur &mdash; ingen WordPress, inga kompromisser.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {techStack.map((tech) => (
                <div
                  key={tech.name}
                  className="group relative bg-secondary/30 hover:bg-secondary/50 border border-border/20 hover:border-primary/25 rounded-xl px-4 py-4 flex flex-col gap-1.5 transition-all duration-200 cursor-default"
                >
                  <span className="text-sm text-foreground font-(--font-heading) group-hover:text-primary transition-colors">
                    {tech.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{tech.category}</span>
                </div>
              ))}
            </div>

            {/* Terminal-style code snippet with typewriter + cursor glow */}
            <div
              ref={(node) => {
                // Merge refs
                (terminal.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
                ;(terminalBoxRef as React.MutableRefObject<HTMLDivElement | null>).current = node
              }}
              onMouseMove={handleTerminalMouse}
              className="group/term mt-10 bg-secondary/20 border border-border/20 rounded-2xl overflow-hidden relative"
            >
              {/* Mouse-follow radial glow */}
              <div
                className="pointer-events-none absolute inset-0 z-10 opacity-0 group-hover/term:opacity-100 transition-opacity duration-300"
                style={{
                  background: `radial-gradient(320px circle at ${terminalMouse.x}px ${terminalMouse.y}px, rgba(45,212,191,0.06) 0%, transparent 70%)`,
                }}
              />

              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/15 relative z-20">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-chart-4/60" />
                <div className="w-3 h-3 rounded-full bg-primary/60" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">sajtmaskin generate</span>
              </div>
              <div className="p-5 font-mono text-sm leading-relaxed relative z-20">
                {/* Line 1 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 1 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary">$</span> npx sajtmaskin generate --type=webbplats
                  {terminal.cursorLine === 1 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 2 */}
                <p className={`text-muted-foreground mt-2 transition-all duration-500 ${terminal.visibleLines >= 2 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Analyserar f&ouml;retagsbeskrivning...
                  {terminal.cursorLine === 2 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 3 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 3 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Genererar React-komponenter...
                  {terminal.cursorLine === 3 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 4 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 4 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Konfigurerar Next.js routing...
                  {terminal.cursorLine === 4 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 5 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 5 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Optimerar f&ouml;r Lighthouse 95+...
                  {terminal.cursorLine === 5 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 6 - success */}
                <p className={`mt-2 transition-all duration-700 ${terminal.visibleLines >= 6 ? "opacity-100 translate-x-0 text-foreground" : "opacity-0 -translate-x-4 text-muted-foreground"}`}>
                  <span className="text-primary">{"✓"}</span> Klar! Publicerad till{" "}
                  <span className="text-primary underline">mittforetag.sajtmaskin.se</span>
                  {terminal.cursorLine === 6 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ LANYARD BADGE ━━━ */}
        <section className="relative border-t border-border/15 overflow-hidden">
          <div className="max-w-3xl mx-auto px-6 pt-16 pb-0 text-center">
            <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Kvalitet i leveransen</p>
            <h2 className="text-2xl md:text-3xl text-foreground font-(--font-heading) tracking-tight text-balance mb-2">
              Sajter som ser bra ut och konverterar
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed text-pretty">
              Vi bygger f&ouml;r riktiga f&ouml;retag: tydlig struktur, snabb prestanda och design som leder till fler f&ouml;rfr&aring;gningar.
            </p>
          </div>
          <LanyardBadge />
        </section>

        {/* ━━━ HOW IT WORKS ━━━ */}
        <section id="hur-det-fungerar" className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Hur det fungerar</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Tre steg till din nya hemsida
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed text-pretty">
                Fr&aring;n id&eacute; till publicerad sajt p&aring; n&aring;gra minuter.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <div key={step.number} className="relative flex flex-col items-center text-center gap-4">
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-linear-to-r from-primary/30 to-primary/5" />
                  )}
                  <div className="w-16 h-16 rounded-2xl bg-primary/8 border border-primary/20 flex items-center justify-center relative">
                    <span className="text-xl text-primary font-(--font-heading)">{step.number}</span>
                  </div>
                  <h3 className="text-base text-foreground font-(--font-heading)">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ HONEST COUNTER STRIP ━━━ */}
        <section className="px-6 py-14 border-t border-b border-border/15 bg-secondary/20">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20">
            {[websitesCounter, usersCounter].map((counter, idx) => (
              <div key={idx} className="flex flex-col items-center">
                {idx > 0 && <div className="hidden md:block absolute w-px h-12 bg-border/30" style={{ marginLeft: "-5rem" }} />}
                <div className="text-center" ref={counter.ref}>
                  <p
                    className={`text-3xl md:text-4xl font-(--font-heading) transition-all duration-300 ${
                      counter.phase === "glitch"
                        ? "text-destructive animate-pulse scale-110"
                        : counter.phase === "honest"
                          ? "text-primary"
                          : "text-primary"
                    }`}
                  >
                    <span className={counter.phase === "glitch" ? "inline-block animate-pulse" : ""}>
                      {counter.phase === "honest"
                        ? counter.count
                        : counter.count.toLocaleString("sv-SE") + "+"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {idx === 0 ? "Webbplatser skapade" : "Aktiva f\u00f6retagare"}
                  </p>
                  {counter.phase === "honest" && (
                    <p className="text-xs mt-2.5 max-w-[280px] leading-relaxed animate-fade-up text-muted-foreground italic">
                      {counter.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {websitesCounter.phase === "honest" && (
            <p className="text-center text-xs text-muted-foreground/50 mt-6 animate-fade-up" style={{ animationDelay: "0.3s" }}>
              Alla j&auml;ttar b&ouml;rjade sm&aring;tt. Vi r&auml;knar varje sajt &mdash; och just nu kan vi r&auml;kna till tre. Bli nummer fyra?
            </p>
          )}
        </section>

        {/* ━━━ PRICING ━━━ */}
        <section id="priser" className="px-6 py-20 md:py-28">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Priser</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Credits &amp; tjänster
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed text-pretty">
                Samma priser som p&aring; buy-credits-sidan: eng&aring;ngsk&ouml;p av credits, inga bindningstider.
              </p>
              <div className="inline-flex items-center gap-2 mt-5 text-xs font-medium text-primary bg-primary/8 border border-primary/15 px-4 py-1.5 rounded-full flex-wrap justify-center">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span>Credits g&auml;ller f&ouml;r alltid och k&ouml;ps som eng&aring;ngspaket.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {creditPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`card-3d rounded-2xl border p-7 flex flex-col gap-5 transition-all duration-300 ${
                    pkg.popular
                      ? "bg-primary/5 border-primary/30 relative md:scale-105 md:-my-2 shadow-xl shadow-primary/5"
                      : "bg-card/50 border-border/20 hover:border-border/40"
                  }`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground bg-primary px-3 py-1 rounded-full">
                      Popul\u00e4rast
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg text-foreground font-(--font-heading)">{pkg.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{pkg.description}</p>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl text-foreground font-(--font-heading)">{pkg.price} kr</span>
                    <span className="text-sm text-muted-foreground mb-1">{pkg.credits} credits</span>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">
                    {(pkg.price / pkg.credits).toFixed(1)} kr/credit
                    {pkg.savings > 0 ? ` • spara ${pkg.savings}%` : ""}
                  </p>
                  <div className="h-px bg-border/20" />
                  <ul className="space-y-3 flex-1">
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full font-medium mt-2 ${
                      pkg.popular
                        ? "btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                        : "btn-3d bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/30"
                    }`}
                    onClick={() => router.push("/buy-credits")}
                    disabled={isSubmitting}
                  >
                    {pkg.cta}
                    {pkg.popular && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-16">
              <h3 className="text-center text-xl font-semibold text-foreground mb-8">Kostnad per åtgärd</h3>
              <div className="grid gap-3 sm:grid-cols-2 max-w-2xl mx-auto">
                {creditCostBreakdown.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-2.5"
                  >
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-semibold text-foreground">{item.cost} credits</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-14">
              <h3 className="text-center text-xl font-semibold text-foreground mb-6">
                Behöver du mer än credits?
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                {studioTiers.map((tier, index) => (
                  <div
                    key={tier.name}
                    className={`rounded-xl border p-5 bg-card/50 ${
                      index === 1 ? "border-primary/30" : "border-border/20"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{tier.name}</p>
                    <p className="text-base font-bold text-foreground mt-1">{tier.range}</p>
                    <p className="text-sm text-muted-foreground mt-2">{tier.description}</p>
                  </div>
                ))}
              </div>
              <div className="text-center mt-6">
                <Button
                  variant="ghost"
                  className="text-sm text-primary hover:text-primary/80 hover:bg-primary/5 border border-primary/20"
                  onClick={() => {
                    window.location.href = "mailto:jakob.olof.eberg@gmail.com,erik@sajtstudio.se"
                  }}
                >
                  Kontakta SajtStudio
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ FAQ ━━━ */}
        <section id="faq" className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Vanliga fr&aring;gor</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance">
                Fr&aring;gor &amp; svar
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <FaqItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ CTA ━━━ */}
        <section className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-4xl text-foreground mb-4 font-(--font-heading) tracking-tight text-balance">
              Redo att ta ditt f&ouml;retag online?
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed text-pretty max-w-md mx-auto">
              B&ouml;rja gratis &mdash; ingen kod, inga kreditkort, inga bindningstider. Bara en sajt byggd med riktig teknik.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-base px-8 shadow-lg shadow-primary/25"
                disabled={isSubmitting}
                onClick={() => {
                  const ctaCategory = selectedCategory === "audit" ? "fritext" : selectedCategory ?? "fritext"
                  void startBuild(ctaCategory)
                }}
              >
                Skapa din sajt nu
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground text-base"
                onClick={() => router.push("/templates")}
              >
                Se en demo
              </Button>
            </div>
          </div>
        </section>

        {/* ━━━ FOOTER ━━━ */}
        <footer className="px-6 py-10 border-t border-border/15">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                  <span className="text-sm text-foreground font-(--font-heading)">SajtMaskin</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
                  AI-driven webbplatsgenerering med React &amp; Next.js f&ouml;r svenska f&ouml;retagare.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Produkt</h4>
                <ul className="space-y-2">
                  <li><a href="#funktioner" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Funktioner</a></li>
                  <li><a href="#teknik" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Teknik</a></li>
                  <li><a href="#priser" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Priser</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Mallar</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">F&ouml;retag</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Om oss</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Blogg</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Karri&auml;r</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Kontakt</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Juridiskt</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Integritetspolicy</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Anv&auml;ndarvillkor</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">GDPR</a></li>
                  <li><a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cookies</a></li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border/15">
              <p className="text-xs text-muted-foreground/60">
                &copy; {new Date().getFullYear()} SajtMaskin AB. Alla r&auml;ttigheter f&ouml;rbeh&aring;llna.
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">LinkedIn</a>
                <a href="#" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">Twitter</a>
                <a href="#" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">Instagram</a>
              </div>
            </div>
          </div>
        </footer>

      </div>

      <FeatureModal feature={activeFeature} onClose={() => setActiveFeature(null)} />
    </main>
  )
}
