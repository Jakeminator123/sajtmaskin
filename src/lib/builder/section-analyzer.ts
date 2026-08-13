import type { ElementMapItem } from "@/lib/builder/types";

/**
 * Section Analyzer
 * ================
 *
 * Analyzes generated code to extract section information.
 * Used to provide intelligent placement options when adding new components.
 */

export interface DetectedSection {
  id: string;
  name: string;
  nameSv: string;
  type:
    | "hero"
    | "features"
    | "pricing"
    | "testimonials"
    | "cta"
    | "footer"
    | "header"
    | "content"
    | "form"
    | "gallery"
    | "faq"
    | "contact"
    | "about"
    | "team"
    | "stats"
    | "unknown";
  confidence: number; // 0-1, how confident we are this is the right type
  lineStart?: number;
  lineEnd?: number;
}

// Common section patterns to look for
const SECTION_PATTERNS: {
  type: DetectedSection["type"];
  patterns: RegExp[];
  nameSv: string;
}[] = [
  {
    type: "hero",
    patterns: [
      /hero/i,
      /banner/i,
      /jumbotron/i,
      /main.*heading/i,
      /landing.*section/i,
      /<h1[^>]*>/i,
    ],
    nameSv: "Hero",
  },
  {
    type: "header",
    patterns: [/header/i, /navbar/i, /nav-bar/i, /navigation/i, /topbar/i],
    nameSv: "Header",
  },
  {
    type: "features",
    patterns: [/features?/i, /benefits?/i, /services?/i, /capabilities/i, /what.*we.*offer/i],
    nameSv: "Features",
  },
  {
    type: "pricing",
    patterns: [/pricing/i, /plans?/i, /packages?/i, /subscription/i, /tiers?/i],
    nameSv: "Prissättning",
  },
  {
    type: "testimonials",
    patterns: [/testimonials?/i, /reviews?/i, /feedback/i, /quotes?/i, /customers?.*say/i],
    nameSv: "Omdömen",
  },
  {
    type: "cta",
    patterns: [/cta/i, /call.*to.*action/i, /get.*started/i, /sign.*up.*section/i, /ready.*to/i],
    nameSv: "Call-to-Action",
  },
  {
    type: "faq",
    patterns: [/faq/i, /frequently.*asked/i, /questions/i, /accordion/i],
    nameSv: "FAQ",
  },
  {
    type: "contact",
    patterns: [/contact/i, /get.*in.*touch/i, /reach.*us/i, /message.*us/i],
    nameSv: "Kontakt",
  },
  {
    type: "about",
    patterns: [/about/i, /who.*we.*are/i, /our.*story/i, /company/i, /mission/i],
    nameSv: "Om oss",
  },
  {
    type: "team",
    patterns: [/team/i, /staff/i, /people/i, /members/i, /employees/i],
    nameSv: "Team",
  },
  {
    type: "stats",
    patterns: [/stats/i, /statistics/i, /numbers/i, /metrics/i, /achievements/i],
    nameSv: "Statistik",
  },
  {
    type: "gallery",
    patterns: [/gallery/i, /portfolio/i, /showcase/i, /projects/i, /work/i],
    nameSv: "Galleri",
  },
  {
    type: "form",
    patterns: [/form/i, /newsletter/i, /subscribe/i, /signup.*form/i],
    nameSv: "Formulär",
  },
  {
    type: "footer",
    patterns: [/footer/i, /bottom/i],
    nameSv: "Footer",
  },
];

const SECTION_NAME_BY_TYPE = new Map(
  SECTION_PATTERNS.map((pattern) => [pattern.type, pattern.nameSv]),
);

export type SectionZone = {
  id: string;
  label: string;
  type: DetectedSection["type"];
  top: number;
  bottom: number;
  height: number;
};

