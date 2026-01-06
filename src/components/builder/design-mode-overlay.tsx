"use client";

/**
 * DesignModeOverlay Component
 * ===========================
 *
 * Provides visual overlay for clickable element selection in the preview.
 * Inspired by v0.app's Design Mode and browser DevTools "inspect element" feature.
 *
 * FÖRBÄTTRING (5.0):
 * - Förbättrad UI med smart kategorisering av element
 * - Kör Code Crawler vid element-klick för att hitta relevant kodkontext
 * - Visar kodkontext direkt i chatten för enklare redigering
 * - Bättre integration med Semantic Enhancer pipeline
 *
 * CROSS-ORIGIN STRATEGI:
 * - v0's demoUrl är cross-origin (vusercontent.net), så vi kan INTE direkt läsa DOM
 * - Istället erbjuder vi en smart "element picker" med vanliga element-typer
 * - Code Crawler hittar relevant kod baserat på element-beskrivningen
 * - Framtida: postMessage-integration med v0's iframe (om de stödjer det)
 */

import { useState, useCallback, useRef, useMemo } from "react";
import {
  MousePointer2,
  Crosshair,
  X,
  Target,
  Layers,
  Type,
  Square,
  Image as ImageIcon,
  Link2,
  AlignLeft,
  Grid3X3,
  Palette,
  CircleDot,
  FormInput,
  Search,
  Code2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuilderStore } from "@/lib/store";
import { quickSearch } from "@/lib/code-crawler";

interface ElementInfo {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  selector: string;
  rect: DOMRect;
}

interface DesignModeOverlayProps {
  isActive: boolean;
  onToggle: () => void;
  onElementSelect: (selector: string, description: string) => void;
  iframeSrc?: string;
  // For cross-origin fallback
  onManualSelect?: (prompt: string) => void;
}

// Map tag names to icons and descriptions
const ELEMENT_ICONS: Record<string, { icon: typeof Square; label: string }> = {
  div: { icon: Square, label: "Container" },
  section: { icon: Layers, label: "Sektion" },
  header: { icon: AlignLeft, label: "Header" },
  footer: { icon: AlignLeft, label: "Footer" },
  nav: { icon: AlignLeft, label: "Navigation" },
  button: { icon: Target, label: "Knapp" },
  a: { icon: Link2, label: "Länk" },
  img: { icon: ImageIcon, label: "Bild" },
  p: { icon: Type, label: "Text" },
  h1: { icon: Type, label: "Rubrik H1" },
  h2: { icon: Type, label: "Rubrik H2" },
  h3: { icon: Type, label: "Rubrik H3" },
  h4: { icon: Type, label: "Rubrik H4" },
  span: { icon: Type, label: "Textspan" },
  input: { icon: Square, label: "Inmatning" },
  form: { icon: Square, label: "Formulär" },
  ul: { icon: Layers, label: "Lista" },
  li: { icon: Square, label: "Listobjekt" },
};

// Kategoriserade element för smart val - organiserat som DevTools "Elements" panel
interface ElementCategory {
  id: string;
  label: string;
  icon: typeof Square;
  elements: Array<{ label: string; prompt: string; codeHints: string[] }>;
}

