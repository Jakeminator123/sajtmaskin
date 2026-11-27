"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const WORDMARK = "Sajtmaskin";
const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789";
const PARTICLES = [
  { size: 3.1, opacity: 0.48, bottom: -2, left: 12.6, duration: 0.34, delay: 0 },
  { size: 4.2, opacity: 0.62, bottom: 1, left: 15.8, duration: 0.46, delay: 0.08 },
  { size: 3.7, opacity: 0.72, bottom: 4, left: 17.2, duration: 0.39, delay: 0.16 },
  { size: 5.1, opacity: 0.57, bottom: 7, left: 14.3, duration: 0.53, delay: 0.24 },
];

/**
 * Raketloggan från landningssidan (samma bild och keyframes i
 * `styles/landing-v2.css`), men medveten om bygget: den svävar i vila, boostar
 * med partiklar medan något byggs och gör ett lyft när en version blir klar.
 * Hovra för att «avkoda» ordmärket. Ordmärket döljs under `wordmarkFrom`.
 */
export function LabLogo({
  building = false,
  launches = 0,
  wordmarkFrom = "sm",
  className,
}: {
  building?: boolean;
  /** Ökar för varje färdig version; varje ökning ger ett lyft. */
  launches?: number;
  wordmarkFrom?: "always" | "sm" | "xl" | "2xl" | "never";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState(reduceMotion ? WORDMARK : "");
  const [typed, setTyped] = useState(Boolean(reduceMotion));
  const [hovering, setHovering] = useState(false);
  const scrambleRef = useRef<number | null>(null);

  // Ordmärket skrivs fram en gång vid start.
  useEffect(() => {
    if (reduceMotion) return;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setText(WORDMARK.slice(0, index));
      if (index >= WORDMARK.length) {
        window.clearInterval(timer);
        setTyped(true);
      }
    }, 70);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  useEffect(
    () => () => {
      if (scrambleRef.current) window.clearInterval(scrambleRef.current);
    },
    [],
  );

  const scramble = useCallback(() => {
    if (!typed || reduceMotion) return;
    setHovering(true);
    let frame = 0;
    if (scrambleRef.current) window.clearInterval(scrambleRef.current);
    scrambleRef.current = window.setInterval(() => {
      frame += 1;
      const revealed = Math.min(Math.floor(frame / 2), WORDMARK.length);
      setText(
        WORDMARK.split("")
          .map((char, index) =>
            index < revealed ? char : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)],
          )
          .join(""),
      );
      if (revealed >= WORDMARK.length) {
        if (scrambleRef.current) window.clearInterval(scrambleRef.current);
        setText(WORDMARK);
        setHovering(false);
      }
    }, 35);
  }, [typed, reduceMotion]);

  const boosting = building || hovering;

  return (
    <span
      className={cn("group inline-flex items-center gap-2 select-none", className)}
      onMouseEnter={scramble}
      role="img"
      aria-label={building ? "Sajtmaskin, bygger" : "Sajtmaskin"}
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 rounded-xl transition-all duration-700",
            boosting ? "scale-125 opacity-100" : "scale-100 opacity-60",
          )}
          style={{
            background: "radial-gradient(circle, rgba(45,212,191,0.28) 0%, transparent 70%)",
            filter: "blur(6px)",
          }}
        />
        <motion.span
          key={launches}
          className="relative z-10 block"
          initial={false}
          animate={
            launches > 0 && !reduceMotion
              ? { y: [0, -14, 2, 0], rotate: [0, -16, 4, 0], scale: [1, 1.15, 0.98, 1] }
              : { y: 0 }
          }
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className={cn(
              "block transition-transform duration-500 ease-out",
              boosting ? "-translate-y-0.5 scale-110 -rotate-6" : "",
            )}
            style={{
              animation: reduceMotion
                ? "none"
                : boosting
                  ? "rocket-shake 0.1s ease-in-out infinite"
                  : "rocket-float 3s ease-in-out infinite, rocket-glow-pulse 2s ease-in-out infinite",
            }}
          >
            <Image
              src="/images/rocket-logo.webp"
              alt=""
              width={32}
              height={32}
              className="size-8 object-contain drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]"
              priority
            />
          </span>
        </motion.span>
        {boosting && !reduceMotion
          ? PARTICLES.map((particle, index) => (
              <span
                key={index}
                className="absolute rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  background: `rgba(45,212,191,${particle.opacity})`,
                  bottom: particle.bottom,
                  left: particle.left,
                  animation: `exhaust-particle ${particle.duration}s ease-out ${particle.delay}s infinite`,
                  filter: "blur(1px)",
                }}
              />
            ))
          : null}
      </span>
      {wordmarkFrom === "never" ? null : (
        <span
          className={cn(
            "font-semibold tracking-tight tabular-nums",
            wordmarkFrom === "sm" && "hidden sm:inline",
            wordmarkFrom === "xl" && "hidden xl:inline",
            wordmarkFrom === "2xl" && "hidden 2xl:inline",
            hovering ? "text-[#5eead4]" : "text-white",
          )}
        >
          {/* Osynligt helt ordmärke håller bredden, så inget hoppar när det skrivs fram. */}
          <span className="inline-grid">
            <span className="invisible [grid-area:1/1]" aria-hidden>
              {WORDMARK}
            </span>
            <span className="[grid-area:1/1]">
              {text}
              {typed ? null : (
                <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#5eead4] align-[-0.12em]" />
              )}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
