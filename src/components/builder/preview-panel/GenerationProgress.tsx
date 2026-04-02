"use client";

import { useEffect, useRef, useState } from "react";

const TIPS = [
  "Vi analyserar din brief och planerar sajtens struktur...",
  "Dina val påverkar layout, färgpalett och typografi.",
  "Varje sektion byggs med responsiv design i åtanke.",
  "Vi skapar unika texter anpassade för din målgrupp.",
  "Bilderna väljs ut för att matcha din varumärkeskänsla.",
  "Navigation och användarflöde optimeras automatiskt.",
  "SEO-grunderna läggs in redan från start.",
  "Kontaktformulär och CTA-knappar placeras strategiskt.",
  "Din sajt byggs med Next.js för snabb laddning.",
  "Responsiv design — ser bra ut på mobil, surfplatta och desktop.",
  "Vi polerar detaljer som hover-effekter och animationer.",
  "Snart klar — de sista pixlarna finjusteras.",
];

const TIP_INTERVAL_MS = 6000;
const TOTAL_DURATION_MS = 25 * 60 * 1000;

export function GenerationProgress() {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [fadeTip, setFadeTip] = useState(true);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const raw = Math.min(elapsed / TOTAL_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - raw, 1.4);
      setProgress(Math.min(eased * 100, 99.5));
    };
    const id = setInterval(tick, 400);
    tick();
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setFadeTip(false);
      setTimeout(() => {
        setTipIndex((i) => (i + 1) % TIPS.length);
        setFadeTip(true);
      }, 300);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const pct = Math.round(progress);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "2rem",
        background: "rgba(0,0,0,0.05)",
        gap: "1.5rem",
      }}
    >
      {/* Percentage */}
      <div
        style={{
          fontSize: "3.5rem",
          fontWeight: 300,
          letterSpacing: "-0.04em",
          color: "#1a1a2e",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}%
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          maxWidth: "320px",
          height: "4px",
          borderRadius: "2px",
          background: "#e5e5e5",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: "2px",
            background: "linear-gradient(90deg, #1a1a2e 0%, #3b3b5c 100%)",
            transition: "width 0.4s ease-out",
          }}
        />
      </div>

      {/* Status text */}
      <p
        style={{
          fontSize: "0.85rem",
          color: "#666",
          margin: 0,
          fontWeight: 500,
        }}
      >
        Bygger din sajt...
      </p>

      {/* Rolling tip */}
      <p
        style={{
          fontSize: "0.8rem",
          color: "#999",
          margin: 0,
          minHeight: "1.2em",
          textAlign: "center",
          maxWidth: "340px",
          transition: "opacity 0.3s ease",
          opacity: fadeTip ? 1 : 0,
        }}
      >
        {TIPS[tipIndex]}
      </p>

      {/* Duration notice */}
      <p
        style={{
          fontSize: "0.7rem",
          color: "#bbb",
          margin: 0,
          marginTop: "0.5rem",
        }}
      >
        Genereringen kan ta upp till 25 minuter
      </p>
    </div>
  );
}