export type InsertionPoint = {
  placement: string;
  label: string;
  lineYPercent: number;
  anchorSection?: {
    id: string;
    label: string;
    type: string;
    top: number;
    bottom: number;
  };
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function inferSectionTypeFromElement(element: ElementMapItem): DetectedSection["type"] {
  const haystack = [
    element.tag,
    element.id || "",
    element.className || "",
    element.selector || "",
    element.text || "",
  ]
    .join(" ")
    .toLowerCase();

  if (/(^|\s)(header|navbar|navigation|topbar|nav)(\s|$)/.test(haystack)) return "header";
  if (/(^|\s)(hero|banner|jumbotron|landing)(\s|$)/.test(haystack)) return "hero";
  if (/(^|\s)(feature|benefit|service|capabilit)(\s|$)/.test(haystack)) return "features";
  if (/(^|\s)(pricing|price|plan|tier|subscription)(\s|$)/.test(haystack)) return "pricing";
  if (/(^|\s)(testimonial|review|feedback|quote)(\s|$)/.test(haystack)) return "testimonials";
  if (/(^|\s)(cta|call.?to.?action|get.?started|ready.?to)(\s|$)/.test(haystack)) return "cta";
  if (/(^|\s)(faq|accordion|question)(\s|$)/.test(haystack)) return "faq";
  if (/(^|\s)(contact|get.?in.?touch|reach.?us)(\s|$)/.test(haystack)) return "contact";
  if (/(^|\s)(about|mission|story|company)(\s|$)/.test(haystack)) return "about";
  if (/(^|\s)(team|member|staff|employee)(\s|$)/.test(haystack)) return "team";
  if (/(^|\s)(stat|metric|number|achievement)(\s|$)/.test(haystack)) return "stats";
  if (/(^|\s)(gallery|portfolio|showcase|project)(\s|$)/.test(haystack)) return "gallery";
  if (/(^|\s)(form|newsletter|subscribe|signup)(\s|$)/.test(haystack)) return "form";
  if (element.tag.toLowerCase() === "footer" || /(^|\s)(footer|copyright)(\s|$)/.test(haystack))
    return "footer";
  return "content";
}

/**
 * Analyze code to detect sections
 */
export function analyzeSections(code: string): DetectedSection[] {
  const sections: DetectedSection[] = [];

  // Track what we've found to avoid duplicates
  const foundTypes = new Set<string>();

  // Look for section/div elements with identifiable names
  const sectionRegex =
    /<(?:section|div|main|article)[^>]*(?:className|id|aria-label)=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = sectionRegex.exec(code)) !== null) {
    const attributes = match[1];
    const lineNumber = code.substring(0, match.index).split("\n").length;

    // Try to identify section type
    for (const pattern of SECTION_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(attributes) && !foundTypes.has(pattern.type)) {
          foundTypes.add(pattern.type);
          sections.push({
            id: `section-${pattern.type}`,
            name: pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1),
            nameSv: pattern.nameSv,
            type: pattern.type,
            confidence: 0.8,
            lineStart: lineNumber,
          });
          break;
        }
      }
    }
  }

  // Also look for component names in JSX
  const componentRegex =
    /<([A-Z][a-zA-Z]+(?:Section|Block|Hero|Footer|Header|Nav|Features?|Pricing|Testimonials?|CTA|FAQ|Contact|About|Team|Stats|Gallery|Form)?)[^>]*>/g;

  while ((match = componentRegex.exec(code)) !== null) {
    const componentName = match[1];
    const lineNumber = code.substring(0, match.index).split("\n").length;

    for (const pattern of SECTION_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(componentName) && !foundTypes.has(pattern.type)) {
          foundTypes.add(pattern.type);
          sections.push({
            id: `component-${pattern.type}`,
            name: componentName,
            nameSv: pattern.nameSv,
            type: pattern.type,
            confidence: 0.9,
            lineStart: lineNumber,
          });
          break;
        }
      }
    }
  }

  // Sort by line number
  sections.sort((a, b) => (a.lineStart || 0) - (b.lineStart || 0));

  return sections;
}

/**
 * Approximate viewport bands from homepage source when live inspect/bridge
 * zones are missing. Order follows `analyzeSections` (line order). Bands are
 * proportional to `lineStart` when available so taller early sections get more
 * vertical room than a flat even split — still approximate vs rendered geometry.
 */
export function sectionZonesFromCode(code: string): SectionZone[] {
  const sections = analyzeSections(code);
  if (sections.length === 0) return [];

  const usable = sections.slice(0, 10);
  const totalLines = Math.max(
    code.split("\n").length,
    ...usable.map((section) => section.lineStart ?? 1),
    1,
  );

  return usable.map((section, index) => {
    const line = Math.max(1, section.lineStart ?? index + 1);
    const nextLine =
      index + 1 < usable.length
        ? Math.max(line + 1, usable[index + 1]?.lineStart ?? totalLines)
        : totalLines;
    const top = clampPercent((line / totalLines) * 92);
    const bottom = clampPercent(Math.max(top + 6, (nextLine / totalLines) * 92));
    return {
      id: `code-${section.id}`,
      label: section.nameSv,
      type: section.type,
      top,
      bottom,
      height: Math.max(0, bottom - top),
    } satisfies SectionZone;
  });
}

