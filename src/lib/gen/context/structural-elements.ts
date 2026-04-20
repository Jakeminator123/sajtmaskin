import type { CodeFile } from "../parser";

/**
 * Identifies high-value UI elements in JSX/TSX source code.
 * Used by merge guards to detect accidental element loss during follow-ups,
 * and by file-context-builder to give the LLM a structural inventory of
 * files it cannot see in full.
 */

export interface StructuralElement {
  /** e.g. "video", "canvas", "iframe", "form", "map", "svg-block" */
  kind: string;
  /** Human-readable label for prompt injection */
  label: string;
}

export interface FileStructuralInventory {
  path: string;
  elements: StructuralElement[];
}

export interface DroppedElementWarning {
  file: string;
  droppedElements: StructuralElement[];
  /** All elements that existed in the previous version */
  previousElements: StructuralElement[];
}

const JSX_MEDIA_ELEMENTS: ReadonlyArray<{
  pattern: RegExp;
  kind: string;
  label: string;
}> = [
  { pattern: /<video[\s>]/i, kind: "video", label: "<video> element" },
  { pattern: /<iframe[\s>]/i, kind: "iframe", label: "<iframe> embed" },
  { pattern: /<canvas[\s>]/i, kind: "canvas", label: "<canvas> element" },
  { pattern: /<audio[\s>]/i, kind: "audio", label: "<audio> element" },
  { pattern: /<map[\s>]/i, kind: "map", label: "<map> element" },
  { pattern: /<object[\s>]/i, kind: "object", label: "<object> embed" },
  { pattern: /<embed[\s>]/i, kind: "embed", label: "<embed> element" },
];

const JSX_INTERACTIVE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  kind: string;
  label: string;
}> = [
  { pattern: /<form[\s>]/i, kind: "form", label: "form" },
  { pattern: /<Canvas[\s>]/, kind: "r3f-canvas", label: "React Three Fiber <Canvas>" },
  { pattern: /<Physics[\s>]/, kind: "rapier-physics", label: "Rapier <Physics>" },
];

const SECTION_LANDMARK_RE =
  /(?:className|class)=["'][^"']*?\b(hero|about|contact|gallery|pricing|testimonial|team|faq|feature|service|portfolio|cta|footer|header|banner|showcase|menu|reservation|booking|video|media|player)\b/gi;

const COMPONENT_MEDIA_RE =
  /(?:<(?:VideoPlayer|VideoSection|VideoEmbed|VideoPlaceholder|MediaPlayer|HeroVideo|VideoHero|PlayerOverlay|PlayButton)[\s>])/;

const SVG_BLOCK_RE = /<svg[\s>][\s\S]{200,}?<\/svg>/i;

const PLAY_BUTTON_RE =
  /(?:play|Play|▶|⏵|playback|play_circle|play-button|PlayCircle|PlayIcon)\b/;

export function extractStructuralElements(content: string): StructuralElement[] {
  const found: StructuralElement[] = [];
  const seen = new Set<string>();

  const add = (kind: string, label: string) => {
    if (seen.has(kind)) return;
    seen.add(kind);
    found.push({ kind, label });
  };

  for (const { pattern, kind, label } of JSX_MEDIA_ELEMENTS) {
    if (pattern.test(content)) add(kind, label);
  }

  for (const { pattern, kind, label } of JSX_INTERACTIVE_PATTERNS) {
    if (pattern.test(content)) add(kind, label);
  }

  if (COMPONENT_MEDIA_RE.test(content)) {
    add("video-component", "video/media component");
  }

  if (SVG_BLOCK_RE.test(content)) {
    add("svg-block", "inline SVG illustration");
  }

  if (
    !seen.has("video") &&
    !seen.has("video-component") &&
    PLAY_BUTTON_RE.test(content)
  ) {
    add("play-button-ui", "play button / video placeholder UI");
  }

  const sectionMatches = new Set<string>();
  for (const m of content.matchAll(SECTION_LANDMARK_RE)) {
    sectionMatches.add(m[1].toLowerCase());
  }
  for (const section of sectionMatches) {
    add(`section-${section}`, `"${section}" section`);
  }

  return found;
}

export function buildFileStructuralInventory(
  files: CodeFile[],
): FileStructuralInventory[] {
  const result: FileStructuralInventory[] = [];
  for (const file of files) {
    if (!file.path.match(/\.(tsx|jsx|ts|js|css)$/)) continue;
    const elements = extractStructuralElements(file.content);
    if (elements.length > 0) {
      result.push({ path: file.path, elements });
    }
  }
  return result;
}

/**
 * Compares structural elements between previous and new file versions.
 * Returns warnings for elements that existed before but are missing now.
 */
export function detectDroppedElements(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
): DroppedElementWarning[] {
  const newByPath = new Map(newFiles.map((f) => [f.path, f]));
  const warnings: DroppedElementWarning[] = [];

  for (const prev of previousFiles) {
    const next = newByPath.get(prev.path);
    if (!next) continue;

    const prevElements = extractStructuralElements(prev.content);
    if (prevElements.length === 0) continue;

    const nextElements = extractStructuralElements(next.content);
    const nextKinds = new Set(nextElements.map((e) => e.kind));

    const dropped = prevElements.filter((e) => !nextKinds.has(e.kind));
    if (dropped.length > 0) {
      warnings.push({
        file: prev.path,
        droppedElements: dropped,
        previousElements: prevElements,
      });
    }
  }

  return warnings;
}

/**
 * Renders a compact structural inventory for injection into the follow-up
 * editing prompt. Only includes files with notable elements beyond basic
 * JSX sections.
 */
export function renderStructuralInventoryForPrompt(
  inventories: FileStructuralInventory[],
): string {
  if (inventories.length === 0) return "";

  const lines = [
    "## Structural Element Inventory (preserve unless explicitly asked to remove)",
    "",
    "The current project contains these notable UI elements. If you emit a file that previously contained any of these elements, you MUST keep them unless the user explicitly asked to remove them.",
    "",
  ];

  for (const inv of inventories) {
    const labels = inv.elements.map((e) => e.label).join(", ");
    lines.push(`- **${inv.path}**: ${labels}`);
  }

  return lines.join("\n");
}
