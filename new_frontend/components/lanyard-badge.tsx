"use client"

import { useEffect, useRef, useCallback } from "react"
import { Zap, Globe, Code2, Sparkles } from "lucide-react"

/*
  Pure pendulum physics -- everything rotates from the pin point.
  No translateX on card/strap -- only rotation from the fixed top-center origin.
*/

interface Phys {
  /* Pendulum angle (degrees, 0 = straight down) */
  angle: number
  va: number
  /* Y-axis card spin (degrees) */
  spin: number
  vs: number
  /* Drop */
  dropY: number
  dropVY: number
  phase: "wait" | "drop" | "settle" | "idle"
  t: number
}

export function LanyardBadge() {
  const raf = useRef(0)
  const p = useRef<Phys>({
    angle: 0, va: 0,
    spin: 0, vs: 0,
    dropY: -380, dropVY: 0,
    phase: "wait",
    t: 0,
  })
  const drag = useRef(false)
  const lastX = useRef(0)

  /* DOM refs */
  const pendulumRef = useRef<HTMLDivElement>(null)
  const cardInnerRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)

  /* Start drop after brief delay */
  useEffect(() => {
    const t = setTimeout(() => { p.current.phase = "drop" }, 500)
    return () => clearTimeout(t)
  }, [])

  /* Physics loop - writes directly to DOM */
  useEffect(() => {
    const step = () => {
      const s = p.current
      s.t += 1 / 60

      /* ---- Drop ---- */
      if (s.phase === "drop") {
        s.dropVY += 1800 * (1 / 60)          // gravity px/s^2
        s.dropY += s.dropVY * (1 / 60)
        if (s.dropY >= 0) {
          s.dropY = 0
          s.dropVY *= -0.25
          s.va += (Math.random() - 0.5) * 1.5 // slight swing on landing
          if (Math.abs(s.dropVY) < 15) {
            s.dropVY = 0
            s.phase = "settle"
          }
        }
      }

      /* ---- Settle bounce ---- */
      if (s.phase === "settle") {
        s.dropVY += -s.dropY * 8 * (1 / 60)
        s.dropVY *= 0.92
        s.dropY += s.dropVY
        if (Math.abs(s.dropY) < 0.2 && Math.abs(s.dropVY) < 0.3) {
          s.dropY = 0
          s.dropVY = 0
          s.phase = "idle"
        }
      }

      /* ---- Pendulum swing (angle) ---- */
      if (!drag.current) {
        // spring back toward 0 + damping
        s.va += -s.angle * 0.025
        s.va *= 0.97

        // gentle idle sway
        if (s.phase === "idle") {
          s.va += Math.sin(s.t * 0.8) * 0.015 + Math.cos(s.t * 0.5) * 0.008
        }
      }
      s.angle += s.va
      // clamp angle to prevent wild swings
      s.angle = Math.max(-35, Math.min(35, s.angle))

      /* ---- Y-axis card spin ---- */
      if (!drag.current) {
        s.vs += -s.spin * 0.015    // spring back
        s.vs *= 0.985              // very high damping -- slow spin
      }
      s.spin += s.vs

      const visible = s.phase !== "wait"

      /* ---- Write to DOM ---- */
      if (pendulumRef.current) {
        pendulumRef.current.style.transform =
          `rotate(${s.angle}deg) translateY(${s.dropY}px)`
        pendulumRef.current.style.opacity = visible ? "1" : "0"
      }

      if (cardInnerRef.current) {
        cardInnerRef.current.style.transform =
          `perspective(800px) rotateY(${s.spin}deg)`
      }

      if (hintRef.current) {
        hintRef.current.style.opacity = s.phase === "idle" ? "1" : "0"
      }

      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  /* ---- Pointer handlers ---- */
  const onDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = true
    lastX.current = e.clientX
    p.current.va = 0
    p.current.vs = 0
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [])

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - lastX.current
    lastX.current = e.clientX

    // Push pendulum angle directly
    p.current.angle = Math.max(-35, Math.min(35, p.current.angle + dx * 0.3))
    p.current.va = dx * 0.15

    // Gentle spin from drag velocity
    p.current.vs += dx * 0.04
  }, [])

  const onUp = useCallback(() => {
    drag.current = false
  }, [])

  return (
    <div
      className="relative w-full h-[450px] md:h-[530px] overflow-hidden select-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      style={{ touchAction: "none" }}
    >
      {/* ====== Fixed pin (never moves) ====== */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
        <div className="w-5 h-5 rounded-full bg-primary shadow-lg shadow-primary/40 border-2 border-background" />
      </div>

      {/* ====== Pendulum group (rotates from pin) ====== */}
      <div
        ref={pendulumRef}
        className="absolute top-[34px] left-1/2 z-20 opacity-0"
        style={{
          /* This is the key: the element's center-x sits on the pin,
             and it rotates from its very top-center = the pin. */
          transformOrigin: "top center",
          marginLeft: "-110px",    /* half of card width (220px) */
          width: "220px",
          willChange: "transform, opacity",
          transition: "opacity 0.3s",
        }}
      >
        {/* ── Strap ── */}
        <div
          className="mx-auto"
          style={{
            width: "2.5px",
            height: "110px",
            background: "linear-gradient(to bottom, oklch(0.72 0.15 192), oklch(0.72 0.15 192 / 0.3))",
            boxShadow: "0 0 8px oklch(0.72 0.15 192 / 0.2)",
            borderRadius: "0 0 1px 1px",
          }}
        />

        {/* ── Clip ── */}
        <div className="w-4 h-2 rounded-b-sm bg-muted-foreground/30 mx-auto" />

        {/* ── Card (3D spin wrapper) ── */}
        <div
          ref={cardInnerRef}
          onPointerDown={onDown}
          className="mt-0.5 cursor-grab active:cursor-grabbing"
          style={{ willChange: "transform", transformStyle: "preserve-3d" }}
        >
          {/* ── Front face ── */}
          <div
            className="relative rounded-2xl border border-border/30 bg-card backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/40"
            style={{ backfaceVisibility: "hidden" }}
          >
            {/* Hole punch */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-7 h-2.5 rounded-full bg-background/80 border border-border/20 z-10" />

            <div className="h-11 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent" />

            <div className="px-4 pb-4 -mt-1">
              <div className="w-9 h-9 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center mb-2 shadow-md shadow-primary/5">
                <Zap className="w-4 h-4 text-primary" />
              </div>

              <h3 className="text-sm text-foreground font-(--font-heading) tracking-tight leading-none">
                SajtMaskin
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-2.5">
                AI-driven webbplatsgenerering
              </p>

              <div className="flex flex-wrap gap-1 mb-3">
                {[
                  { icon: Code2, label: "React 19" },
                  { icon: Globe, label: "Next.js" },
                  { icon: Sparkles, label: "AI SDK" },
                ].map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-0.5 text-[8px] font-medium text-primary/70 bg-primary/6 border border-primary/10 rounded px-1.5 py-px"
                  >
                    <t.icon className="w-2 h-2" />
                    {t.label}
                  </span>
                ))}
              </div>

              <div className="h-px bg-border/15 mb-2.5" />

              <div className="flex items-center justify-between text-[9px]">
                <div>
                  <p className="text-muted-foreground/40 uppercase tracking-wider leading-none mb-0.5">Grundare</p>
                  <p className="text-foreground/80 font-medium">Erik</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground/40 uppercase tracking-wider leading-none mb-0.5">Status</p>
                  <div className="flex items-center gap-1 justify-end">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                    </span>
                    <span className="text-primary font-medium">Beta</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Back face ── */}
          <div
            className="absolute inset-0 rounded-2xl border border-border/30 bg-card/95 backdrop-blur-xl flex items-center justify-center shadow-2xl shadow-black/40"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div className="text-center px-6">
              <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <p className="text-xs text-foreground font-(--font-heading)">SajtMaskin</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">sajtmaskin.se</p>
            </div>
          </div>
        </div>
      </div>

      {/* Drag hint */}
      <p
        ref={hintRef}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground/25 opacity-0 transition-opacity duration-1000 z-30"
        style={{ transitionDelay: "1.5s" }}
      >
        &#8592; dra kortet &#8594;
      </p>
    </div>
  )
}
