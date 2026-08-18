"use client"

/**
 * LanyardExperience — kombinerar cookie-samtycke och det fysikdrivna 3D-kortet.
 *
 * Vid första besöket visas cookie-rutan som FRAMSIDAN på ett stort kort som
 * blockerar större delen av vyn. När besökaren klickar på ett av valen sparas
 * samtycket och kortet "flyger" bakåt i djupled, roterar 180° så att den
 * varumärkta baksidan kommer fram, krymper och lämnar sedan över till det
 * riktiga 3D-nyckelbandet som hänger kvar i hjältesektionen.
 *
 * Har besökaren redan valt tidigare hoppas cookie-steget helt över och kortet
 * hänger direkt på plats.
 */

import { useCallback, useEffect, useState } from "react"
import { Cookie } from "lucide-react"
import { LanyardCard } from "@/components/landing-v2/lanyard-card"

const CONSENT_KEY = "cookie-consent"
const CONSENT_DATE_KEY = "cookie-consent-date"
const CARD_IMAGE = "/branding/lanyard-card.png"

type Phase = "checking" | "intro" | "reveal"

export function LanyardExperience({ className = "" }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("checking")

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

  const handleDone = useCallback(() => setPhase("reveal"), [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      {phase === "reveal" && <LanyardCard className="h-full" />}
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
      window.setTimeout(onDone, 1150)
    },
    [leaving, onDone],
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie-inställningar"
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 transition-all duration-700 ease-out ${
        leaving
          ? "pointer-events-none bg-transparent backdrop-blur-0"
          : "bg-background/70 backdrop-blur-md"
      }`}
    >
      <div
        className="flex w-full items-center justify-center"
        style={{ perspective: "1500px" }}
      >
        <div
          className="relative aspect-[3/4] max-h-[82vh] w-[min(86vw,360px)] [transform-style:preserve-3d]"
          style={{
            transition:
              "transform 1150ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease 820ms",
            transform: leaving
              ? "translateY(-24vh) translateZ(-640px) rotateY(180deg) scale(0.92)"
              : "translateY(0) translateZ(0) rotateY(0deg) scale(1)",
            opacity: leaving ? 0 : 1,
          }}
        >
          {/* FRAMSIDA — cookie-samtycke */}
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card/95 p-6 shadow-2xl [backface-visibility:hidden]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Cookie className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-lg font-semibold text-foreground font-(--font-heading)">
                Vi använder cookies
              </p>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              För att förbättra din upplevelse, analysera trafik och visa relevant innehåll. Läs mer
              i vår{" "}
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
          <div className="absolute inset-0 overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-primary/30 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {/* Central beskärning så hela ordmärket syns (samma som 3D-kortet). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={CARD_IMAGE || "/placeholder.svg"}
              alt=""
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 w-[135%] max-w-none -translate-x-1/2 -translate-y-1/2"
            />
            <span className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/5" />
          </div>
        </div>
      </div>
    </div>
  )
}
