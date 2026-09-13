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

type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: string
  downlink?: number
  addEventListener?: (type: "change", listener: () => void) => void
  removeEventListener?: (type: "change", listener: () => void) => void
}

const SLOW_EFFECTIVE_TYPES = new Set(["slow-2g", "2g", "3g"])

/**
 * Rapporterar `true` när användaren ber om datasparläge (`Save-Data`) eller sitter
 * på en svag uppkoppling (`effectiveType` 2g/3g eller låg `downlink`). Används för
 * att servera en statisk fallback i stället för att ladda ner + rita WebGL-scener,
 * så förstasidan förblir snabb på dåliga nät. SSR-säker: `false` tills mount.
 */
export function useSaveData(): boolean {
  const [saveData, setSaveData] = useState(false)

  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: NetworkInformationLike }
    ).connection
    if (!connection) return

    const sync = () => {
      const slow =
        connection.saveData === true ||
        (typeof connection.effectiveType === "string" &&
          SLOW_EFFECTIVE_TYPES.has(connection.effectiveType)) ||
        (typeof connection.downlink === "number" &&
          connection.downlink > 0 &&
          connection.downlink < 1.5)
      setSaveData(Boolean(slow))
    }

    sync()
    connection.addEventListener?.("change", sync)
    return () => connection.removeEventListener?.("change", sync)
  }, [])

  return saveData
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

export function useRotatingText(items: string[], interval = 2400) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const reduceMotion = usePrefersReducedMotion()

  useEffect(() => {
    // prefers-reduced-motion: fryser rotationen på aktuellt ord.
    if (reduceMotion) return
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % items.length)
        setVisible(true)
      }, 300)
    }, interval)
    return () => clearInterval(timer)
  }, [items.length, interval, reduceMotion])

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
      // Körs i capture-fas: Nexts Link-interception hinner annars sätta
      // defaultPrevented innan vi ser klicket. Scrollen är oberoende av vem
      // som sköter själva navigeringen, så den kan göras optimistiskt.
      if (event.button !== 0) return
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
    document.addEventListener("click", handleClick, true)
    return () => {
      window.removeEventListener("hashchange", scrollToHash)
      document.removeEventListener("click", handleClick, true)
    }
  }, [])
}
