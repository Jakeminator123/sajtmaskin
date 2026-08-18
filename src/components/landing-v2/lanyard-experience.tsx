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
 * Har besökaren redan valt tidigare hoppas cookie-steget över och kortet hänger
 * direkt på plats (med en mjuk gungning till liv).
 */

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Cookie } from "lucide-react"
import { LanyardCard } from "@/components/landing-v2/lanyard-card"

const CONSENT_KEY = "cookie-consent"
const CONSENT_DATE_KEY = "cookie-consent-date"
const CARD_IMAGE = "/branding/lanyard-card.png"
const FLIP_MS_DESKTOP = 1550
const FLIP_MS_MOBILE = 1150

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
class LanyardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return <StaticLanyardFallback />
    return this.props.children
  }
}

/** Statiskt hängande kort — ersätter 3D-kortet när WebGL inte finns. */
function StaticLanyardFallback() {
  return (
    <div aria-hidden="true" className="flex h-full w-full flex-col items-center justify-start pt-[6vh]">
      <span
        className="block w-[6px] rounded-full"
        style={{
          height: "clamp(70px, 12vh, 130px)",
          background:
            "linear-gradient(180deg, rgba(45,212,191,0) 0%, rgba(45,212,191,0.55) 22%, rgba(45,212,191,0.95) 100%)",
          boxShadow: "0 0 14px rgba(45,212,191,0.45)",
        }}
      />
      <div className="relative mt-1 aspect-[3/4] w-[min(60vw,260px)] overflow-hidden rounded-[26px] shadow-2xl ring-1 ring-primary/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CARD_IMAGE}
          alt=""
          className="absolute left-[55%] top-1/2 w-[135%] max-w-none -translate-x-1/2 -translate-y-1/2"
        />
      </div>
    </div>
  )
}

export function LanyardExperience({ className = "" }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("checking")
  // Sattes samtycke redan innan sidan laddades? Då får kortet gunga till liv.
  // Kommer vi via cookie-flippen ska det i stället ligga helt stilla.
  const [autoSwing, setAutoSwing] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    let consent: string | null = null
    try {
      consent = localStorage.getItem(CONSENT_KEY)
    } catch {
      consent = null
    }
    setAutoSwing(Boolean(consent))
    setPhase(consent ? "reveal" : "intro")
  }, [])

  const handleDone = useCallback(() => {
    setPhase("reveal")
  }, [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      {/* 3D-kortet monteras redan under cookie-steget (osynligt) så att
          fysiken och texturen hunnit ladda — överlämningen blir sömlös
          utan en tom lucka där inget kort syns. */}
      {phase !== "checking" && (
        <div
          className={`h-full w-full transition-opacity duration-300 ${
            phase === "reveal" ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <LanyardErrorBoundary>
            <LanyardCard className="h-full" autoSwing={autoSwing} />
          </LanyardErrorBoundary>
        </div>
      )}
      {phase === "intro" && <CookieFlipCard onDone={handleDone} />}
    </div>
  )
}

function CookieFlipCard({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const { mobile, reducedMotion } = useExperienceMode()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Modal-hygien (Bugbot medium + pr-ai-review F-93ef8ad7636f på #1026):
  // dialogen deklarerar aria-modal och blockerar pekaren, så den måste också
  // låsa bakgrundsscrollen, flytta in tangentbordsfokus vid mount, hålla
  // Tab-cykeln inne i dialogen och lämna tillbaka fokus när den stängs.
  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>("button, a[href]") ?? []).filter(
        (el) => !el.hasAttribute("disabled"),
      )
    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement
      const inside = dialog?.contains(active) ?? false
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
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus()
    }
  }, [])

  // Mobil: kortare, snabbare flygbana. Reduced motion: bara en mjuk uttoning.
  const flipMs = reducedMotion ? 350 : mobile ? FLIP_MS_MOBILE : FLIP_MS_DESKTOP

  const choose = useCallback(
    (value: "accepted" | "declined") => {
      if (leaving) return
      try {
        localStorage.setItem(CONSENT_KEY, value)
        if (value === "accepted") {
          localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString())
        }
      } catch {
        /* localStorage kan vara blockerat — fortsätt ändå med animationen. */
      }
      setLeaving(true)
      window.setTimeout(onDone, flipMs - 60)
    },
    [leaving, onDone, flipMs],
  )

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Cookie-inställningar"
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 transition-all duration-700 ease-out ${
        leaving
          ? "pointer-events-none bg-transparent backdrop-blur-0"
          : mobile
            ? "bg-background/55 backdrop-blur-[3px]"
            : "bg-background/70 backdrop-blur-md"
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
            {/* FRAMSIDA — cookie-samtycke */}
            <div className="absolute inset-0 flex flex-col overflow-hidden rounded-[26px] border border-border/60 bg-card/95 p-6 shadow-2xl [backface-visibility:hidden]">
              {/* Litet urtag högst upp där snodden fäster */}
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-foreground/15"
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
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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

            {/* BAKSIDA — det varumärkta kortet (matchar 3D-nyckelbandet) */}
            <div className="absolute inset-0 overflow-hidden rounded-[26px] shadow-2xl ring-1 ring-primary/30 [backface-visibility:hidden] [transform:rotateY(180deg)]">
              {/* Central beskärning så hela ordmärket syns (samma som 3D-kortet). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={CARD_IMAGE || "/placeholder.svg"}
                alt=""
                aria-hidden="true"
                className="absolute left-[55%] top-1/2 w-[135%] max-w-none -translate-x-1/2 -translate-y-1/2"
              />
              <span className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
