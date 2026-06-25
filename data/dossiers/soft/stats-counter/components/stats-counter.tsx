"use client";

import { useEffect, useRef, useState } from "react";

export interface StatItem {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
}

interface StatsCounterProps {
  items: StatItem[];
  title?: string;
  description?: string;
  /** Count-up duration in ms. Set 0 to disable animation. */
  durationMs?: number;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useCountUp(target: number, active: boolean, durationMs: number): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (durationMs <= 0 || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);

  return value;
}

function formatValue(value: number, target: number): string {
  const hasDecimals = !Number.isInteger(target);
  const rounded = hasDecimals ? Math.round(value * 10) / 10 : Math.round(value);
  // Pin the locale so the server pre-render and the client hydration produce
  // identical text. The host-default locale can differ between Node and the
  // browser (e.g. "1,000" / "0.0" vs "1 000" / "0,0"), causing a hydration
  // mismatch on the initial 0-state render.
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: hasDecimals ? 1 : 0,
    maximumFractionDigits: hasDecimals ? 1 : 0,
  });
}

function StatCell({
  item,
  active,
  durationMs,
}: {
  item: StatItem;
  active: boolean;
  durationMs: number;
}) {
  const animated = useCountUp(item.value, active, durationMs);
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-4xl font-bold tabular-nums text-foreground sm:text-5xl">
        {item.prefix}
        {formatValue(animated, item.value)}
        {item.suffix}
      </span>
      <span className="mt-2 text-sm text-muted-foreground">{item.label}</span>
    </div>
  );
}

export function StatsCounter({
  items,
  title,
  description,
  durationMs = 1600,
  className,
}: StatsCounterProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className={className}>
      {(title || description) && (
        <header className="mb-10 text-center">
          {title && (
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
          )}
          {description && (
            <p className="mt-2 text-base text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      <div className="flex flex-wrap items-start justify-center gap-x-12 gap-y-10">
        {items.map((item, idx) => (
          <StatCell
            key={`${idx}-${item.label}`}
            item={item}
            active={active}
            durationMs={durationMs}
          />
        ))}
      </div>
    </section>
  );
}
