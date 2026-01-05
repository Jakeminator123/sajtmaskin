"use client";

/**
 * DesignModeOverlay Component
 * ===========================
 *
 * Provides visual overlay for clickable element selection in the preview.
 * Inspired by v0.app's Design Mode feature.
 *
 * LIMITATIONS:
 * - v0's demoUrl is cross-origin, so we can't directly access its DOM
 * - This works only with Sandpack preview (same-origin iframe)
 * - For v0 demoUrl, we provide a manual selector input as fallback
 */

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

// Common element patterns for quick selection (cross-origin fallback)
const QUICK_SELECTORS = [
  { label: "Header", prompt: "headern / navigationsfältet" },
  { label: "Hero", prompt: "hero-sektionen" },
  { label: "CTA-knapp", prompt: "den primära CTA-knappen" },
  { label: "Footer", prompt: "footern" },
  { label: "Logo", prompt: "logotypen" },
  { label: "Rubriken", prompt: "huvudrubriken (h1)" },
  { label: "Underrubrik", prompt: "underrubriken" },
  { label: "Kontaktformulär", prompt: "kontaktformuläret" },
  { label: "Bildgalleri", prompt: "bildgalleriet" },
  { label: "Prislista", prompt: "prissektionen" },
];

export function DesignModeOverlay({
  isActive,
  onToggle,
  onElementSelect,
  iframeSrc,
  onManualSelect,
}: DesignModeOverlayProps) {
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [customSelector, setCustomSelector] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Determine if we can use direct DOM access (same-origin)
  const isCrossOrigin = iframeSrc?.includes("v0.dev") || iframeSrc?.includes("vusercontent.net");

  // Handle element hover (for same-origin iframes)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive || isCrossOrigin) return;

      const iframe = document.querySelector<HTMLIFrameElement>("#preview-iframe");
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
      const elementType = ELEMENT_ICONS[hoveredElement.tagName]?.label || hoveredElement.tagName;
      const description = hoveredElement.textContent
        ? `${elementType} med texten "${hoveredElement.textContent.slice(0, 30)}..."`
        : `${elementType}${hoveredElement.className ? ` (.${hoveredElement.className.split(" ")[0]})` : ""}`;

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

  // Handle quick selector selection
  const handleQuickSelect = (prompt: string) => {
    onManualSelect?.(`Ändra ${prompt}`);
    setShowQuickPicker(false);
  };

  // Handle custom selector submission
  const handleCustomSubmit = () => {
    if (customSelector.trim()) {
      onManualSelect?.(`Ändra ${customSelector.trim()}`);
      setCustomSelector("");
    }
  };

  if (!isActive) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="absolute top-2 right-2 z-20 gap-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 hover:text-purple-200"
      >
        <MousePointer2 className="h-4 w-4" />
        Design Mode
      </Button>
    );
  }

  return (
    <>
      {/* Active overlay controls */}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/30 border border-purple-500/50 rounded-lg backdrop-blur-sm">
          <Crosshair className="h-4 w-4 text-purple-400 animate-pulse" />
          <span className="text-sm font-medium text-purple-200">
            Design Mode aktiv
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

      {/* Cross-origin fallback UI */}
      {isCrossOrigin && (
        <div className="absolute bottom-4 left-4 right-4 z-30">
          <div className="bg-gray-900/95 border border-purple-500/30 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-200">
                Välj element att redigera
              </span>
            </div>

            {/* Quick selectors */}
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_SELECTORS.slice(0, 6).map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleQuickSelect(item.prompt)}
                  className="px-3 py-1.5 text-xs bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-300 hover:bg-purple-600/30 hover:text-purple-200 transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => setShowQuickPicker(!showQuickPicker)}
                className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors"
              >
                Fler...
              </button>
            </div>

            {/* More quick selectors dropdown */}
            {showQuickPicker && (
              <div className="flex flex-wrap gap-2 mb-3 p-2 bg-gray-800/50 rounded-lg">
                {QUICK_SELECTORS.slice(6).map((item) => (
                  <button
                    key={item.label}
                    onClick={() => handleQuickSelect(item.prompt)}
                    className="px-3 py-1.5 text-xs bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-300 hover:bg-purple-600/30 hover:text-purple-200 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom selector input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customSelector}
                onChange={(e) => setCustomSelector(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
                placeholder="Beskriv elementet du vill ändra..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-purple-500"
              />
              <Button
                onClick={handleCustomSubmit}
                disabled={!customSelector.trim()}
                className="bg-purple-600 hover:bg-purple-500 text-white"
              >
                Välj
              </Button>
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
                {ELEMENT_ICONS[hoveredElement.tagName]?.label || hoveredElement.tagName}
                {hoveredElement.className && ` .${hoveredElement.className.split(" ")[0]}`}
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
      <MousePointer2 className={`h-3.5 w-3.5 ${isActive ? "text-purple-400" : ""}`} />
      Design
    </button>
  );
}

