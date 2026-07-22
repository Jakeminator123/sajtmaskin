"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"

/* 3D tilt — DOM transform only, prefers-reduced-motion aware */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** SSR-safe; false until mounted, then syncs with system preference. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY)
    const sync = () => setReduce(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return reduce
}
const TILT_NEUTRAL = "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)"

export function use3DTilt(intensity = 12) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY)
    const sync = () => {
      reduceMotionRef.current = mq.matches
    }
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.style.transform = TILT_NEUTRAL
  }, [])

  const handleMove = useCallback(
    (e: ReactMouseEvent) => {
      const el = ref.current
      if (!el || reduceMotionRef.current) return
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      el.style.transform = `perspective(800px) rotateX(${-y * intensity}deg) rotateY(${x * intensity}deg) scale(1.02)`
    },
    [intensity],
  )

  const handleLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = TILT_NEUTRAL
  }, [])

  return { ref, handleMove, handleLeave }
}

export function useTerminalTypewriter() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleLines, setVisibleLines] = useState(0)
  const [cursorLine, setCursorLine] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let interval: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (started.current) return
      started.current = true
      const totalLines = 6
      let line = 0
      interval = setInterval(() => {
        line++
        setVisibleLines(line)
        setCursorLine(line)
        if (line >= totalLines && interval) clearInterval(interval)
      }, 420)
    }
    // Lägre tröskel än tidigare (0.4): boxen är hög, så 40 % synlighet nåddes
    // ofta aldrig i den inre scroll-containern → terminalen blev stående tom.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start()
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    // Säkerhetsnät: starta alltid efter en stund så boxen aldrig är permanent tom.
    const fallback = setTimeout(start, 6000)
    return () => {
      observer.disconnect()
      clearTimeout(fallback)
      if (interval) clearInterval(interval)
    }
  }, [])

  return { containerRef, visibleLines, cursorLine }
}

export function useHonestCounter(fakeTarget: number, realValue: number, message: string) {
  // `fakeTarget` behålls i signaturen för bakåtkompatibilitet men används inte
  // längre: den gamla uppblås-till-fejk-siffra + glitch-teatern lät sidan visa
  // påhittade tal ("2 480+") i flera sekunder, vilket såg ut som fejkade
  // vanity-metrics. Nu räknar vi direkt upp till det ärliga värdet.
  void fakeTarget
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState<"idle" | "inflating" | "glitch" | "honest">("idle")
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = () => {
      if (started.current) return
      started.current = true
      setPhase("inflating")

      const duration = 900
      const startedAt = performance.now()
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCount(Math.max(1, Math.floor(eased * realValue)))
        if (progress < 1) {
          requestAnimationFrame(step)
        } else {
          setCount(realValue)
          setPhase("honest")
        }
      }
      requestAnimationFrame(step)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start()
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    // Säkerhetsnät: hoppa till ärligt värde om observern aldrig triggar.
    const fallback = setTimeout(start, 6000)
    return () => {
      observer.disconnect()
      clearTimeout(fallback)
    }
  }, [realValue])

  return { count, phase, ref, message }
}

export function useRotatingText(items: string[], interval = 2400) {
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

  return { text: items[index] ?? "", visible }
}

export function useInView(threshold = 0.3) {
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
    // Säkerhetsnät: visa innehållet efter en stund även om observern aldrig
    // triggar (t.ex. tröskel som inte nås i den inre scroll-containern) — annars
    // blir sektioner som Lighthouse-ringarna stående tomma.
    const fallback = setTimeout(() => setVisible(true), 6000)
    return () => {
      observer.disconnect()
      clearTimeout(fallback)
    }
  }, [threshold])

  return { ref, visible }
}

/**
 * Scroll `#hash`-mål i sidor vars innehåll bor i den inre
 * `[data-scroll-container]`-ytan. Nexts inbyggda hash-hantering scrollar bara
 * `window`, så länkar som `/#priser` och `/teknik#funktioner` landar annars på
 * sidtoppen. Körs vid mount (ankomst via navigation) och på `hashchange`.
 */
export function useHashScroll() {
  useEffect(() => {
    const scrollToId = (id: string) => {
      if (!id) return
      // Vänta en frame så layouten hunnit sätta sig efter navigering.
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: "start" })
      })
    }
    const scrollToHash = () => scrollToId(window.location.hash.replace(/^#/, ""))

    // Next.js <Link href="/#priser"> på samma sida går via history.pushState,
    // som varken avfyrar hashchange eller scrollar den inre containern —
    // fånga därför klick på interna ankarlänkar direkt.
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || !href.includes("#")) return
      const url = new URL(href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname !== window.location.pathname) return
      scrollToId(url.hash.replace(/^#/, ""))
    }

    scrollToHash()
    window.addEventListener("hashchange", scrollToHash)
    document.addEventListener("click", handleClick)
    return () => {
      window.removeEventListener("hashchange", scrollToHash)
      document.removeEventListener("click", handleClick)
    }
  }, [])
}