const ELEMENT_CATEGORIES: ElementCategory[] = [
  {
    id: "layout",
    label: "Layout & Sektioner",
    icon: Layers,
    elements: [
      {
        label: "Header/Nav",
        prompt: "headern och navigationsfältet",
        codeHints: ["header", "nav", "navbar", "navigation"],
      },
      {
        label: "Hero-sektion",
        prompt: "hero-sektionen med huvudrubrik och CTA",
        codeHints: ["hero", "banner", "landing", "main"],
      },
      {
        label: "Footer",
        prompt: "footern",
        codeHints: ["footer", "foot", "bottom"],
      },
      {
        label: "Sidebar",
        prompt: "sidofältet",
        codeHints: ["sidebar", "aside", "drawer"],
      },
      {
        label: "Container",
        prompt: "innehållscontainern",
        codeHints: ["container", "wrapper", "content"],
      },
    ],
  },
  {
    id: "content",
    label: "Innehåll & Text",
    icon: Type,
    elements: [
      {
        label: "Rubrik (H1)",
        prompt: "huvudrubriken",
        codeHints: ["h1", "heading", "title", "headline"],
      },
      {
        label: "Underrubrik",
        prompt: "underrubriken",
        codeHints: ["h2", "subheading", "subtitle"],
      },
      {
        label: "Brödtext",
        prompt: "brödtexten/paragrafen",
        codeHints: ["p", "text", "paragraph", "description"],
      },
      {
        label: "Citat",
        prompt: "citatet/blockquote",
        codeHints: ["quote", "blockquote", "testimonial"],
      },
      {
        label: "Lista",
        prompt: "listan",
        codeHints: ["ul", "ol", "list", "items"],
      },
    ],
  },
  {
    id: "interactive",
    label: "Knappar & Interaktion",
    icon: Target,
    elements: [
      {
        label: "Primär CTA",
        prompt: "den primära CTA-knappen",
        codeHints: ["button", "btn", "cta", "primary"],
      },
      {
        label: "Sekundär knapp",
        prompt: "den sekundära knappen",
        codeHints: ["button", "btn", "secondary"],
      },
      { label: "Länk", prompt: "länken", codeHints: ["a", "link", "href"] },
      {
        label: "Meny-toggle",
        prompt: "hamburgermenyn/meny-togglen",
        codeHints: ["menu", "hamburger", "toggle", "mobile"],
      },
      {
        label: "Dropdown",
        prompt: "dropdown-menyn",
        codeHints: ["dropdown", "select", "popover"],
      },
    ],
  },
  {
    id: "forms",
    label: "Formulär & Input",
    icon: FormInput,
    elements: [
      {
        label: "Kontaktformulär",
        prompt: "kontaktformuläret",
        codeHints: ["form", "contact", "input"],
      },
      {
        label: "Sökfält",
        prompt: "sökfältet",
        codeHints: ["search", "input", "query"],
      },
      {
        label: "Nyhetsbrev",
        prompt: "nyhetsbrevs-formuläret",
        codeHints: ["newsletter", "subscribe", "email"],
      },
      {
        label: "Inloggning",
        prompt: "inloggningsformuläret",
        codeHints: ["login", "signin", "auth"],
      },
      {
        label: "Textfält",
        prompt: "textfältet",
        codeHints: ["input", "field", "textarea"],
      },
    ],
  },
  {
    id: "media",
    label: "Bilder & Media",
    icon: ImageIcon,
    elements: [
      {
        label: "Logo",
        prompt: "logotypen",
        codeHints: ["logo", "brand", "img"],
      },
      {
        label: "Huvudbild",
        prompt: "huvudbilden/hero-bilden",
        codeHints: ["hero", "image", "banner", "img"],
      },
      {
        label: "Bildgalleri",
        prompt: "bildgalleriet",
        codeHints: ["gallery", "images", "carousel"],
      },
      { label: "Ikon", prompt: "ikonen", codeHints: ["icon", "svg", "lucide"] },
      {
        label: "Bakgrund",
        prompt: "bakgrundsbilden",
        codeHints: ["background", "bg", "backdrop"],
      },
    ],
  },
  {
    id: "components",
    label: "Komponenter",
    icon: Grid3X3,
    elements: [
      {
        label: "Kort/Card",
        prompt: "kortet/card-komponenten",
        codeHints: ["card", "box", "panel"],
      },
      {
        label: "Prislista",
        prompt: "prissektionen",
        codeHints: ["pricing", "price", "plan"],
      },
      {
        label: "Testimonials",
        prompt: "omdömes-sektionen",
        codeHints: ["testimonial", "review", "quote"],
      },
      {
        label: "FAQ/Accordion",
        prompt: "FAQ-sektionen",
        codeHints: ["faq", "accordion", "collapse"],
      },
      {
        label: "Feature-grid",
        prompt: "feature-griden",
        codeHints: ["feature", "grid", "benefits"],
      },
    ],
  },
  {
    id: "styling",
    label: "Styling & Färger",
    icon: Palette,
    elements: [
      {
        label: "Primärfärg",
        prompt: "den primära accentfärgen",
        codeHints: ["primary", "accent", "brand", "color"],
      },
      {
        label: "Bakgrundsfärg",
        prompt: "bakgrundsfärgen",
        codeHints: ["background", "bg", "surface"],
      },
      {
        label: "Typsnitt",
        prompt: "typsnittet/fonten",
        codeHints: ["font", "text", "typography"],
      },
      {
        label: "Skuggor",
        prompt: "skuggorna",
        codeHints: ["shadow", "elevation", "drop"],
      },
      {
        label: "Rundade hörn",
        prompt: "avrundningen/border-radius",
        codeHints: ["rounded", "radius", "corner"],
      },
    ],
  },
];

