import { AI_ELEMENT_CATEGORIES, AI_ELEMENT_ITEMS } from "./ai-elements-catalog";
import { CURATED_UI_COLLECTIONS, FEATURED_BLOCKS } from "../shadcn-registry-service";

export type RuntimeLibraryFamilyId =
  | "headers"
  | "footers"
  | "modals"
  | "badges"
  | "animation"
  | "ai"
  | "three";

export type RuntimeLibraryFamilyDefinition = {
  id: RuntimeLibraryFamilyId;
  label: string;
  description: string;
  uiCollectionIds: string[];
  aiElementIds: string[];
  localUiNames: string[];
  dependencyNames: string[];
};

export const RUNTIME_LIBRARY_MINIMUMS = {
  localUiComponents: 55,
  aiElements: 40,
  curatedUiCollections: 10,
  featuredBlockGroups: 10,
} as const;

export const RUNTIME_LIBRARY_FAMILIES: RuntimeLibraryFamilyDefinition[] = [
  {
    id: "headers",
    label: "Headers & Navigation",
    description: "Topbars, nav shells, quick actions and strong header building blocks.",
    uiCollectionIds: ["headers-navigation-components"],
    aiElementIds: ["assistant-dock", "header-command-bar"],
    localUiNames: ["navigation-menu", "menubar", "breadcrumb", "dropdown-menu", "sheet", "sidebar"],
    dependencyNames: [],
  },
  {
    id: "footers",
    label: "Footers & Metadata",
    description: "Footers, CTA endings, metadata rows and trust-note surfaces.",
    uiCollectionIds: ["footers-metadata-components"],
    aiElementIds: ["footer-link-cloud"],
    localUiNames: ["separator", "badge", "card", "accordion", "button-group"],
    dependencyNames: [],
  },
  {
    id: "modals",
    label: "Modals & Overlays",
    description: "Dialogs, sheets, drawers and contextual overlays for focused flows.",
    uiCollectionIds: ["modals-overlays-components"],
    aiElementIds: ["modal-stack", "approval-drawer"],
    localUiNames: ["dialog", "alert-dialog", "drawer", "sheet", "popover", "hover-card", "tooltip"],
    dependencyNames: [],
  },
  {
    id: "badges",
    label: "Badges & Status",
    description: "Badges, pills, alerts, progress and compact status indicators.",
    uiCollectionIds: ["badges-status-components"],
    aiElementIds: ["badge-cluster", "metric-strip"],
    localUiNames: ["badge", "alert", "progress", "skeleton", "spinner", "sonner"],
    dependencyNames: [],
  },
  {
    id: "animation",
    label: "Animation & Motion",
    description: "Motion-heavy sections, reveal patterns and polished interaction surfaces.",
    uiCollectionIds: ["motion-interaction-components"],
    aiElementIds: ["spotlight-hero", "animation-showcase", "metric-strip"],
    localUiNames: ["carousel", "accordion", "collapsible", "progress", "hover-card", "tabs"],
    dependencyNames: ["framer-motion"],
  },
  {
    id: "ai",
    label: "AI Surfaces",
    description: "Chat, tools, orchestration panels, previews and agent-friendly UI.",
    uiCollectionIds: [],
    aiElementIds: [
      "conversation",
      "message",
      "prompt-input",
      "reasoning",
      "chain-of-thought",
      "tool",
      "task",
      "agent-timeline",
      "agent-graph",
      "deploy-console",
    ],
    localUiNames: [],
    dependencyNames: ["ai"],
  },
  {
    id: "three",
    label: "3D & Spatial UI",
    description: "Three.js-ready surfaces for immersive hero sections and spatial storytelling.",
    uiCollectionIds: [],
    aiElementIds: ["three-scene"],
    localUiNames: [],
    dependencyNames: ["three", "@react-three/fiber", "@react-three/drei"],
  },
];

export type RuntimeLibrarySnapshot = {
  counts: {
    localUiComponents: number;
    aiElements: number;
    curatedUiCollections: number;
    featuredBlockGroups: number;
    featuredBlockItems: number;
  };
  aiCategoryBreakdown: Array<{ id: string; label: string; count: number }>;
  familyCoverage: Array<{
    id: RuntimeLibraryFamilyId;
    label: string;
    description: string;
    satisfied: boolean;
    uiCollections: string[];
    aiElements: string[];
    localUiMatches: string[];
    dependenciesPresent: string[];
    missingDependencies: string[];
  }>;
  notableGaps: string[];
};

export function createRuntimeLibrarySnapshot(params: {
  localUiComponentNames: string[];
  dependencyNames: string[];
}): RuntimeLibrarySnapshot {
  const localUiSet = new Set(params.localUiComponentNames);
  const dependencySet = new Set(params.dependencyNames);

  const counts = {
    localUiComponents: params.localUiComponentNames.length,
    aiElements: AI_ELEMENT_ITEMS.length,
    curatedUiCollections: CURATED_UI_COLLECTIONS.length,
    featuredBlockGroups: FEATURED_BLOCKS.length,
    featuredBlockItems: FEATURED_BLOCKS.reduce((sum, group) => sum + group.blocks.length, 0),
  };

  const aiCategoryBreakdown = AI_ELEMENT_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    count: AI_ELEMENT_ITEMS.filter((item) => item.category === category.id).length,
  }));

  const familyCoverage = RUNTIME_LIBRARY_FAMILIES.map((family) => {
    const uiCollections = CURATED_UI_COLLECTIONS.filter((collection) =>
      family.uiCollectionIds.includes(collection.id),
    ).map((collection) => collection.titleSv);
    const aiElements = AI_ELEMENT_ITEMS.filter((item) =>
      family.aiElementIds.includes(item.id),
    ).map((item) => item.label);
    const localUiMatches = family.localUiNames.filter((name) => localUiSet.has(name));
    const dependenciesPresent = family.dependencyNames.filter((name) => dependencySet.has(name));
    const missingDependencies = family.dependencyNames.filter((name) => !dependencySet.has(name));
    const hasUiCollections = family.uiCollectionIds.length === 0 || uiCollections.length > 0;
    const hasAiElements = family.aiElementIds.length === 0 || aiElements.length > 0;
    const hasLocalUi = family.localUiNames.length === 0 || localUiMatches.length > 0;
    const hasDependencies =
      family.dependencyNames.length === 0 || missingDependencies.length === 0;

    return {
      id: family.id,
      label: family.label,
      description: family.description,
      satisfied: hasUiCollections && hasAiElements && hasLocalUi && hasDependencies,
      uiCollections,
      aiElements,
      localUiMatches,
      dependenciesPresent,
      missingDependencies,
    };
  });

  const notableGaps = familyCoverage
    .filter((family) => !family.satisfied)
    .map((family) => {
      const missingParts: string[] = [];
      if (family.uiCollections.length === 0 && family.id !== "ai" && family.id !== "three") {
        missingParts.push("ui collections");
      }
      if (family.aiElements.length === 0) {
        missingParts.push("ai elements");
      }
      if (family.localUiMatches.length === 0 && family.id !== "ai" && family.id !== "three") {
        missingParts.push("local ui matches");
      }
      if (family.missingDependencies.length > 0) {
        missingParts.push(`dependencies: ${family.missingDependencies.join(", ")}`);
      }
      return `${family.label}: missing ${missingParts.join("; ")}`;
    });

  return {
    counts,
    aiCategoryBreakdown,
    familyCoverage,
    notableGaps,
  };
}