/**
 * Convert a placement value to a prompt instruction
 */
export function placementToInstruction(placement: string, sections: DetectedSection[]): string {
  if (placement === "top") {
    return "Add it as a NEW SECTION at the VERY TOP of the homepage, BEFORE all existing content including any hero section.";
  }

  if (placement === "bottom") {
    return "Add it as a NEW SECTION at the very END of the page, after all other content.";
  }

  // Handle "after-X" patterns
  if (placement.startsWith("after-")) {
    const sectionType = placement.replace("after-", "");
    const section = sections.find((s) => s.type === sectionType);

    if (section) {
      return `Add it as a NEW SECTION IMMEDIATELY AFTER the ${section.name} section. Look for the ${section.nameSv} section and place this component directly after it.`;
    }

    // Fallback for unknown sections
    return `Add it as a NEW SECTION after the ${sectionType} section.`;
  }

  // Default fallback
  return "Add it as a new section on the homepage below existing content.";
}

/**
 * Untrusted sektionskandidat från inspect-bridge (postMessage).
 * `extractSectionZonesFromBridge` normaliserar och kör samma zon-pipeline
 * som Playwright-elementkartan.
 */
export type BridgeSectionCandidate = {
  tag?: string;
  id?: string | null;
  className?: string | null;
  text?: string | null;
  selector?: string | null;
  vpPercent?: { x?: number; y?: number; w?: number; h?: number };
  rect?: { x?: number; y?: number; width?: number; height?: number };
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Bridge `collectSections`-regel: barn vars topp/botten ligger inom 1 % av
 * viewport-höjden från förälderns räknas som wrapper-dubblett och ska inte
 * äta sektionstaket. Speglas i inspect-bridge-script.ts (`isNearIdenticalParent`).
 */
export function isNearIdenticalParentSectionRect(
  child: { top: number; bottom: number },
  parent: { top: number; bottom: number },
  viewportHeightPx: number,
): boolean {
  if (!(viewportHeightPx > 0)) return false;
  if (
    ![child.top, child.bottom, parent.top, parent.bottom].every((n) =>
      Number.isFinite(n),
    )
  ) {
    return false;
  }
  const threshold = viewportHeightPx * 0.01;
  return (
    Math.abs(child.top - parent.top) < threshold &&
    Math.abs(child.bottom - parent.bottom) < threshold
  );
}

/**
 * Bridge-payload → ElementMapItem[] så `extractSectionZones` kan återanvändas.
 * Ogiltiga rader (saknar tag/vpPercent) hoppas över.
 */
export function bridgeSectionCandidatesToElementMap(
  candidates: BridgeSectionCandidate[] | null | undefined,
): ElementMapItem[] {
  if (!Array.isArray(candidates)) return [];
  const out: ElementMapItem[] = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const tag = typeof raw.tag === "string" ? raw.tag.trim() : "";
    if (!tag) continue;
    const vp = raw.vpPercent;
    if (!vp || typeof vp !== "object") continue;
    const x = finiteOr(vp.x, NaN);
    const y = finiteOr(vp.y, NaN);
    const w = finiteOr(vp.w, NaN);
    const h = finiteOr(vp.h, NaN);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    const rect = raw.rect && typeof raw.rect === "object" ? raw.rect : null;
    out.push({
      tag,
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : null,
      className:
        typeof raw.className === "string" && raw.className.trim() ? raw.className : null,
      text: typeof raw.text === "string" && raw.text.trim() ? raw.text : null,
      selector:
        typeof raw.selector === "string" && raw.selector.trim()
          ? raw.selector
          : tag,
      rect: {
        x: Math.round(finiteOr(rect?.x, 0)),
        y: Math.round(finiteOr(rect?.y, 0)),
        width: Math.round(finiteOr(rect?.width, 0)),
        height: Math.round(finiteOr(rect?.height, 0)),
      },
      vpPercent: {
        x: clampPercent(x),
        y: clampPercent(y),
        w: clampPercent(w),
        h: clampPercent(h),
      },
    });
  }
  return out;
}