// NOTE: QUICK_SELECTORS borttagna - använder nu ELEMENT_CATEGORIES direkt

export function DesignModeOverlay({
  isActive,
  onToggle,
  onElementSelect,
  iframeSrc,
  onManualSelect,
}: DesignModeOverlayProps) {
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(
    null
  );
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(
    null
  );
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [customSelector, setCustomSelector] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Determine if we can use direct DOM access (same-origin)
  const isCrossOrigin =
    iframeSrc?.includes("v0.dev") || iframeSrc?.includes("vusercontent.net");

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return ELEMENT_CATEGORIES;

    const query = searchQuery.toLowerCase();
    return ELEMENT_CATEGORIES.map((cat) => ({
      ...cat,
      elements: cat.elements.filter(
        (el) =>
          el.label.toLowerCase().includes(query) ||
          el.prompt.toLowerCase().includes(query) ||
          el.codeHints.some((hint) => hint.toLowerCase().includes(query))
      ),
    })).filter((cat) => cat.elements.length > 0);
  }, [searchQuery]);

  // Handle element hover (for same-origin iframes)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive || isCrossOrigin) return;

      const iframe =
        document.querySelector<HTMLIFrameElement>("#preview-iframe");
      if (!iframe?.contentDocument) return;

      const rect = iframe.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const element = iframe.contentDocument.elementFromPoint(x, y);
      if (!element || element === iframe.contentDocument.body) {
        setHoveredElement(null);
        return;
      }

      const info: ElementInfo = {
        tagName: element.tagName.toLowerCase(),
        className: element.className || "",
        id: element.id || "",
        textContent: element.textContent?.slice(0, 50) || "",
        selector: buildSelector(element),
        rect: element.getBoundingClientRect(),
      };

      setHoveredElement(info);
    },
    [isActive, isCrossOrigin]
  );

  // Handle element click (for same-origin iframes)
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive || !hoveredElement) return;
      e.preventDefault();
      e.stopPropagation();

      setSelectedElement(hoveredElement);

      // Build description for the prompt
      const elementType =
        ELEMENT_ICONS[hoveredElement.tagName]?.label || hoveredElement.tagName;
      const description = hoveredElement.textContent
        ? `${elementType} med texten "${hoveredElement.textContent.slice(
            0,
            30
          )}..."`
        : `${elementType}${
            hoveredElement.className
              ? ` (.${hoveredElement.className.split(" ")[0]})`
              : ""
          }`;

      onElementSelect(hoveredElement.selector, description);
    },
    [isActive, hoveredElement, onElementSelect]
  );

  // Build CSS selector for an element
  const buildSelector = (element: Element): string => {
    if (element.id) {
      return `#${element.id}`;
    }

    const tag = element.tagName.toLowerCase();
    const classes = element.className
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";

    // Try to make it unique by adding parent context
    const parent = element.parentElement;
    if (parent && parent.tagName.toLowerCase() !== "body") {
      const parentTag = parent.tagName.toLowerCase();
      const parentClasses = parent.className
        ? `.${parent.className.trim().split(/\s+/)[0]}`
        : "";
      return `${parentTag}${parentClasses} > ${tag}${classes}`;
    }

    return `${tag}${classes}`;
  };

  // Get store actions and files
  const { files, setDesignModeCodeContext } = useBuilderStore();

  // Extract hints from element description for Code Crawler
  const extractHintsFromDescription = (description: string): string[] => {
    const hints: string[] = [];
    const lower = description.toLowerCase();

    // Common UI element mappings
    const elementMappings: Record<string, string[]> = {
      header: ["header", "nav", "navbar"],
      footer: ["footer", "foot"],
      hero: ["hero", "banner"],
      navigation: ["nav", "navbar", "menu"],
      knapp: ["button", "btn", "cta"],
      länk: ["link", "a", "href"],
      rubrik: ["heading", "h1", "h2", "h3", "title"],
      bild: ["image", "img", "picture"],
      formulär: ["form", "input", "field"],
      sektion: ["section", "container"],
      logo: ["logo", "brand"],
      cta: ["cta", "button", "action"],
      prislista: ["pricing", "price", "plan"],
      kontakt: ["contact", "form"],
    };

    // Find matching hints
    for (const [keyword, aliases] of Object.entries(elementMappings)) {
      if (lower.includes(keyword)) {
        hints.push(...aliases);
      }
    }

    // Extract quoted text
    const quotedMatches = description.match(/["']([^"']+)["']/g);
    if (quotedMatches) {
      for (const match of quotedMatches) {
        hints.push(match.replace(/["']/g, "").trim());
      }
    }

    return [...new Set(hints)].slice(0, 5);
  };

  // Handle element selection with Code Crawler - now with direct code hints
  const handleElementSelect = useCallback(
    (element: { label: string; prompt: string; codeHints?: string[] }) => {
      // Run Code Crawler to find relevant code context
      if (files && files.length > 0) {
        // Use provided codeHints if available, otherwise extract from description
        const hints =
          element.codeHints || extractHintsFromDescription(element.prompt);
        const codeContext = quickSearch(files, hints);

        if (codeContext.length > 0) {
          console.log(
            "[DesignMode] Found code context for",
            element.label,
            ":",
            codeContext.length,
            "files",
            codeContext.map((c) => c.name)
          );
          setDesignModeCodeContext(codeContext);
        } else {
          console.log("[DesignMode] No code context found for", element.label);
          setDesignModeCodeContext(null);
        }
      }

      onManualSelect?.(`Ändra ${element.prompt}`);
      setExpandedCategory(null);
      setSearchQuery("");
    },
    [files, setDesignModeCodeContext, onManualSelect]
  );

  // Handle custom selector submission with Code Crawler
  const handleCustomSubmit = () => {
    if (customSelector.trim()) {
      // Run Code Crawler to find relevant code context
      if (files && files.length > 0) {
        const hints = extractHintsFromDescription(customSelector.trim());
        const codeContext = quickSearch(files, hints);

        if (codeContext.length > 0) {
          console.log(
            "[DesignMode] Found code context for custom selector:",
            codeContext.length,
            "files"
          );
          setDesignModeCodeContext(codeContext);
        } else {
          setDesignModeCodeContext(null);
        }
      }

      onManualSelect?.(`Ändra ${customSelector.trim()}`);
      setCustomSelector("");
    }
  };

  // When not active, render nothing - the toggle button is now in ChatPanel toolbar
  if (!isActive) {
    return null;
  }

  return (
    <>
      {/* Active overlay controls */}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/30 border border-purple-500/50 rounded-lg backdrop-blur-sm">
          <Crosshair className="h-4 w-4 text-purple-400 animate-pulse" />
          <span className="text-sm font-medium text-purple-200">
            Inspect aktiv
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-8 w-8 p-0 bg-gray-800/80 border border-gray-700 hover:bg-gray-700"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Cross-origin Element Picker UI - Inspired by DevTools */}
      {isCrossOrigin && (
        <div className="absolute bottom-4 left-4 right-4 z-30 max-h-[70vh] overflow-hidden flex flex-col">
          <div className="bg-gray-900/98 border border-purple-500/30 rounded-xl backdrop-blur-sm shadow-2xl flex flex-col max-h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/80">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-200">
                  Inspect Element
                </span>
                <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                  DevTools-läge
                </span>
              </div>
              <button
                onClick={onToggle}
                className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-gray-800/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Sök element... (header, button, hero...)"
                  className="w-full pl-9 pr-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-700 text-gray-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Categories accordion */}
            <div className="flex-1 overflow-y-auto py-2 px-2">
              {filteredCategories.map((category) => (
                <div key={category.id} className="mb-1">
                  {/* Category header */}
                  <button
                    onClick={() =>
                      setExpandedCategory(
                        expandedCategory === category.id ? null : category.id
                      )
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800/60 transition-colors text-left"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-gray-500 transition-transform ${
                        expandedCategory === category.id
                          ? "rotate-0"
                          : "-rotate-90"
                      }`}
                    />
                    <category.icon className="h-4 w-4 text-purple-400/70" />
                    <span className="flex-1 text-sm text-gray-300">
                      {category.label}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {category.elements.length}
                    </span>
                  </button>

                  {/* Category elements */}
                  {(expandedCategory === category.id || searchQuery) && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {category.elements.map((element) => (
                        <button
                          key={element.label}
                          onClick={() => handleElementSelect(element)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-purple-600/20 transition-colors text-left group"
                        >
                          <CircleDot className="h-3 w-3 text-gray-600 group-hover:text-purple-400" />
                          <span className="flex-1 text-sm text-gray-400 group-hover:text-gray-200">
                            {element.label}
                          </span>
                          <span className="text-[10px] text-gray-600 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Redigera →
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {filteredCategories.length === 0 && searchQuery && (
                <div className="text-center py-6 text-gray-500 text-sm">
                  Inga element matchar &quot;{searchQuery}&quot;
                </div>
              )}
            </div>

            {/* Custom input footer */}
            <div className="px-4 py-3 border-t border-gray-800/80 bg-gray-900/50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSelector}
                  onChange={(e) => setCustomSelector(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
                  placeholder="Eller beskriv elementet fritt..."
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-purple-500"
                />
                <Button
                  onClick={handleCustomSubmit}
                  disabled={!customSelector.trim()}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4"
                >
                  Ändra
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-gray-600 text-center">
                Klicka på ett element eller beskriv vad du vill ändra
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Same-origin overlay - transparent layer for capturing clicks */}
      {!isCrossOrigin && (
        <div
          ref={overlayRef}
          className="absolute inset-0 z-20 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={() => setHoveredElement(null)}
        >
          {/* Hover highlight */}
          {hoveredElement && (
            <div
              className="absolute border-2 border-purple-500 bg-purple-500/10 pointer-events-none transition-all duration-75"
              style={{
                left: hoveredElement.rect.left,
                top: hoveredElement.rect.top,
                width: hoveredElement.rect.width,
                height: hoveredElement.rect.height,
              }}
            >
              {/* Element info tooltip */}
              <div className="absolute -top-8 left-0 px-2 py-1 bg-purple-600 text-white text-xs rounded whitespace-nowrap">
                {ELEMENT_ICONS[hoveredElement.tagName]?.label ||
                  hoveredElement.tagName}
                {hoveredElement.className &&
                  ` .${hoveredElement.className.split(" ")[0]}`}
              </div>
            </div>
          )}

          {/* Selected element highlight */}
          {selectedElement && (
            <div
              className="absolute border-2 border-teal-500 bg-teal-500/20 pointer-events-none"
              style={{
                left: selectedElement.rect.left,
                top: selectedElement.rect.top,
                width: selectedElement.rect.width,
                height: selectedElement.rect.height,
              }}
            />
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="absolute top-14 right-2 z-30 max-w-[200px]">
        <div className="px-3 py-2 bg-gray-900/90 border border-gray-700 rounded-lg text-xs text-gray-400">
          {isCrossOrigin
            ? "Välj ett element från listan eller beskriv vad du vill ändra."
            : "Klicka på ett element i preview för att välja det för redigering."}
        </div>
      </div>
    </>
  );
}

// Compact toggle button for toolbar
export function DesignModeToggle({
  isActive,
  onClick,
}: {
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
        isActive
          ? "bg-purple-600/30 border border-purple-500/50 text-purple-300"
          : "bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
      }`}
    >
      <MousePointer2
        className={`h-3.5 w-3.5 ${isActive ? "text-purple-400" : ""}`}
      />
      Design
    </button>
  );
}
