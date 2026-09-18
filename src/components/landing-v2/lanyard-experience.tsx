"use client"

/**
 * LanyardExperience — kombinerar cookie-samtycke och det fysikdrivna 3D-kortet
 * till EN sammanhängande fysisk pryl.
 *
 * Vid första besöket hänger kortet stort och mitt i vyn i sitt nyckelband, med
 * cookie-samtycket på FRAMSIDAN. När besökaren klickar på ett val sparas
 * samtycket och EXAKT samma kort roterar 180° runt sin egen lodräta axel (så
 * att den varumärkta baksidan kommer fram), åker samtidigt bakåt i djupled och
 * krymper — fortfarande hängande i samma snodd. När rotationen är klar lämnas
 * över till det riktiga 3D-nyckelbandet som redan ligger stilla i exakt samma
 * pose (ingen extra gungning), så bytet blir osynligt.
 *
 * Har besökaren redan valt tidigare hoppas cookie-steget över. Då monteras
 * 3D-kortet direkt men OVANFÖR stagen; först när fysiken rapporterar sin
 * första riktiga frame glider hela lanyarden ner på plats. Laddtiden blir
 * en avsiktlig entré i stället för ett stillbildskort som byter pose.
 */

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { Cookie } from "lucide-react"
import { persistCookieConsent } from "@/lib/consent/cookie-consent"
import { readStoredCookieConsent } from "@/components/landing-v2/lanyard-consent"
import {
  readLanyardStaticOnly,
  usePrefersReducedMotion,
  useSaveData,
} from "@/components/landing-v2/landing-hooks"
import {
  LANYARD_CARD_GRAIN_STYLE,
  LanyardBrandFace,
  StaticLanyardFallback,
} from "@/components/landing-v2/lanyard-static-fallback"

// Platshållaren täcker cookie-flippens överlämning om 3D-chunken inte hunnit
// in vid reveal. I drop-in-läget står wrappern ovanför stagen tills onReady,
// så där syns den aldrig.
const LanyardCard = dynamic(
  () => import("@/components/landing-v2/lanyard-card").then((m) => m.LanyardCard),
  { ssr: false, loading: () => <StaticLanyardFallback /> },
)

const FLIP_MS_DESKTOP = 1550
const FLIP_MS_MOBILE = 1150
/** Om fysiken aldrig rapporterar redo (t.ex. pausad tabb) visas kortet ändå. */
const DROP_IN_FALLBACK_MS = 6000
const DROP_IN_HIDDEN_CLASS = "-translate-y-[120%] pointer-events-none"
const DROP_IN_SHOWN_CLASS =
  "translate-y-0 transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]"

/** Mobil eller reduced motion avgör hur påträngande upplevelsen får vara. */
function useExperienceMode() {
  const [mode, setMode] = useState<{ mobile: boolean; reducedMotion: boolean }>({
    mobile: false,
    reducedMotion: false,
  })
  useEffect(() => {
    const mqMobile = window.matchMedia("(max-width: 767px)")
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setMode({ mobile: mqMobile.matches, reducedMotion: mqMotion.matches })
    update()
    mqMobile.addEventListener("change", update)
    mqMotion.addEventListener("change", update)
    return () => {
      mqMobile.removeEventListener("change", update)
      mqMotion.removeEventListener("change", update)
    }
  }, [])
  return mode
}

type Phase = "checking" | "intro" | "reveal"

/**
 * Fångar init-/renderfel från 3D-kortet (pr-ai-review F-713ac602fd01 på
 * #1026): samtyckeskortet är ren DOM och får aldrig dö för att WebGL är
 * avstängt eller Canvas/Rapier inte kan starta. Fallback = det statiska
 * varumärkeskortet, så hjälteytan aldrig blir tom.
 */
class LanyardErrorBoundary extends Component<
  { children: ReactNode; onFailed?: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    // Drop-in-wrappern håller innehållet ovanför stagen tills onReady —
    // fallbacken måste släppas ner direkt, annars gapar hero-ytan i 6 s.
    this.props.onFailed?.()
  }
  render() {
    if (this.state.failed) return <StaticLanyardFallback />
    return this.props.children
  }
}

function initialPhase(): Phase {
  if (typeof window === "undefined") return "checking"
  return readStoredCookieConsent() ? "reveal" : "intro"
}