/** Bridge-payload → SectionZone[] via samma extract/merge som elementkartan. */
export function extractSectionZonesFromBridge(
  candidates: BridgeSectionCandidate[] | null | undefined,
): SectionZone[] {
  return extractSectionZones(bridgeSectionCandidatesToElementMap(candidates));
}

/**
 * Build coarse top-level zones from inspector element maps.
 * These zones are used for visual insertion lines in the preview overlay.
 */
export function extractSectionZones(elementMap: ElementMapItem[]): SectionZone[] {
  const candidateTags = new Set(["section", "main", "header", "footer", "article", "div"]);
  const candidates = elementMap
    .filter((element) => {
      const tag = element.tag?.toLowerCase?.() || "";
      if (!candidateTags.has(tag)) return false;
      const width = clampPercent(element.vpPercent.w);
      const height = clampPercent(element.vpPercent.h);
      return width >= 45 && height >= 8;
    })
    .map((element, index) => {
      const type = inferSectionTypeFromElement(element);
      const label = SECTION_NAME_BY_TYPE.get(type) || "Innehåll";
      const top = clampPercent(element.vpPercent.y);
      const bottom = clampPercent(element.vpPercent.y + element.vpPercent.h);
      return {
        id: `zone-${index}-${type}`,
        type,
        label,
        top,
        bottom,
        height: Math.max(0, bottom - top),
      } satisfies SectionZone;
    })
    .filter((zone) => zone.height >= 6)
    .sort((a, b) => a.top - b.top || b.height - a.height);

  if (candidates.length === 0) return [];

  const merged: SectionZone[] = [];
  for (const candidate of candidates) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(candidate);
      continue;
    }

    const overlaps = candidate.top <= last.bottom - 3;
    const veryClose = Math.abs(candidate.top - last.top) <= 2;
    if (overlaps || veryClose) {
      const nextTop = Math.min(last.top, candidate.top);
      const nextBottom = Math.max(last.bottom, candidate.bottom);
      const shouldReplaceIdentity =
        candidate.height > last.height || (last.type === "content" && candidate.type !== "content");
      merged[merged.length - 1] = {
        id: shouldReplaceIdentity ? candidate.id : last.id,
        type: shouldReplaceIdentity ? candidate.type : last.type,
        label: shouldReplaceIdentity ? candidate.label : last.label,
        top: nextTop,
        bottom: nextBottom,
        height: Math.max(0, nextBottom - nextTop),
      };
      continue;
    }
    merged.push(candidate);
  }

  return merged.slice(0, 10);
}

/**
 * Resolve nearest insertion line based on viewport y-position.
 * Returns a placement value compatible with prompt builders.
 */
export function nearestInsertionPoint(yPercent: number, zones: SectionZone[]): InsertionPoint {
  const y = clampPercent(yPercent);

  if (zones.length === 0) {
    if (y <= 50) {
      return { placement: "top", label: "Längst upp", lineYPercent: 0 };
    }
    return { placement: "bottom", label: "Längst ner", lineYPercent: 100 };
  }

  const points: InsertionPoint[] = [
    { placement: "top", label: "Längst upp", lineYPercent: 0 },
    ...zones.map((zone) => {
      const typeForPlacement = zone.type === "unknown" ? "content" : zone.type;
      return {
        placement: `after-${typeForPlacement}`,
        label: `Efter ${zone.label}`,
        lineYPercent: clampPercent(zone.bottom),
        anchorSection: {
          id: zone.id,
          label: zone.label,
          type: zone.type,
          top: zone.top,
          bottom: zone.bottom,
        },
      } satisfies InsertionPoint;
    }),
    { placement: "bottom", label: "Längst ner", lineYPercent: 100 },
  ];

  let best = points[0];
  let bestDistance = Math.abs(y - best.lineYPercent);
  for (let i = 1; i < points.length; i += 1) {
    const candidate = points[i];
    const distance = Math.abs(y - candidate.lineYPercent);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Value-compare two insertion points. `nearestInsertionPoint` allocates a fresh
 * object per call, so consumers that store the result in React state need this
 * to avoid re-rendering on every pointer/drag event that resolves to the same
 * line.
 */
export function isSameInsertionPoint(
  a: InsertionPoint | null,
  b: InsertionPoint | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.placement === b.placement &&
    a.label === b.label &&
    a.lineYPercent === b.lineYPercent &&
    (a.anchorSection?.id ?? null) === (b.anchorSection?.id ?? null)
  );
}
