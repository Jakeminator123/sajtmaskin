"use client";

import { useState } from "react";
import { Check, Palette, Sparkles } from "lucide-react";

/**
 * Color palette definitions
 * Each palette has primary, secondary, and accent colors
 */
export interface ColorPalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  industries?: string[]; // Which industries this palette suits
}

export const PREDEFINED_PALETTES: ColorPalette[] = [
  {
    id: "professional-blue",
    name: "Professionell blå",
    primary: "#1E40AF",
    secondary: "#3B82F6",
    accent: "#60A5FA",
    industries: ["tech", "consulting", "education"],
  },
  {
    id: "modern-dark",
    name: "Modern mörk",
    primary: "#18181B",
    secondary: "#27272A",
    accent: "#A855F7",
    industries: ["tech", "creative"],
  },
  {
    id: "warm-orange",
    name: "Varm orange",
    primary: "#EA580C",
    secondary: "#F97316",
    accent: "#FDBA74",
    industries: ["restaurant", "retail"],
  },
  {
    id: "nature-green",
    name: "Natur grön",
    primary: "#166534",
    secondary: "#22C55E",
    accent: "#86EFAC",
    industries: ["health", "nonprofit"],
  },
  {
    id: "elegant-purple",
    name: "Elegant lila",
    primary: "#6B21A8",
    secondary: "#9333EA",
    accent: "#C084FC",
    industries: ["creative", "education"],
  },
  {
    id: "coral-pink",
    name: "Korall rosa",
    primary: "#BE185D",
    secondary: "#EC4899",
    accent: "#F9A8D4",
    industries: ["health", "creative"],
  },
  {
    id: "ocean-teal",
    name: "Havs turkos",
    primary: "#0F766E",
    secondary: "#14B8A6",
    accent: "#5EEAD4",
    industries: ["health", "consulting"],
  },
  {
    id: "sunset-gradient",
    name: "Solnedgång",
    primary: "#DC2626",
    secondary: "#F59E0B",
    accent: "#FCD34D",
    industries: ["restaurant", "retail"],
  },
];

// Industry-specific palettes
export const INDUSTRY_PALETTES: ColorPalette[] = [
  // Café/Coffee shop
  {
    id: "cafe-warm-brown",
    name: "Café Brun",
    primary: "#78350F",
    secondary: "#A16207",
    accent: "#FDE68A",
    industries: ["cafe"],
  },
  {
    id: "cafe-cream",
    name: "Krämvit Café",
    primary: "#292524",
    secondary: "#78716C",
    accent: "#FEF3C7",
    industries: ["cafe"],
  },
  {
    id: "cafe-terracotta",
    name: "Terrakotta",
    primary: "#9A3412",
    secondary: "#C2410C",
    accent: "#FED7AA",
    industries: ["cafe"],
  },
  // Restaurant
  {
    id: "restaurant-elegant",
    name: "Elegant Restaurang",
    primary: "#1C1917",
    secondary: "#44403C",
    accent: "#D97706",
    industries: ["restaurant"],
  },
  {
    id: "restaurant-wine",
    name: "Vinröd",
    primary: "#7F1D1D",
    secondary: "#991B1B",
    accent: "#FCA5A5",
    industries: ["restaurant"],
  },
  {
    id: "restaurant-gold",
    name: "Guld & Svart",
    primary: "#171717",
    secondary: "#262626",
    accent: "#EAB308",
    industries: ["restaurant"],
  },
  // Tech
  {
    id: "tech-neon",
    name: "Tech Neon",
    primary: "#0F172A",
    secondary: "#1E293B",
    accent: "#22D3EE",
    industries: ["tech"],
  },
  {
    id: "tech-gradient",
    name: "Tech Gradient",
    primary: "#312E81",
    secondary: "#4F46E5",
    accent: "#818CF8",
    industries: ["tech"],
  },
  // Health/Wellness
  {
    id: "health-calm",
    name: "Lugn Wellness",
    primary: "#134E4A",
    secondary: "#0D9488",
    accent: "#99F6E4",
    industries: ["health"],
  },
  {
    id: "health-natural",
    name: "Naturlig Hälsa",
    primary: "#365314",
    secondary: "#65A30D",
    accent: "#D9F99D",
    industries: ["health"],
  },
  // Real Estate
  {
    id: "realestate-luxury",
    name: "Lyxig Fastighet",
    primary: "#1E3A8A",
    secondary: "#1D4ED8",
    accent: "#DBEAFE",
    industries: ["realestate"],
  },
  {
    id: "realestate-trust",
    name: "Trovärdig",
    primary: "#0C4A6E",
    secondary: "#0284C7",
    accent: "#BAE6FD",
    industries: ["realestate"],
  },
  // E-commerce
  {
    id: "ecommerce-vibrant",
    name: "Levande Shop",
    primary: "#9D174D",
    secondary: "#DB2777",
    accent: "#FBCFE8",
    industries: ["ecommerce"],
  },
  {
    id: "ecommerce-clean",
    name: "Ren E-handel",
    primary: "#1F2937",
    secondary: "#4B5563",
    accent: "#10B981",
    industries: ["ecommerce"],
  },
  // Creative
  {
    id: "creative-bold",
    name: "Djärv Kreativ",
    primary: "#7C2D12",
    secondary: "#EA580C",
    accent: "#FED7AA",
    industries: ["creative"],
  },
  // Nonprofit
  {
    id: "nonprofit-trust",
    name: "Förtroende",
    primary: "#1E40AF",
    secondary: "#2563EB",
    accent: "#FCD34D",
    industries: ["nonprofit"],
  },
];

