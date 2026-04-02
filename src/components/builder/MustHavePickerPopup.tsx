"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MUST_HAVE_OPTIONS = [
  "Startsida / Hero",
  "Om oss / Om mig",
  "Kontaktformulär",
  "Webshop / Produkter",
  "Priser och paket",
  "Bokning online",
  "Bildgalleri",
  "Meny / Matsedel",
  "Blogg / Nyheter",
  "Kundrecensioner",
  "Vanliga frågor (FAQ)",
  "Portfolio / Case",
  "Vårt team",
  "Karta / Hitta hit",
  "Sociala medier-länkar",
  "Nyhetsbrev-signup",
  "Video / Presentation",
  "Tydlig CTA-knapp",
  "Logga in / Konto",
  "Tjänsteöversikt",
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
  maxWidth: "640px",
  width: "calc(100% - 2rem)",
  maxHeight: "85vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 25px 60px rgba(0,0,0,0.18)",
};

interface MustHavePickerPopupProps {
  onSelect: (labels: string[]) => void;
  onClose: () => void;
}

export function MustHavePickerPopup({ onSelect, onClose }: MustHavePickerPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setMounted(true), []);

  const toggle = useCallback((label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    onSelect(Array.from(selected));
  }, [selected, onSelect]);

  if (!mounted) return null;

  return createPortal(
    <div style={OVERLAY_STYLE} onClick={onClose}>
      <div style={POPUP_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "1.75rem 1.5rem 0.75rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.375rem", fontWeight: 600, color: "#1a1a2e", margin: 0 }}>
            Vilka delar måste finnas med?
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "0.35rem" }}>
            Välj allt som ska finnas på sajten
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
          {MUST_HAVE_OPTIONS.map((label) => {
            const isSelected = selected.has(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle(label)}
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
                <span style={{ fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
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
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Hoppa över
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
