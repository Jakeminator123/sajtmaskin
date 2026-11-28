"use client";

import { motion } from "framer-motion";
import { Columns2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_LABELS, SITE_THEMES } from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";

/**
 * Versioner som en flytande tidslinje i stället för en 320 px sidopanel.
 * Hovra för sammanfattning, klicka för att visa, «Jämför» för före/efter.
 */
export function VersionTimeline({ studio, className }: { studio: Studio; className?: string }) {
  const { state, activeVersion, previousVersion, selectVersion, set } = studio;
  if (state.versions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        "flex items-center gap-1 rounded-full border border-white/10 bg-[#0b0f18]/85 p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 pr-1 pl-2.5 text-[11px] font-medium text-[var(--lab-muted)]">
        <History className="size-3.5" />
        <span className="hidden sm:inline">Versioner</span>
      </span>
      <ol className="flex items-center gap-0.5">
        {state.versions.map((version, index) => {
          const active = version.id === activeVersion?.id;
          return (
            <li key={version.id} className="group relative flex items-center">
              {index > 0 ? <span className="mx-0.5 h-px w-2.5 bg-white/15" aria-hidden /> : null}
              <button
                type="button"
                onClick={() => selectVersion(version.id)}
                disabled={Boolean(state.pending)}
                aria-current={active || undefined}
                className={cn(
                  "relative h-7 rounded-full px-2.5 font-mono text-[11.5px] font-medium transition-colors disabled:cursor-wait",
                  active ? "text-white" : "text-[var(--lab-muted)] hover:text-white",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="lab-version-active"
                    className="absolute inset-0 rounded-full bg-[var(--lab-blue)] shadow-[0_0_20px_-4px_rgba(61,123,255,0.9)]"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                ) : null}
                <span className="relative">v{version.number}</span>
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 mb-3 w-60 -translate-x-1/2 translate-y-1 rounded-2xl border border-white/10 bg-[#0e121b]/95 p-3 text-left opacity-0 shadow-2xl backdrop-blur-xl transition-all group-hover:translate-y-0 group-hover:opacity-100"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold">Version {version.number}</span>
                  <span className="flex gap-0.5">
                    {SITE_THEMES[version.theme].swatch.map((color) => (
                      <span
                        key={color}
                        className="size-2.5 rounded-full ring-1 ring-white/20"
                        style={{ background: color }}
                      />
                    ))}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug text-[var(--lab-muted)]">
                  {version.summary}
                </p>
                <p className="mt-2 text-[10.5px] text-white/40">
                  {version.changed.map((id) => SECTION_LABELS[id]).join(" · ")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {previousVersion && state.view === "preview" ? (
        <button
          type="button"
          onClick={() => set({ compare: !state.compare, inspect: false, selectedSection: null })}
          disabled={Boolean(state.pending)}
          aria-pressed={state.compare}
          className={cn(
            "ml-1 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-40",
            state.compare
              ? "bg-white text-[#0b0f18]"
              : "text-[var(--lab-muted)] hover:bg-white/[0.07] hover:text-white",
          )}
        >
          <Columns2 className="size-3.5" />
          Jämför
        </button>
      ) : null}
    </motion.div>
  );
}
