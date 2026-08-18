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

import { useCallback, useEffect, useState } from "react"
import { Cookie } from "lucide-react"
import { LanyardCard } from "@/components/landing-v2/lanyard-card"

const CONSENT_KEY = "cookie-consent"
const CONSENT_DATE_KEY = "cookie-consent-date"
const CARD_IMAGE = "/branding/lanyard-card.png"
const FLIP_MS = 1250

type Phase = "checking" | "intro" | "reveal"

export function LanyardExperience({ className = "" }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("checking")
  // Kom vi hit via cookie-flippen? Då ska 3D-kortet ligga stilla direkt.
  const [fromFlip, setFromFlip] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    let consent: string | null = null
    try {
      consent = localStorage.getItem(CONSENT_KEY)
    } catch {
      consent = null
    }
    setPhase(consent ? "reveal" : "intro")
  }, [])

  const handleDone = useCallback(() => {
    setFromFlip(true)
    setPhase("reveal")
  }, [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      {phase === "reveal" && <LanyardCard className="h-full" autoSwing={!fromFlip} />}
      {phase === "intro" && <CookieFlipCard onDone={handleDone} />}
    </div>
  )
}

function CookieFlipCard({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

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
      window.setTimeout(onDone, FLIP_MS - 60)
    },
    [leaving, onDone],
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie-inställningar"
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 transition-all duration-700 ease-out ${
        leaving ? "pointer-events-none bg-transparent backdrop-blur-0" : "bg-background/70 backdrop-blur-md"
      }`}
    >
      {/* Hela prylen (snodd + clips + kort) svävar bakåt i djupled och krymper. */}
      <div
        className="flex flex-col items-center"
        style={{
          perspective: "1600px",
          transition: `transform ${FLIP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          transform: leaving
            ? "translateY(-24vh) translateZ(-560px) scale(0.66)"
            : "translateY(0) translateZ(0) scale(1)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Snodd/band som kortet hänger i — samma teal som 3D-bandet. */}
        <div className="relative flex flex-col items-center" aria-hidden="true">
          <span
            className="block w-[6px] rounded-full"
            style={{
              height: "clamp(90px, 16vh, 150px)",
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
            className="relative aspect-[3/4] w-[min(84vw,340px)] [transform-style:preserve-3d]"
            style={{
              transition: `transform ${FLIP_MS}ms cubic-bezier(0.34, 1.2, 0.4, 1)`,
              transform: leaving ? "rotateY(180deg)" : "rotateY(0deg)",
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
                className="absolute left-1/2 top-1/2 w-[135%] max-w-none -translate-x-1/2 -translate-y-1/2"
              />
              <span className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
