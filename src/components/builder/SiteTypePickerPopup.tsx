"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface SiteTypeOption {
  id: string;
  label: string;
}

const TOP_PICKS_COUNT = 8;

export const SITE_TYPE_OPTIONS: SiteTypeOption[] = [
  { id: "business", label: "Företag / Tjänster" },
  { id: "ecommerce", label: "Webshop / E-handel" },
  { id: "restaurant", label: "Restaurang / Café" },
  { id: "portfolio", label: "Portfolio / CV" },
  { id: "landing", label: "Landningssida" },
  { id: "blog", label: "Blogg / Magasin" },
  { id: "consulting", label: "Konsult / Byrå" },
  { id: "tech", label: "Tech / Startup" },
  { id: "healthcare", label: "Vård / Klinik" },
  { id: "realestate", label: "Fastighet / Mäklare" },
  { id: "salon", label: "Salong / Skönhet" },
  { id: "fitness", label: "Gym / Tränare" },
  { id: "construction", label: "Bygg / Hantverk" },
  { id: "education", label: "Utbildning / Skola" },
  { id: "event", label: "Event / Bröllop" },
  { id: "nonprofit", label: "Förening / Ideell" },
  { id: "music", label: "Musik / Artist" },
  { id: "hotel", label: "Hotell / Boende" },
  { id: "legal", label: "Juridik / Advokat" },
  { id: "accounting", label: "Ekonomi / Redovisning" },
  { id: "auto", label: "Bil / Motor" },
  { id: "travel", label: "Resa / Turism" },
  { id: "food", label: "Mat / Catering" },
  { id: "photo", label: "Foto / Video" },
  { id: "other", label: "Annat" },
];

interface SiteTypePickerPopupProps {
  onSelect: (selectedIds: string[], labels: string[]) => void;
  onClose: () => void;
}

export function SiteTypePickerPopup({ onSelect, onClose }: SiteTypePickerPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    const ids = Array.from(selected);
    const labels = ids
      .map((id) => SITE_TYPE_OPTIONS.find((o) => o.id === id)?.label)
      .filter(Boolean) as string[];
    onSelect(ids, labels);
  }, [selected, onSelect]);

  const visibleOptions = showAll ? SITE_TYPE_OPTIONS : SITE_TYPE_OPTIONS.slice(0, TOP_PICKS_COUNT);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden rounded-3xl border border-border/20 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-7 pb-3 text-center">
          <h2 className="text-xl font-semibold text-foreground">
            Vilken typ av sajt vill du bygga?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Välj en eller flera
          </p>
        </div>

        <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-2 overflow-y-auto px-6 py-3">
          {visibleOptions.map((opt) => {
            const isSelected = selected.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/50 bg-muted/30 text-foreground/70 hover:border-primary/30 hover:bg-muted",
                )}
              >
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="leading-snug">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {!showAll && SITE_TYPE_OPTIONS.length > TOP_PICKS_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mx-auto flex items-center gap-1 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Fler kategorier
            <ChevronDown className="h-3 w-3" />
          </button>
        )}

        <div className="flex flex-col items-center gap-2 px-6 pt-3 pb-6">
          <button
            type="button"
            onClick={handleContinue}
            disabled={selected.size === 0}
            className={cn(
              "w-full max-w-xs rounded-full py-3 text-sm font-semibold transition-all",
              selected.size > 0
                ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            {selected.size > 0 ? "Fortsätt" : "Välj minst en"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Hoppa över
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
