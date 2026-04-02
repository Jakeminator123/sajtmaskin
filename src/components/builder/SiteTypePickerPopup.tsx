"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface SiteTypeOption {
  id: string;
  label: string;
}

export const SITE_TYPE_OPTIONS: SiteTypeOption[] = [
  { id: "business", label: "Företag / Tjänster" },
  { id: "ecommerce", label: "Webshop / E-handel" },
  { id: "restaurant", label: "Restaurang / Café" },
  { id: "portfolio", label: "Portfolio / CV" },
  { id: "landing", label: "Landningssida" },
  { id: "blog", label: "Blogg / Magasin" },
  { id: "healthcare", label: "Vård / Klinik" },
  { id: "realestate", label: "Fastighet / Mäklare" },
  { id: "salon", label: "Salong / Skönhet" },
  { id: "fitness", label: "Gym / Tränare" },
  { id: "construction", label: "Bygg / Hantverk" },
  { id: "consulting", label: "Konsult / Byrå" },
  { id: "education", label: "Utbildning / Skola" },
  { id: "event", label: "Event / Bröllop" },
  { id: "nonprofit", label: "Förening / Ideell" },
  { id: "music", label: "Musik / Artist" },
  { id: "hotel", label: "Hotell / Boende" },
  { id: "legal", label: "Juridik / Advokat" },
  { id: "accounting", label: "Ekonomi / Redovisning" },
  { id: "tech", label: "Tech / Startup" },
  { id: "auto", label: "Bil / Motor" },
  { id: "travel", label: "Resa / Turism" },
  { id: "food", label: "Mat / Catering" },
  { id: "photo", label: "Foto / Video" },
  { id: "other", label: "Annat" },
];

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(6px)",
};

const POPUP_STYLE: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "1.5rem",
  maxWidth: "720px",
  width: "calc(100% - 2rem)",
  maxHeight: "85vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 25px 60px rgba(0,0,0,0.18)",
};

interface SiteTypePickerPopupProps {
  onSelect: (selectedIds: string[], labels: string[]) => void;
  onClose: () => void;
}

export function SiteTypePickerPopup({ onSelect, onClose }: SiteTypePickerPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  if (!mounted) return null;

  return createPortal(
    <div style={OVERLAY_STYLE} onClick={onClose}>
      <div style={POPUP_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "1.75rem 1.5rem 0.75rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.375rem", fontWeight: 600, color: "#1a1a2e", margin: 0 }}>
            Vilken typ av sajt vill du bygga?
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "0.35rem" }}>
            Välj en eller flera
          </p>
        </div>

        <div
          style={{
            overflowY: "auto",
            padding: "0.75rem 1.5rem 1rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
            gap: "0.45rem",
          }}
        >
          {SITE_TYPE_OPTIONS.map((opt) => {
            const isSelected = selected.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className="relative flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-left text-[0.8rem] transition-all"
                style={
                  isSelected
                    ? { borderColor: "#1a1a2e", background: "#1a1a2e", color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }
                    : { borderColor: "#e5e5e5", background: "#fafafa", color: "#404040" }
                }
              >
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#fff" }} />
                )}
                <span style={{ fontWeight: 500, lineHeight: 1.3 }}>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "0.75rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleContinue}
            disabled={selected.size === 0}
            className="w-full max-w-xs rounded-full py-3 text-sm font-semibold transition-all"
            style={
              selected.size > 0
                ? { background: "#1a1a2e", color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }
                : { background: "#e5e5e5", color: "#aaa", cursor: "not-allowed" }
            }
          >
            {selected.size > 0 ? "Fortsätt" : "Välj minst en"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
