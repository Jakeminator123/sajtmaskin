import type { InspectCapturedElement } from "@/lib/builder/inspect-events";

/**
 * Marker that ChatInterface appends when the user marked preview focus points.
 * Shared so route planning can strip this appendix (focus text must not drive
 * keyword route inference) while follow-up intent can still detect it.
 */
export const FOCUS_POINT_MARKER = "Användarens markerade fokuspunkter i preview:";

export type FocusPointPromptInput = {
  demoUrl: string;
  capturedUrl?: string;
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  filename?: string;
  pointSummary?: string;
  element?: InspectCapturedElement;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  source?: "worker" | "local";
};

/** Strip the client-appended focus-point appendix; keep free-form user text. */
export function stripFocusPointAppendix(message: string): string {
  if (!message) return message;
  const idx = message.indexOf(FOCUS_POINT_MARKER);
  if (idx < 0) return message;
  return message.slice(0, idx).trimEnd();
}

export function buildInspectPointsPrompt(points: FocusPointPromptInput[]): string {
  if (!points.length) return "";
  const sourceUrls = Array.from(new Set(points.map((point) => point.demoUrl).filter(Boolean)));
  const lines = points.map((point, index) => {
    const imagePart = point.filename ? `, bildfil: ${point.filename}` : "";
    const base = `- Punkt ${index + 1}: x=${point.xPercent.toFixed(1)}%, y=${point.yPercent.toFixed(1)}%, viewport=${Math.round(point.viewportWidth)}x${Math.round(point.viewportHeight)}${imagePart}`;
    const extras: string[] = [];
    if (point.pointSummary) extras.push(`  - Sammanfattning: ${point.pointSummary}`);
    if (point.capturedUrl && point.capturedUrl !== point.demoUrl) {
      extras.push(`  - Slutlig capture-URL: ${point.capturedUrl}`);
    }
    if (point.element) {
      const elementParts = [
        point.element.tag ? `<${point.element.tag}>` : null,
        point.element.id ? `#${point.element.id}` : null,
        point.element.className
          ? `.${point.element.className.split(/\s+/).slice(0, 3).join(".")}`
          : null,
      ].filter(Boolean);
      if (elementParts.length > 0) {
        extras.push(`  - DOM-träff: ${elementParts.join(" ")}`);
      }
      if (point.element.selector) extras.push(`  - CSS-selector: ${point.element.selector}`);
      if (point.element.nearestHeading) {
        extras.push(`  - Närmaste rubrik: ${point.element.nearestHeading}`);
      }
      if (point.element.text) extras.push(`  - Träff-text: ${point.element.text}`);
      if (point.element.ariaLabel) extras.push(`  - Aria-label: ${point.element.ariaLabel}`);
      if (point.element.href) extras.push(`  - href: ${point.element.href}`);
      if (point.element.sourcePath) {
        const linePart =
          typeof point.element.sourceLine === "number"
            ? `:${point.element.sourceLine}`
            : "";
        extras.push(`  - Källfil: ${point.element.sourcePath}${linePart}`);
      }
    }
    if (point.clip) {
      extras.push(
        `  - Bildutsnitt: x=${point.clip.x}, y=${point.clip.y}, w=${point.clip.width}, h=${point.clip.height}`,
      );
    }
    if (point.source) {
      extras.push(`  - Capture-källa: ${point.source}`);
    }
    return [base, ...extras].join("\n");
  });
  const sourcePart = sourceUrls.length ? `\nKälla: ${sourceUrls.join(" | ")}` : "";
  return `${FOCUS_POINT_MARKER}${sourcePart}\n${lines.join("\n")}\nPrioritera ändringar nära dessa punkter. Om informationen krockar med resten av sidan, utgå från punktens DOM-träff/selector/källfil före antaganden. Markerad länktext identifierar vilken länk som ska redigeras — inte vilket sidnamn/route som ska skapas.`;
}