// Get palettes recommended for a specific industry
export function getIndustryPalettes(industry: string): ColorPalette[] {
  if (!industry) return PREDEFINED_PALETTES;

  // Get industry-specific palettes first
  const industrySpecific = INDUSTRY_PALETTES.filter((p) =>
    p.industries?.includes(industry)
  );

  // Then get general palettes that also suit this industry
  const generalMatching = PREDEFINED_PALETTES.filter((p) =>
    p.industries?.includes(industry)
  );

  // Combine: industry-specific first, then general, then rest
  const combined = [...industrySpecific, ...generalMatching];

  // Add remaining general palettes that aren't already included
  const remaining = PREDEFINED_PALETTES.filter(
    (p) => !combined.some((c) => c.id === p.id)
  );

  return [...combined, ...remaining];
}

interface ColorPalettePickerProps {
  selectedPalette: ColorPalette | null;
  onSelect: (palette: ColorPalette) => void;
  customColors?: { primary: string; secondary: string; accent: string };
  onCustomColorChange?: (
    type: "primary" | "secondary" | "accent",
    color: string
  ) => void;
  industry?: string; // Optional industry to filter/recommend palettes
}

export function ColorPalettePicker({
  selectedPalette,
  onSelect,
  customColors,
  onCustomColorChange,
  industry,
}: ColorPalettePickerProps) {
  const [showCustom, setShowCustom] = useState(false);

  const handleColorChange = (
    type: "primary" | "secondary" | "accent",
    color: string
  ) => {
    if (onCustomColorChange) {
      onCustomColorChange(type, color);
    }
  };

  // Get palettes sorted by relevance to industry
  const palettes = getIndustryPalettes(industry || "");

  // Split into recommended and other
  const recommendedPalettes = industry
    ? palettes.filter((p) => p.industries?.includes(industry))
    : [];
  const otherPalettes = industry
    ? palettes.filter((p) => !p.industries?.includes(industry))
    : palettes;

  return (
    <div className="space-y-4">
      {/* Recommended palettes for industry */}
      {recommendedPalettes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">
              Rekommenderade för din bransch
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recommendedPalettes.map((palette) => (
              <button
                key={palette.id}
                onClick={() => {
                  onSelect(palette);
                  setShowCustom(false);
                }}
              className={`relative p-3 border transition-all ${
                selectedPalette?.id === palette.id && !showCustom
                  ? "border-amber-500 ring-2 ring-amber-500/20"
                  : "border-gray-700 hover:border-gray-600"
              }`}
              >
                {selectedPalette?.id === palette.id && !showCustom && (
                  <div className="absolute -top-2 -right-2 bg-amber-500 rounded-full p-0.5">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
                <div className="flex gap-1 mb-2">
                  <div
                    className="w-6 h-6 border border-gray-600"
                    style={{ backgroundColor: palette.primary }}
                    title="Primär"
                  />
                  <div
                    className="w-6 h-6 border border-gray-600"
                    style={{ backgroundColor: palette.secondary }}
                    title="Sekundär"
                  />
                  <div
                    className="w-6 h-6 border border-gray-600"
                    style={{ backgroundColor: palette.accent }}
                    title="Accent"
                  />
                </div>
                <span className="text-xs text-gray-300 block truncate">
                  {palette.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Other palettes */}
      <div className="space-y-2">
        {recommendedPalettes.length > 0 && (
          <span className="text-sm text-gray-500">Övriga paletter</span>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {otherPalettes.map((palette) => (
            <button
              key={palette.id}
              onClick={() => {
                onSelect(palette);
                setShowCustom(false);
              }}
              className={`relative p-3 border transition-all ${
                selectedPalette?.id === palette.id && !showCustom
                  ? "border-teal-500 ring-2 ring-teal-500/20"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              {selectedPalette?.id === palette.id && !showCustom && (
                <div className="absolute -top-2 -right-2 bg-teal-500 p-0.5">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              <div className="flex gap-1 mb-2">
                <div
                  className="w-6 h-6 border border-gray-600"
                  style={{ backgroundColor: palette.primary }}
                  title="Primär"
                />
                <div
                  className="w-6 h-6 border border-gray-600"
                  style={{ backgroundColor: palette.secondary }}
                  title="Sekundär"
                />
                <div
                  className="w-6 h-6 border border-gray-600"
                  style={{ backgroundColor: palette.accent }}
                  title="Accent"
                />
              </div>
              <span className="text-xs text-gray-300 block truncate">
                {palette.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom color toggle */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`w-full flex items-center justify-center gap-2 py-2 px-4 border transition-all ${
          showCustom
            ? "border-teal-500 bg-teal-500/10 text-teal-400"
            : "border-gray-700 hover:border-gray-600 text-gray-400"
        }`}
      >
        <Palette className="h-4 w-4" />
        <span className="text-sm">
          {showCustom ? "Anpassa färger" : "Anpassa egna färger"}
        </span>
      </button>

      {/* Custom color pickers */}
      {showCustom && (
        <div className="bg-gray-800/50 border border-gray-700 p-4 space-y-4">
          <p className="text-xs text-gray-500">
            Klicka på färgcirkeln för att välja egen färg
          </p>

          <div className="grid grid-cols-3 gap-4">
            {/* Primary color */}
            <div className="space-y-2">
              <label
                htmlFor="color-primary"
                className="text-xs text-gray-400 block"
              >
                Primär
              </label>
              <div className="relative">
                <input
                  id="color-primary"
                  name="color-primary"
                  type="color"
                  value={
                    customColors?.primary ||
                    selectedPalette?.primary ||
                    "#1E40AF"
                  }
                  onChange={(e) => handleColorChange("primary", e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div
                  className="w-full h-10 border border-gray-600 cursor-pointer"
                  style={{
                    backgroundColor:
                      customColors?.primary ||
                      selectedPalette?.primary ||
                      "#1E40AF",
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {customColors?.primary || selectedPalette?.primary || "#1E40AF"}
              </span>
            </div>

            {/* Secondary color */}
            <div className="space-y-2">
              <label
                htmlFor="color-secondary"
                className="text-xs text-gray-400 block"
              >
                Sekundär
              </label>
              <div className="relative">
                <input
                  id="color-secondary"
                  name="color-secondary"
                  type="color"
                  value={
                    customColors?.secondary ||
                    selectedPalette?.secondary ||
                    "#3B82F6"
                  }
                  onChange={(e) =>
                    handleColorChange("secondary", e.target.value)
                  }
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div
                  className="w-full h-10 border border-gray-600 cursor-pointer"
                  style={{
                    backgroundColor:
                      customColors?.secondary ||
                      selectedPalette?.secondary ||
                      "#3B82F6",
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {customColors?.secondary ||
                  selectedPalette?.secondary ||
                  "#3B82F6"}
              </span>
            </div>

            {/* Accent color */}
            <div className="space-y-2">
              <label
                htmlFor="color-accent"
                className="text-xs text-gray-400 block"
              >
                Accent
              </label>
              <div className="relative">
                <input
                  id="color-accent"
                  name="color-accent"
                  type="color"
                  value={
                    customColors?.accent || selectedPalette?.accent || "#60A5FA"
                  }
                  onChange={(e) => handleColorChange("accent", e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div
                  className="w-full h-10 border border-gray-600 cursor-pointer"
                  style={{
                    backgroundColor:
                      customColors?.accent ||
                      selectedPalette?.accent ||
                      "#60A5FA",
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {customColors?.accent || selectedPalette?.accent || "#60A5FA"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
