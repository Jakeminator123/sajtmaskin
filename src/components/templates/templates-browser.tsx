"use client";

/**
 * TemplatesBrowser — kategori-galleri med smart client-side sök.
 *
 * Filtrerar kategorier + mallar helt på klienten (titel/beskrivning/mall-titlar)
 * via redan client-safe katalogdata — ingen API-call, ingen laddningskostnad.
 * Töm-knapp + "inga träffar"-state ingår.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Gamepad2,
  Globe,
  HelpCircle,
  Layout,
  LayoutDashboard,
  Lock,
  Palette,
  Puzzle,
  Search,
  ShoppingCart,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { getAllV0Categories, getTemplatesByCategory } from "@/lib/templates/client";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Wand2,
  Zap,
  Puzzle,
  Lock,
  FileText,
  Palette,
  Layout,
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Gamepad2,
  HelpCircle,
};

export function TemplatesBrowser() {
  const [query, setQuery] = useState("");

  const categories = useMemo(
    () => getAllV0Categories().filter((c) => c.id !== "uncategorized"),
    [],
  );

  // Mall-titlar per kategori (för sökning + antal). Beräknas en gång.
  const templatesByCategory = useMemo(() => {
    const map: Record<string, { id: string; title: string }[]> = {};
    for (const c of categories) {
      map[c.id] = getTemplatesByCategory(c.id).map((t) => ({
        id: t.id,
        title: t.title || t.id,
      }));
    }
    return map;
  }, [categories]);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) {
      return categories.map((category) => ({
        category,
        count: templatesByCategory[category.id]?.length ?? 0,
      }));
    }
    return categories
      .map((category) => {
        const templates = templatesByCategory[category.id] ?? [];
        const directMatch =
          category.title.toLowerCase().includes(q) ||
          category.description.toLowerCase().includes(q);
        const templateMatches = templates.filter((t) => t.title.toLowerCase().includes(q));
        const show = directMatch || templateMatches.length > 0;
        if (!show) return null;
        return {
          category,
          count: directMatch ? templates.length : templateMatches.length,
        };
      })
      .filter((entry): entry is { category: (typeof categories)[number]; count: number } =>
        Boolean(entry),
      );
  }, [q, categories, templatesByCategory]);

  return (
    <div>
      {/* Sökfält */}
      <div className="mx-auto mb-10 max-w-xl">
        <div className="focus-within:border-primary/40 focus-within:ring-primary/15 flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 backdrop-blur-sm transition-colors focus-within:ring-2">
          <Search className="text-muted-foreground h-4.5 w-4.5 shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök bland kategorier och mallar…"
            aria-label="Sök bland kategorier och mallar"
            className="text-foreground placeholder:text-muted-foreground/70 w-full bg-transparent py-3 text-sm outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Rensa sökning"
              className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {q && (
          <p className="text-muted-foreground mt-2 text-center text-xs">
            {results.length > 0
              ? `${results.length} kategori${results.length === 1 ? "" : "er"} matchar "${query.trim()}"`
              : `Inga träffar för "${query.trim()}"`}
          </p>
        )}
      </div>

      {/* Resultat */}
      {results.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map(({ category, count }) => {
            const Icon = ICON_MAP[category.icon] || HelpCircle;
            return (
              <Link
                key={category.id}
                href={`/category/${category.id}`}
                className="group bg-card/70 hover:bg-card border-border flex flex-col rounded-lg border p-6 backdrop-blur-sm transition-all hover:shadow-lg"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-foreground font-medium tracking-tight">{category.title}</h2>
                    {count > 0 && (
                      <span className="text-muted-foreground text-xs">{count} mallar</span>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground mb-4 flex-1 text-sm leading-relaxed">
                  {category.description}
                </p>
                <div className="text-primary flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100">
                  Utforska <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="border-border bg-card/40 mx-auto max-w-md rounded-xl border border-dashed p-10 text-center">
          <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Search className="h-5 w-5" />
          </div>
          <p className="text-foreground mb-1 text-sm font-medium">Inga träffar</p>
          <p className="text-muted-foreground mb-5 text-sm">
            Vi hittade ingen kategori eller mall som matchar din sökning.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-primary hover:bg-primary/10 inline-flex items-center gap-2 rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium transition-colors"
          >
            <X className="h-4 w-4" />
            Rensa sökning
          </button>
        </div>
      )}
    </div>
  );
}
