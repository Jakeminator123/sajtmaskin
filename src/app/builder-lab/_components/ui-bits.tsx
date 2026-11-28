"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SITE_THEMES, type ThemeKey } from "../_lib/mock-data";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-1.5 font-mono text-[10px] font-medium text-[var(--lab-muted)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  hint?: string;
};

/**
 * Segmenterad väljare med en glidande markör (delad layoutId per grupp).
 */
export function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
  iconOnly = false,
  size = "md",
  className,
  ariaLabel,
}: {
  id: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  iconOnly?: boolean;
  size?: "sm" | "md";
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={iconOnly ? option.label : undefined}
            title={option.hint ?? (iconOnly ? option.label : undefined)}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lab-blue)]",
              size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12.5px]",
              iconOnly && (size === "sm" ? "w-7 justify-center px-0" : "w-8 justify-center px-0"),
              active ? "text-white" : "text-[var(--lab-muted)] hover:text-white",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-white/[0.10] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            ) : null}
            {Icon ? <Icon className="relative size-3.5" /> : null}
            {iconOnly ? null : <span className="relative">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeDots({ theme, className }: { theme: ThemeKey | "auto"; className?: string }) {
  if (theme === "auto") {
    return (
      <span
        aria-hidden
        className={cn("inline-block size-3.5 rounded-full", className)}
        style={{ background: "conic-gradient(#c2410c, #2f7d4f, #334155, #f59e0b, #c2410c)" }}
      />
    );
  }
  const [a, b, c] = SITE_THEMES[theme].swatch;
  return (
    <span aria-hidden className={cn("inline-flex -space-x-1", className)}>
      {[a, b, c].map((color) => (
        <span
          key={color}
          className="size-3.5 rounded-full ring-1 ring-black/40"
          style={{ background: color }}
        />
      ))}
    </span>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--lab-muted)] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--lab-blue)] disabled:pointer-events-none disabled:opacity-40",
        active && "bg-white/[0.10] text-white",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@*";

/**
 * Text som «avkodas» tecken för tecken (som ögonbrynet på sajtagent.se).
 * Mellanslag och skiljetecken står still; resten slumpas tills de låses.
 */
export function ScrambleText({
  text,
  className,
  delay = 250,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(text);
  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        frame += 1;
        const locked = Math.floor(frame / 2);
        setDisplay(
          text
            .split("")
            .map((char, index) =>
              index < locked || !/[A-Za-zÅÄÖåäö0-9]/.test(char)
                ? char
                : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            )
            .join(""),
        );
        if (locked >= text.length) window.clearInterval(timer);
      }, 32);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [text, delay, reduceMotion]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{display}</span>
    </span>
  );
}

/** Ändlöst löpband med mjukt tonade kanter. */
export function Ticker({ items, className }: { items: ReactNode[]; className?: string }) {
  const row = (hidden: boolean) => (
    <div
      className="lab-ticker-row flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {items.map((item, index) => (
        <span key={index} className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          {item}
        </span>
      ))}
    </div>
  );
  return (
    <div className={`lab-ticker flex overflow-hidden ${className ?? ""}`}>
      {row(false)}
      {row(true)}
    </div>
  );
}
