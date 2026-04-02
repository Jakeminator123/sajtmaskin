"use client";

import type { TemplatePickerItem } from "@/lib/builder/needs-analysis";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const PER_PAGE = 6;

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99999,
  display: "flex",
  flexDirection: "column",
  background: "#ffffff",
};

interface TemplatePickerPopupProps {
  templates: TemplatePickerItem[];
  isLoading?: boolean;
  onSelect: (templateIds: string[]) => void;
  onClose: () => void;
}

export function TemplatePickerPopup(props: TemplatePickerPopupProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<PickerInner {...props} />, document.body);
}

function PickerInner({ templates, isLoading, onSelect, onClose }: TemplatePickerPopupProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const pages = Math.max(1, Math.ceil(templates.length / PER_PAGE));
  const visible = useMemo(
    () => templates.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
    [templates, page],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirm = useCallback(() => onSelect(Array.from(selected)), [selected, onSelect]);

  if (isLoading) {
    return (
      <div style={OVERLAY_STYLE}>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
            <p className="text-sm font-medium text-neutral-500">Letar efter din stil…</p>
          </div>
        </div>
      </div>
    );
  }

  const has = selected.size > 0;
  const canPrev = page > 0;
  const canNext = page < pages - 1;

  return (
    <div style={OVERLAY_STYLE}>
      {/* ── Header ── */}
      <header className="shrink-0 px-8 pt-12 pb-8 text-center sm:pt-14 sm:pb-10">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Vilken stil tilltalar dig?
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          Välj en eller flera som inspiration
        </p>

        {pages > 1 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={!canPrev}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                canPrev
                  ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  : "text-neutral-200",
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[2.5rem] text-center text-xs font-medium tabular-nums text-neutral-300">
              {page + 1} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!canNext}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                canNext
                  ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  : "text-neutral-200",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      {/* ── Cards 3×2 ── */}
      <div className="min-h-0 flex-1 px-6 sm:px-10 lg:px-16">
        <div className="mx-auto grid h-full max-w-6xl grid-cols-3 grid-rows-2 gap-5">
          {visible.map((t) => {
            const on = selected.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  "group relative overflow-hidden rounded-xl transition-all duration-200",
                  on
                    ? "shadow-lg"
                    : "ring-1 ring-neutral-200 hover:ring-neutral-300 hover:shadow-md",
                )}
                style={on ? { outline: "3px solid #1a1a2e", outlineOffset: "-3px" } : undefined}
              >
                {t.previewImageUrl ? (
                  <img
                    src={t.previewImageUrl}
                    alt=""
                    className={cn("h-full w-full object-cover object-top transition-all", on && "brightness-90")}
                    loading="eager"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-neutral-50" />
                )}

                {on && (
                  <div
                    className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
                    style={{ background: "#1a1a2e", border: "3px solid #fff" }}
                  >
                    <Check className="h-5 w-5 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="flex shrink-0 flex-col items-center gap-4 px-8 pt-6 pb-10">
        <button
          type="button"
          onClick={confirm}
          disabled={!has}
          className="w-full max-w-xs rounded-full py-3 text-sm font-semibold transition-all"
          style={
            has
              ? { background: "#1a1a2e", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }
              : { background: "#e5e5e5", color: "#a3a3a3" }
          }
        >
          {has ? "Fortsätt" : "Välj minst en"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-neutral-400 transition-colors hover:text-neutral-600"
        >
          Hoppa över
        </button>
      </footer>
    </div>
  );
}