export function LanyardExperience({ className = "" }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion()
  const saveData = useSaveData()
  // Hookarna är SSR-säkra (false tills effect). Experience är client-only
  // och får inte montera WebGL en tick för reduced-motion / save-data.
  const staticOnly = reducedMotion || saveData || readLanyardStaticOnly()
  // Experience laddas med ssr:false, så första render är klient.
  // Läs samtycke synkront — "checking" lämnade annars hero-ytan tom en tick.
  const [phase, setPhase] = useState<Phase>(initialPhase)
  // Sattes samtycke redan innan sidan laddades? Då får kortet gunga till liv.
  // Kommer vi via cookie-flippen ska det i stället ligga helt stilla.
  const [autoSwing] = useState(() => initialPhase() === "reveal")
  // Återbesök: kortet börjar ovanför stagen och glider ner när fysiken är
  // redo. Cookie-flippen använder i stället opacity-överlämningen nedan.
  const dropIn = autoSwing && !staticOnly
  const [dropped, setDropped] = useState(false)
  const handleReady = useCallback(() => setDropped(true), [])

  useEffect(() => {
    if (!dropIn || dropped) return
    const timer = window.setTimeout(() => setDropped(true), DROP_IN_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [dropIn, dropped])

  const handleDone = useCallback(() => {
    setPhase("reveal")
  }, [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      {/* 3D-kortet monteras redan under cookie-steget (osynligt) så att
          fysiken och texturen hunnit ladda — överlämningen blir sömlös
          utan en tom lucka där inget kort syns. Reduced-motion / save-data
          hoppar över 3D-chunken helt och visar den statiska fallbacken. */}
      {phase === "reveal" && staticOnly && <StaticLanyardFallback />}
      {phase !== "checking" && !staticOnly && (
        <div
          data-testid="lanyard-stage-3d"
          className={`h-full w-full will-change-transform ${
            dropIn
              ? dropped
                ? DROP_IN_SHOWN_CLASS
                : DROP_IN_HIDDEN_CLASS
              : `transition-opacity duration-300 ${
                  phase === "reveal" ? "opacity-100" : "pointer-events-none opacity-0"
                }`
          }`}
        >
          <LanyardErrorBoundary onFailed={dropIn ? handleReady : undefined}>
            <LanyardCard
              className="h-full"
              autoSwing={autoSwing}
              onReady={dropIn ? handleReady : undefined}
            />
          </LanyardErrorBoundary>
        </div>
      )}
      {phase === "intro" && <CookieFlipCard onDone={handleDone} />}
    </div>
  )
}

function CookieFlipCard({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const { mobile, reducedMotion } = useExperienceMode()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPortalTarget(document.body)
  }, [])

  // Modal-hygien (Bugbot medium + pr-ai-review F-93ef8ad7636f på #1026):
  // dialogen deklarerar aria-modal och blockerar pekaren, så den måste också
  // låsa bakgrundsscrollen, flytta in tangentbordsfokus vid mount, hålla
  // Tab-cykeln inne i dialogen och lämna tillbaka fokus när den stängs.
  useEffect(() => {
    // Läs alltid dialognoden via ref:en i stället för en mount-closure:
    // 3D-kortets suspense/init kan få React att byta ut dialog-DOM:en efter
    // mount, och då pekar en fångad nod på ett urkopplat element.
    const getDialog = () => dialogRef.current
    // body räknas inte som "tidigare fokus": att återställa till body vid
    // cleanup skulle ångra dialogens egen fokusering (StrictMode kör
    // mount→cleanup→mount i dev, och då blev kortets knapp av-fokuserad).
    const previouslyFocused =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const focusables = () =>
      Array.from(getDialog()?.querySelectorAll<HTMLElement>("button, a[href]") ?? []).filter(
        (el) => !el.hasAttribute("disabled"),
      )
    // Fokusera med omtag: 3D-kortets texturladdning suspenderar trädet
    // (dynamic-boundaryn ligger ovanför), och React kopplar då tillfälligt ur
    // dialog-DOM:en — fokus faller till body, focus() är ett tyst no-op och
    // effekterna körs INTE om när noden sätts tillbaka. Försök därför tills
    // noden är tillbaka och fokuset faktiskt fastnat i dialogen (max ~5 s).
    let focusTimer: number | undefined
    let focusTries = 0
    const focusIntoDialog = () => {
      const dialog = getDialog()
      if (dialog?.isConnected) {
        if (!dialog.contains(document.activeElement)) focusables()[0]?.focus()
        if (dialog.contains(document.activeElement)) return
      }
      if (focusTries++ < 50) focusTimer = window.setTimeout(focusIntoDialog, 100)
    }
    focusIntoDialog()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement
      const inside = getDialog()?.contains(active) ?? false
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Fokusvakt: om fokus lämnar dialogen utan nytt mål i den (blur till
    // body eller DOM-byte från 3D-kortets init) dras det tillbaka. Refokus
    // skjuts upp en tick — mitt i fokusbytet ignorerar Chrome focus()-anrop
    // från focusout-handlers. Lyssnaren ligger på document (capture) så den
    // överlever att dialognoden byts ut.
    const onFocusOut = () => {
      // En tick senare — mitt i fokusbytet ignorerar Chrome focus()-anrop
      // från focusout-handlers.
      setTimeout(() => {
        focusTries = 0
        focusIntoDialog()
      }, 0)
    }
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("focusout", onFocusOut, true)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("focusout", onFocusOut, true)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus()
    }
  }, [])

  // Mobil: kortare, snabbare flygbana. Reduced motion: bara en mjuk uttoning.
  const flipMs = reducedMotion ? 350 : mobile ? FLIP_MS_MOBILE : FLIP_MS_DESKTOP

  const choose = useCallback(
    (value: "accepted" | "declined") => {
      if (leaving) return
      persistCookieConsent(value)
      setLeaving(true)
      window.setTimeout(onDone, flipMs - 60)
    },
    [leaving, onDone, flipMs],
  )

  const dialog = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Cookie-inställningar"
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-700 ease-out ${
        leaving
          ? "pointer-events-none bg-transparent"
          : "bg-[#05070a]"
      }`}
    >
      {/* "Spänd båge": kortet dras först tydligt MOT dig (bågen spänns),
          sedan släpper spänningen och hela prylen (snodd + clips + kort)
          SKJUTS iväg långt bak i djupled — förbi sitt viloläge — och
          fjädrar sedan tillbaka fram till överlämningsstorleken. */}
      <style>{`
        @keyframes lanyard-fly-back {
          0% { transform: translateY(0) translateZ(0) scale(1); }
          18% { transform: translateY(2.4vh) translateZ(190px) scale(1.09); }
          72% { transform: translateY(-30vh) translateZ(-1050px) scale(0.5); }
          100% { transform: translateY(-24vh) translateZ(-560px) scale(0.66); }
        }
        @keyframes lanyard-fly-back-mobile {
          0% { transform: translateY(0) translateZ(0) scale(1); }
          18% { transform: translateY(1.6vh) translateZ(120px) scale(1.06); }
          72% { transform: translateY(-21vh) translateZ(-720px) scale(0.56); }
          100% { transform: translateY(-16vh) translateZ(-380px) scale(0.7); }
        }
        @keyframes lanyard-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div
        className="flex flex-col items-center"
        style={{
          perspective: "1600px",
          transformStyle: "preserve-3d",
          animation: leaving
            ? reducedMotion
              ? `lanyard-fade-out ${flipMs}ms ease-out forwards`
              : `${mobile ? "lanyard-fly-back-mobile" : "lanyard-fly-back"} ${flipMs}ms cubic-bezier(0.34, 0.02, 0.26, 1) forwards`
            : "none",
        }}
      >
        {/* Snodd/band som kortet hänger i — samma teal som 3D-bandet. */}
        <div className="relative flex flex-col items-center" aria-hidden="true">
          <span
            className="block w-[6px] rounded-full"
            style={{
              height: mobile ? "clamp(56px, 9vh, 96px)" : "clamp(90px, 16vh, 150px)",
              background:
                "linear-gradient(180deg, rgba(45,212,191,0) 0%, rgba(45,212,191,0.55) 22%, rgba(45,212,191,0.95) 100%)",
              boxShadow: "0 0 14px rgba(45,212,191,0.45)",
            }}
          />
          {/* Metallclips */}
          <span className="-mt-1 h-4 w-4 rounded-full border-2 border-slate-300 bg-slate-400/30 shadow-[0_0_8px_rgba(203,213,225,0.5)]" />
          <span className="-mt-1 h-3 w-2.5 rounded-sm bg-gradient-to-b from-slate-300 to-slate-500" />
        </div>

        {/* Kortet — roterar 180° runt sin egen axel för att visa baksidan. */}
        <div className="mt-1" style={{ perspective: "1400px" }}>
          <div
            className={`relative aspect-[3/4] [transform-style:preserve-3d] ${
              mobile ? "w-[min(78vw,300px)]" : "w-[min(84vw,340px)]"
            }`}
            style={{
              transition: `transform ${flipMs}ms cubic-bezier(0.34, 1.2, 0.4, 1)`,
              transform: leaving && !reducedMotion ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* FRAMSIDA — cookie-samtycke, samma plastkort-känsla som 3D-baksidan. */}
            <div className="absolute inset-0 isolate flex flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#0b1016] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.65)] [backface-visibility:hidden]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-20"
                style={LANYARD_CARD_GRAIN_STYLE}
              />
              <span className="pointer-events-none absolute inset-x-8 top-0 h-16 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.16),transparent_70%)]" />
              {/* Litet urtag högst upp där snodden fäster */}
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-foreground/20"
              />
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Cookie className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-lg font-semibold text-foreground font-(--font-heading)">Vi använder cookies</p>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                För att förbättra din upplevelse, analysera trafik och visa relevant innehåll. Läs mer i vår{" "}
                <a href="/privacy" className="text-primary underline underline-offset-2">
                  integritetspolicy
                </a>
                .
              </p>

              <div className="mt-auto flex flex-col gap-2.5 pt-6">
                <button
                  type="button"
                  onClick={() => choose("accepted")}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Acceptera alla
                </button>
                <button
                  type="button"
                  onClick={() => choose("declined")}
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Endast nödvändiga
                </button>
                <p className="mt-1 text-center text-[11px] text-muted-foreground/70">
                  Ditt val sparas på den här enheten.
                </p>
              </div>
            </div>

            {/* BAKSIDA — det varumärkta kortet (samma crop som 3D-nyckelbandet). */}
            <LanyardBrandFace className="absolute inset-0 rounded-[26px] shadow-2xl ring-1 ring-primary/30 [backface-visibility:hidden] [transform:rotateY(180deg)]" />
          </div>
        </div>
      </div>
    </div>
  )

  return portalTarget ? createPortal(dialog, portalTarget) : dialog
}
