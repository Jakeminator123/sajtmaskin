"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const FULL_TEXT = "SajtMaskin";
const SCRAMBLE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789";
const BOOST_PARTICLES = [
  { size: 3.1, opacity: 0.48, bottom: -2, left: 14.6, duration: 0.34, delay: 0 },
  { size: 4.2, opacity: 0.62, bottom: 1, left: 17.8, duration: 0.46, delay: 0.08 },
  { size: 3.7, opacity: 0.72, bottom: 4, left: 19.2, duration: 0.39, delay: 0.16 },
  { size: 5.1, opacity: 0.57, bottom: 7, left: 16.3, duration: 0.53, delay: 0.24 },
];

export function AnimatedLogo({ className = "" }: { className?: string }) {
  const [display, setDisplay] = useState("");
  const [isHovering, setIsHovering] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [rocketPhase, setRocketPhase] = useState<"launch" | "idle" | "boost">("launch");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplay(FULL_TEXT.slice(0, i));
      if (i >= FULL_TEXT.length) {
        clearInterval(timer);
        setHasLoaded(true);
        setTimeout(() => setRocketPhase("idle"), 300);
      }
    }, 80);
    return () => clearInterval(timer);
  }, []);

  const startScramble = useCallback(() => {
    if (!hasLoaded) return;
    setIsHovering(true);
    setRocketPhase("boost");
    frameRef.current = 0;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      frameRef.current++;
      const revealed = Math.min(Math.floor(frameRef.current / 2), FULL_TEXT.length);

      const scrambled = FULL_TEXT.split("")
        .map((_, idx) => {
          if (idx < revealed) return FULL_TEXT[idx];
          return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        })
        .join("");

      setDisplay(scrambled);

      if (revealed >= FULL_TEXT.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplay(FULL_TEXT);
        setIsHovering(false);
        setRocketPhase("idle");
      }
    }, 35);
  }, [hasLoaded]);

  const showCursor = !hasLoaded;

  return (
    <span
      className={`inline-flex items-center gap-2 select-none cursor-pointer group ${className}`}
      onMouseEnter={startScramble}
      role="img"
      aria-label="SajtMaskin"
    >
      <span className="relative flex items-center justify-center w-9 h-9 shrink-0">
        <span
          className={`absolute inset-0 rounded-xl transition-all duration-700 ${
            rocketPhase === "launch"
              ? "scale-0 opacity-0"
              : rocketPhase === "boost"
                ? "scale-125 opacity-100"
                : "scale-100 opacity-60"
          }`}
          style={{
            background: "radial-gradient(circle, rgba(45,212,191,0.25) 0%, transparent 70%)",
            filter: "blur(6px)",
          }}
        />

        <span
          className={`relative z-10 block transition-all duration-500 ease-out ${
            rocketPhase === "launch"
              ? "translate-y-3 opacity-0 scale-75 rotate-12"
              : rocketPhase === "boost"
                ? "-translate-y-0.5 scale-110 -rotate-6"
                : "translate-y-0 scale-100 rotate-0"
          }`}
          style={{
            animation:
              rocketPhase === "idle"
                ? "rocket-float 3s ease-in-out infinite, rocket-glow-pulse 2s ease-in-out infinite"
                : rocketPhase === "boost"
                  ? "rocket-shake 0.1s ease-in-out infinite"
                  : "none",
          }}
        >
          <Image
            src="/images/rocket-logo.webp"
            alt=""
            width={36}
            height={36}
            className="w-9 h-9 object-contain drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]"
            priority
          />
        </span>

        {rocketPhase === "boost" && (
          <>
            {BOOST_PARTICLES.map((particle, i) => (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  background: `rgba(45,212,191,${particle.opacity})`,
                  bottom: `${particle.bottom}px`,
                  left: `${particle.left}px`,
                  animation: `exhaust-particle ${particle.duration}s ease-out ${particle.delay}s infinite`,
                  filter: "blur(1px)",
                }}
              />
            ))}
          </>
        )}
      </span>

      <span className="font-(--font-heading) tracking-tight">
        <span className={`transition-colors duration-200 ${isHovering ? "text-primary" : ""}`}>
          {display}
        </span>
      </span>
      {showCursor && <span className="inline-block w-[2px] h-[1em] bg-primary ml-0.5 animate-pulse" />}
    </span>
  );
}
