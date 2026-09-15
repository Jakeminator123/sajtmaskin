"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { usePrefersReducedMotion, useSaveData } from "@/components/landing-v2/landing-hooks";
import {
  PREVIEW_BACKDROP_POSTER_URL,
  PREVIEW_BACKDROP_VIDEO_SOURCES,
} from "@/lib/builder/preview-backdrop-media";
import { cn } from "@/lib/utils";
import styles from "./PreviewBackdrop.module.css";

export interface PreviewBackdropProps {
  /**
   * Sant bara när den rörliga scenen faktiskt behövs: previewrektangeln har
   * ingen användbar sajt att visa. `false` (verkligt fel, eller en sajt som
   * redan ligger i iframen) håller stillbilden kvar och rör aldrig video-
   * resurserna. Bakgrunden är ren dekoration — den är inte en readiness-signal
   * och får aldrig påverka iframe, session eller retry.
   */
  motion: boolean;
}

/**
 * Dekorationslager bakom previewytans statuskort: stillbild alltid, rörlig
 * scen bara när `motion` är sant och användaren/enheten vill ha rörelse.
 *
 * Uppspelningen pausas — aldrig avmonteras — vid dold flik, panel utanför
 * viewporten och användarpaus, så att en återgång inte kostar en ny nedladdning.
 * `preload="none"` gör att inga videobytes hämtas förrän `play()` faktiskt
 * körs. Mediafel och blockerad autoplay faller tillbaka till postern utan
 * retry-loop; de får inte tolkas som previewfel.
 */
export function PreviewBackdrop({ motion }: PreviewBackdropProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const saveData = useSaveData();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const decorationRef = useRef<HTMLDivElement | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  // Sant efter första dekodade rutan. Styr intoningen, och medvetet inte
  // `paused`: en paus ska frysa den ruta som syns, inte hoppa till postern.
  const [hasPlayed, setHasPlayed] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  // Utan IntersectionObserver (jsdom, äldre browsers) antas panelen synlig —
  // dekorationen får aldrig bli beroende av en observer som inte finns.
  const [inView, setInView] = useState(true);
  // `usePrefersReducedMotion` och `useSaveData` är SSR-säkra och rapporterar
  // `false` fram till sin första effect. Utan den här latchen skulle videon
  // monteras en tick för tidigt — och ett monterat, spelande videoelement har
  // redan begärt bytes. Latchen sätts i samma effektsvep som hookarna, så
  // första renderingen (server och hydrering) alltid är ren stillbild.
  const [clientMounted, setClientMounted] = useState(false);

  // Minskad rörelse och datasparläge väljer stillbild utan att ens montera
  // videoelementet, så scenen aldrig kostar nedladdning i de lägena.
  const stillOnly = prefersReducedMotion || saveData;
  const showVideo = motion && clientMounted && !stillOnly && !mediaFailed;
  const shouldPlay = showVideo && !userPaused && !autoplayBlocked && !documentHidden && inView;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- engångslatch för klientrendering; idempotent (React bailar på samma värde)
    setClientMounted(true);
  }, []);

  useEffect(() => {
    const syncVisibility = () => setDocumentHidden(document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    const node = decorationRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      setInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    // Muted är ett krav för autoplay och sätts om vid varje försök: scenen har
    // inget ljudspår och får aldrig kunna låta.
    video.muted = true;
    let cancelled = false;
    void Promise.resolve(video.play()).catch((error: unknown) => {
      // AbortError = en ny play/pause hann före; det är inte ett block.
      if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
      setAutoplayBlocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldPlay]);

  const toggleMotion = useCallback(() => {
    // Klicket är den användargest som en blockerad autoplay väntade på.
    if (autoplayBlocked) {
      setAutoplayBlocked(false);
      setUserPaused(false);
      return;
    }
    setUserPaused((value) => !value);
  }, [autoplayBlocked]);

  const paused = userPaused || autoplayBlocked;

  return (
    <>
      <div
        ref={decorationRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden bg-[#181328]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob-host utan next/image-remotePattern; en enda 35 KB-ruta */}
        <img
          src={PREVIEW_BACKDROP_POSTER_URL}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {showVideo ? (
          <video
            ref={videoRef}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-center",
              styles.video,
              hasPlayed && styles.videoPlaying,
            )}
            poster={PREVIEW_BACKDROP_POSTER_URL}
            preload="none"
            loop
            muted
            playsInline
            tabIndex={-1}
            onPlaying={() => setHasPlayed(true)}
            onError={() => setMediaFailed(true)}
          >
            {PREVIEW_BACKDROP_VIDEO_SOURCES.map((source) => (
              <source key={source.src} src={source.src} type={source.type} />
            ))}
          </video>
        ) : null}
      </div>

      {/*
        Nederkant vänster, inte höger: Sajtagentens launcher ligger
        `fixed … sm:right-6 sm:bottom-6 z-50` och skulle annars täcka den här
        kontrollen i buildern (observerat i preview-deployen för PR #1387).
      */}
      {motion && clientMounted && !mediaFailed ? (
        stillOnly ? (
          <p className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-lg border border-violet-200/25 bg-violet-950/85 px-2.5 py-1.5 text-[11px] text-violet-50">
            {prefersReducedMotion ? "Minskad rörelse: stillbild" : "Datasparläge: stillbild"}
          </p>
        ) : (
          <button
            type="button"
            onClick={toggleMotion}
            aria-pressed={paused}
            className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-violet-200/25 bg-violet-950/85 px-2.5 py-1.5 text-[11px] text-violet-50 transition-colors hover:bg-violet-900/85 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none"
          >
            {paused ? (
              <Play className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Pause className="h-3 w-3" aria-hidden="true" />
            )}
            {paused ? "Spela bakgrunden" : "Pausa bakgrunden"}
          </button>
        )
      ) : null}
    </>
  );
}
