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
import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from "react"
import { useRouter } from "next/navigation"
import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent"
import { createProject } from "@/lib/project-client"
import toast from "react-hot-toast"
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

const features = [
  {
    icon: Code2,
    title: "React & Next.js",
    description:
      "Varje sajt byggs med React 19 och Next.js 16 \u2014 samma ramverk som Spotify, Netflix och Klarna anv\u00e4nder. Snabbt, s\u00f6kv\u00e4nligt och framtidss\u00e4kert.",
  },
  {
    icon: Server,
    title: "Node.js & Edge Functions",
    description:
      "Serverledd rendering och edge-funktioner som k\u00f6rs p\u00e5 Vercel. Din sajt laddas blixtsnabbt oavsett var i Sverige dina kunder befinner sig.",
  },
  {
    icon: Layers,
    title: "Tailwind CSS & Headless UI",
    description:
      "Pixel-perfekt design med Tailwind CSS v4 och tillg\u00e4ngliga komponenter. Responsivt p\u00e5 alla sk\u00e4rmar, fr\u00e5n mobil till widescreen.",
  },
  {
    icon: ShieldCheck,
    title: "TypeScript & Zod-validering",
    description:
      "Typs\u00e4ker kod genomg\u00e5ende med TypeScript och Zod. F\u00e4rre buggar, s\u00e4krare formul\u00e4r och robust datahantering fr\u00e5n dag ett.",
  },
  {
    icon: Gauge,
    title: "Lighthouse 100/100",
    description:
      "Inbyggd s\u00f6kmotoroptimering, tillg\u00e4nglighet (WCAG 2.1) och prestanda-optimering. Varje sajt siktar p\u00e5 gr\u00f6nt i alla Lighthouse-kategorier.",
  },
  {
    icon: Smartphone,
    title: "PWA & Offline-redo",
    description:
      "Progressive Web App-st\u00f6d s\u00e5 att dina kunder kan installera sajten p\u00e5 mobilen. Push-notiser, offline-cache och app-k\u00e4nsla.",
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
    a: "Absolut. All data lagras i Sverige via Vercel Edge och plattformen \u00e4r byggd med GDPR-compliance fr\u00e5n grunden.",
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

/* WordPress vs SajtMaskin comparison */
const comparisonRows = [
  { feature: "Laddtid (TTFB)", sajtmaskin: "< 50ms (Edge)", wordpress: "800ms\u20131.2s", winner: "sajtmaskin" },
  { feature: "S\u00e4kerhetsuppdateringar", sajtmaskin: "Automatiskt via Vercel", wordpress: "Manuella plugins", winner: "sajtmaskin" },
  { feature: "Hosting", sajtmaskin: "Global CDN, 99.99% uptime", wordpress: "Delad server, ok\u00e4nd uptime", winner: "sajtmaskin" },
  { feature: "SEO-po\u00e4ng (Lighthouse)", sajtmaskin: "95\u2013100 / 100", wordpress: "40\u201370 / 100", winner: "sajtmaskin" },
  { feature: "Responsiv design", sajtmaskin: "Mobile-first, inbyggt", wordpress: "Beror p\u00e5 tema", winner: "sajtmaskin" },
  { feature: "Plugins & s\u00e4kerhet", sajtmaskin: "Inga plugins = ingen attackyta", wordpress: "Tusentals plugins = risk", winner: "sajtmaskin" },
  { feature: "Kodbas", sajtmaskin: "React + TypeScript", wordpress: "PHP + jQuery", winner: "sajtmaskin" },
  { feature: "Anpassningsbarhet", sajtmaskin: "Full frihet i koden", wordpress: "Begr\u00e4nsad av tema", winner: "sajtmaskin" },
  { feature: "Pris f\u00f6r hosting", sajtmaskin: "Gratis (Vercel Hobby)", wordpress: "299\u2013599 kr/m\u00e5n", winner: "sajtmaskin" },
]

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

/* ──────────────────── MAIN COMPONENT ──────────────────── */

export interface ChatAreaProps {
  selectedCategory?: string | null
  onSelectedCategoryChange?: (id: string | null) => void
  expandedContent?: React.ReactNode
  heroPrefix?: React.ReactNode
}

export function ChatArea({
  selectedCategory: controlledCategory,
  onSelectedCategoryChange,
  expandedContent,
  heroPrefix,
}: ChatAreaProps = {}) {
  const router = useRouter()
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [internalCategory, setInternalCategory] = useState<string | null>("fritext")
  const selectedCategory = controlledCategory !== undefined ? controlledCategory : internalCategory
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
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

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden">
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
      <div className="relative z-10 flex-1 overflow-y-auto scroll-smooth" data-scroll-container>

        {/* ━━━ HERO ━━━ */}
        <section className="flex flex-col items-center justify-center px-6 pt-10 pb-8 md:pt-16 md:pb-12 min-h-[calc(100vh-57px)]">
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
          <div className="w-full max-w-2xl animate-fade-up" style={{ animationDelay: "0.6s" }}>
            {showVoiceRecorder && (
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

            <div className="input-3d bg-secondary/50 backdrop-blur-xl rounded-2xl border border-border/30 p-4 shadow-2xl">
              <div className="space-y-3">
                <textarea
                  placeholder={activeCategory?.placeholder ?? "Beskriv ditt f\u00f6retag \u2014 t.ex. \u201dJag driver en fris\u00f6rsalong i G\u00f6teborg med 3 anst\u00e4llda\u201d"}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      void startBuild()
                    }
                  }}
                  className="w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/60 text-base min-h-[68px] font-normal leading-relaxed"
                />
                <div className="flex items-center justify-between pt-2 border-t border-border/15">
                  <p className="text-xs text-muted-foreground">
                    {activeCategory ? `L\u00e4ge: ${activeCategory.label}` : "V\u00e4lj en kategori ovan eller skriv fritt"}
                  </p>
                  <div className="flex items-center gap-2">
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
                    <Button
                      size="icon"
                      className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                      aria-label="Skicka"
                      disabled={isSubmitting}
                      onClick={() => {
                        void startBuild()
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
              {features.map((feature) => {
                const Icon = feature.icon
                return (
                  <div
                    key={feature.title}
                    className="card-3d group bg-card/50 backdrop-blur-sm rounded-2xl border border-border/20 p-6 flex flex-col gap-4 hover:border-primary/20"
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center group-hover:bg-primary/12 group-hover:border-primary/25 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-base text-foreground font-(--font-heading)">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ━━━ WORDPRESS COMPARISON ━━━ */}
        <section className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">J&auml;mf&ouml;relse</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Varf&ouml;r inte WordPress?
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed text-pretty">
                WordPress driver 40% av webben &mdash; men det designades 2003. Din nya sajt f&ouml;rtj&auml;nar teknik fr&aring;n 2026.
              </p>
            </div>

            <div className="rounded-2xl border border-border/20 overflow-hidden bg-card/30 backdrop-blur-sm">
              {/* Table header */}
              <div className="grid grid-cols-3 gap-0 text-xs font-semibold uppercase tracking-wider border-b border-border/20">
                <div className="px-5 py-3.5 text-muted-foreground">Funktion</div>
                <div className="px-5 py-3.5 text-primary text-center border-x border-border/15 bg-primary/3">SajtMaskin</div>
                <div className="px-5 py-3.5 text-muted-foreground/60 text-center">WordPress</div>
              </div>
              {/* Table rows */}
              {comparisonRows.map((row, i) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-3 gap-0 text-sm group hover:bg-secondary/30 transition-colors ${
                    i < comparisonRows.length - 1 ? "border-b border-border/10" : ""
                  }`}
                >
                  <div className="px-5 py-3.5 text-foreground/80 font-medium">{row.feature}</div>
                  <div className="px-5 py-3.5 text-center border-x border-border/10 bg-primary/2 text-foreground font-medium group-hover:text-primary transition-colors">
                    {row.sajtmaskin}
                  </div>
                  <div className="px-5 py-3.5 text-center text-muted-foreground/50">
                    {row.wordpress}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-xs text-muted-foreground/40 mt-5">
              K&auml;lla: web.dev, Vercel benchmarks &amp; branschdata. WordPress-siffror g&auml;ller typisk delad hosting med popul&auml;ra teman.
            </p>
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
                  void startBuild(selectedCategory ?? "fritext")
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
    </main>
  )
}
