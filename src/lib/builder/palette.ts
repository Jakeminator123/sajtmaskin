export type PaletteSource = "template" | "ai-element" | "shadcn-block" | "shadcn-component";

export type PaletteSelection = {
  id: string;
  label: string;
  description?: string;
  source: PaletteSource;
  tags?: string[];
  dependencies?: string[];
};

export type PaletteState = {
  selections: PaletteSelection[];
  updatedAt?: string;
};

export type PaletteSpec = {
  selections: PaletteSelection[];
  updatedAt?: string;
};

const MAX_PALETTE_ITEMS = 16;

export const DEFAULT_PALETTE_SELECTIONS: PaletteSelection[] = [
  {
    id: "dialog",
    label: "Dialog",
    description: "Modals and confirmations.",
    source: "shadcn-component",
    tags: ["modal", "overlay"],
  },
  {
    id: "sheet",
    label: "Sheet",
    description: "Side panels and overlays.",
    source: "shadcn-component",
    tags: ["panel", "overlay"],
  },
  {
    id: "badge",
    label: "Badge",
    description: "Status markers and quick labels.",
    source: "shadcn-component",
    tags: ["label", "status"],
  },
  {
    id: "accordion",
    label: "Accordion",
    description: "Collapsible sections for FAQ and details.",
    source: "shadcn-component",
    tags: ["faq", "content"],
  },
  {
    id: "carousel",
    label: "Carousel",
    description: "Animated sliders for testimonials and galleries.",
    source: "shadcn-component",
    tags: ["slider", "animation"],
  },
  {
    id: "tooltip",
    label: "Tooltip",
    description: "Subtle hints and micro copy.",
    source: "shadcn-component",
    tags: ["help", "hint"],
  },
];

export function getDefaultPaletteState(): PaletteState {
  return {
    selections: DEFAULT_PALETTE_SELECTIONS,
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeSelection(value: unknown): PaletteSelection | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const source = typeof value.source === "string" ? value.source.trim() : "";
  if (!id || !label || !source) return null;
  if (
    source !== "template" &&
    source !== "ai-element" &&
    source !== "shadcn-block" &&
    source !== "shadcn-component"
  ) {
    return null;
  }
  const description = typeof value.description === "string" ? value.description.trim() : undefined;
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim())
    : undefined;
  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies
        .filter((dep) => typeof dep === "string" && dep.trim())
        .map((dep) => dep.trim())
    : undefined;
  return {
    id,
    label,
    description,
    source,
    tags: tags?.length ? tags : undefined,
    dependencies: dependencies?.length ? dependencies : undefined,
  };
}

export function normalizePaletteState(input?: unknown): PaletteState {
  if (!isRecord(input)) {
    return { selections: [] };
  }
  const selections = Array.isArray(input.selections)
    ? input.selections
        .map((selection) => normalizeSelection(selection))
        .filter((selection): selection is PaletteSelection => Boolean(selection))
    : [];
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim()
      ? input.updatedAt.trim()
      : undefined;
  return { selections, updatedAt };
}

export function mergePaletteSelection(
  state: PaletteState | null | undefined,
  selection: PaletteSelection,
): PaletteState {
  const base = state ? normalizePaletteState(state) : { selections: [] };
  const key = `${selection.source}:${selection.id}`;
  const existing = new Map(base.selections.map((item) => [`${item.source}:${item.id}`, item]));
  existing.set(key, selection);
  return {
    selections: Array.from(existing.values()),
    updatedAt: new Date().toISOString(),
  };
}

export function toPaletteSpec(state?: PaletteState | null): PaletteSpec | undefined {
  if (!state?.selections?.length) return undefined;
  return {
    selections: state.selections.slice(0, MAX_PALETTE_ITEMS),
    updatedAt: state.updatedAt,
  };
}

export function buildPaletteInstruction(state?: PaletteState | null): string {
  if (!state?.selections?.length) return "";
  const selections = state.selections.slice(0, MAX_PALETTE_ITEMS);
  const lines: string[] = [
    "## Component Palette",
    "- This project has a curated palette of components and patterns.",
    "- Prefer these items when appropriate and avoid introducing new UI libraries.",
    "Palette items:",
  ];
  selections.forEach((item) => {
    const tagLabel = item.tags?.length ? ` (${item.tags.slice(0, 4).join(", ")})` : "";
    lines.push(`- ${item.label} [${item.source}]${tagLabel}`);
  });
  const dependencies = Array.from(
    new Set(
      selections
        .flatMap((item) => item.dependencies ?? [])
        .map((dep) => dep.trim())
        .filter(Boolean),
    ),
  );
  if (dependencies.length > 0) {
    lines.push("");
    lines.push("Dependencies to ensure in package.json (if missing):");
    lines.push(`- ${dependencies.join(", ")}`);
  }
  return lines.join("\n");
}
