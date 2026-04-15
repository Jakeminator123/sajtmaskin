"use client";

import type { TemplatePickerItem } from "@/lib/builder/needs-analysis";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [templates, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  useEffect(() => {
    setPage((p) => Math.min(p, pages - 1));
  }, [pages]);

  useEffect(() => {
    setPage(0);
  }, [q]);

  const visible = useMemo(
    () => filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
    [filtered, page],
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
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm font-medium">Letar stil…</p>
          </div>
        </div>
      </div>
    );
  }

  const has = selected.size > 0;
  const canPrev = page > 0;
  const canNext = page < pages - 1;
  const emptyFilter = filtered.length === 0 && templates.length > 0;

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col overflow-hidden bg-background">
      <header className="shrink-0 px-4 pb-6 pt-[max(2.5rem,env(safe-area-inset-top))] text-center sm:px-8 sm:pb-8 sm:pt-12">
        <h2 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">Stil</h2>
        <p className="text-muted-foreground mt-1 text-sm">Välj en eller flera.</p>

        <div className="mx-auto mt-6 max-w-md">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök titel eller kategori"
              className="h-11 rounded-xl border-border bg-card pl-10 pr-3 shadow-sm"
              autoComplete="off"
              aria-label="Sök mallar"
            />
          </div>
        </div>

        {pages > 1 && !emptyFilter && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={!canPrev}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                canPrev
                  ? "bg-muted text-foreground/70 hover:bg-muted/80"
                  : "text-muted-foreground/25",
              )}
              aria-label="Föregående sida"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-muted-foreground min-w-[3rem] text-center text-xs font-medium tabular-nums">
              {page + 1} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!canNext}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                canNext
                  ? "bg-muted text-foreground/70 hover:bg-muted/80"
                  : "text-muted-foreground/25",
              )}
              aria-label="Nästa sida"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-8 lg:px-12">
        {emptyFilter ? (
          <p className="text-muted-foreground py-12 text-center text-sm">Inga träffar.</p>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {visible.map((t) => {
              const on = selected.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-2xl border border-transparent text-left transition-[box-shadow,transform,border-color] duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    on
                      ? "shadow-lg ring-2 ring-primary ring-offset-0 ring-offset-background"
                      : "ring-1 ring-border hover:-translate-y-0.5 hover:shadow-md",
                  )}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                    {t.previewImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.previewImageUrl}
                        alt=""
                        className={cn(
                          "h-full w-full object-cover object-top transition-[filter,transform] duration-200",
                          on ? "brightness-[0.92]" : "group-hover:scale-[1.02]",
                        )}
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
                  </div>
                  <div className="border-border bg-card flex min-h-[4rem] flex-col justify-center border-t px-3 py-2.5 sm:px-3.5">
                    <p className="text-foreground line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
                      {t.title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{t.category}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-col items-center gap-3 border-t border-border bg-background/95 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 backdrop-blur-sm sm:gap-4 sm:py-8">
        <button
          type="button"
          onClick={confirm}
          disabled={!has}
          className={cn(
            "w-full max-w-xs rounded-full py-3.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            has
              ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          {has ? "Fortsätt" : "Välj minst en"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Hoppa över
        </button>
      </footer>
    </div>
  );
}
