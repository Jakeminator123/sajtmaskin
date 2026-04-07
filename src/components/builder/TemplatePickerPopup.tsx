"use client";

import type { TemplatePickerItem } from "@/lib/builder/needs-analysis";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const PER_PAGE = 6;

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
      <div className="fixed inset-0 z-[99999] flex flex-col bg-background">
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Letar efter din stil&hellip;</p>
          </div>
        </div>
      </div>
    );
  }

  const has = selected.size > 0;
  const canPrev = page > 0;
  const canNext = page < pages - 1;

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-background">
      <header className="shrink-0 px-8 pt-12 pb-8 text-center sm:pt-14 sm:pb-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Vilken stil tilltalar dig?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
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
                  ? "bg-muted text-foreground/60 hover:bg-muted/80"
                  : "text-muted-foreground/20",
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[2.5rem] text-center text-xs font-medium tabular-nums text-muted-foreground/50">
              {page + 1} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!canNext}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                canNext
                  ? "bg-muted text-foreground/60 hover:bg-muted/80"
                  : "text-muted-foreground/20",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 px-6 sm:px-10 lg:px-16">
        <div className="mx-auto grid h-full max-w-6xl grid-cols-2 grid-rows-3 gap-4 sm:grid-cols-3 sm:grid-rows-2 sm:gap-5">
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
                    ? "shadow-lg ring-[3px] ring-primary ring-offset-0"
                    : "ring-1 ring-border hover:ring-border/60 hover:shadow-md",
                )}
              >
                {t.previewImageUrl ? (
                  <img
                    src={t.previewImageUrl}
                    alt=""
                    className={cn("h-full w-full object-cover object-top transition-all", on && "brightness-90")}
                    loading="eager"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted" />
                )}

                {on && (
                  <div className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-background bg-primary shadow-lg">
                    <Check className="h-5 w-5 text-primary-foreground" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="flex shrink-0 flex-col items-center gap-4 px-8 pt-6 pb-10">
        <button
          type="button"
          onClick={confirm}
          disabled={!has}
          className={cn(
            "w-full max-w-xs rounded-full py-3 text-sm font-semibold transition-all",
            has
              ? "bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          {has ? "Fortsätt" : "Välj minst en"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Hoppa över
        </button>
      </footer>
    </div>
  );
}
