import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import type { DetectedSection } from "@/lib/builder/sectionAnalyzer";
import type { PlacementOption } from "@/lib/builder/placement-utils";
import { getPlacementLabel } from "@/lib/builder/placement-utils";
import {
  AI_ELEMENTS_COMPONENT_TARGET,
  buildAiElementPrompt,
  type AiElementCatalogItem,
} from "@/lib/builder/ai-elements-catalog";
import {
  buildShadcnBlockPrompt,
  buildShadcnComponentPrompt,
} from "@/lib/shadcn-registry-utils";
import { buildApprovedPlanExecutionPrompt } from "@/lib/gen/plan-review";

export type PromptSourceKind =
  | "inline"
  | "shadcn-block"
  | "shadcn-component"
  | "ai-element"
  | "approved-plan";

export type PromptSourceMeta = {
  sourceKind: PromptSourceKind;
  isTechnical: boolean;
  preservePayload: boolean;
};

export type InlinePromptSource = {
  kind: "inline";
  message: string;
};

export type ShadcnPromptSource = {
  kind: "shadcn-block" | "shadcn-component";
  registryItem: ShadcnRegistryItem;
  style?: string;
  displayName?: string;
  description?: string;
  dependencyItems?: ShadcnRegistryItem[];
  placement?: PlacementOption;
  detectedSections?: DetectedSection[];
  existingUiComponents?: string[];
};

export type AiElementPromptSource = {
  kind: "ai-element";
  item: AiElementCatalogItem;
  placement?: PlacementOption;
  detectedSections?: DetectedSection[];
  componentTargetPath?: string;
};

export type ApprovedPlanPromptSource = {
  kind: "approved-plan";
  rawPlan: Record<string, unknown>;
};

export type PromptSource =
  | InlinePromptSource
  | ShadcnPromptSource
  | AiElementPromptSource
  | ApprovedPlanPromptSource;

export type PromptEnvelopeOptions = {
  placementLabel?: string;
  anchorLabel?: string | null;
  customization?: string;
};

export type PromptBuildResult = {
  message: string;
  meta: PromptSourceMeta;
  title?: string;
  depsLabel?: string;
};

function buildCustomizationInstruction(customization?: string): string {
  const trimmed = customization?.trim();
  if (!trimmed) return "";
  return [
    "",
    "Ytterligare implementeringsinstruktion från användaren:",
    trimmed,
    "Följ instruktionen ovan samtidigt som du håller vald placering exakt.",
  ].join("\n");
}

function formatDependencySuffix(dependencies?: string[]): string {
  if (!dependencies || dependencies.length === 0) return "";
  const preview = dependencies.slice(0, 4).join(", ");
  return ` (${preview}${dependencies.length > 4 ? "..." : ""})`;
}

function wrapPlacementMessage(
  kindLabel: string,
  title: string,
  depsLabel: string,
  technicalPrompt: string,
  placement?: PlacementOption,
  options: PromptEnvelopeOptions = {},
): string {
  const placementLabel = options.placementLabel ?? getPlacementLabel(placement);
  const anchorLine = options.anchorLabel ? `\n🧭 Ankare: ${options.anchorLabel}` : "";
  const extraInstruction = buildCustomizationInstruction(options.customization);

  return `Lägg till ${kindLabel}: **${title}**${depsLabel}
📍 Placering: ${placementLabel}${anchorLine}

---

${technicalPrompt}${extraInstruction}`;
}

export function buildPromptSourceMessage(
  source: PromptSource,
  options: PromptEnvelopeOptions = {},
): PromptBuildResult {
  switch (source.kind) {
    case "inline":
      return {
        message: source.message,
        meta: {
          sourceKind: "inline",
          isTechnical: false,
          preservePayload: false,
        },
      };

    case "approved-plan":
      return {
        message: buildApprovedPlanExecutionPrompt(source.rawPlan),
        meta: {
          sourceKind: "approved-plan",
          isTechnical: true,
          preservePayload: true,
        },
      };

    case "shadcn-block": {
      const title = source.displayName || source.registryItem.name || "Block";
      const depsLabel = formatDependencySuffix(source.registryItem.registryDependencies);
      const technicalPrompt = buildShadcnBlockPrompt(source.registryItem, {
        style: source.style,
        displayName: source.displayName,
        description: source.description,
        dependencyItems: source.dependencyItems,
        placement: source.placement,
        detectedSections: source.detectedSections,
        existingUiComponents: source.existingUiComponents,
      });
      return {
        title,
        depsLabel,
        message: wrapPlacementMessage(
          "UI‑element (block)",
          title,
          depsLabel,
          technicalPrompt,
          source.placement,
          options,
        ),
        meta: {
          sourceKind: "shadcn-block",
          isTechnical: true,
          preservePayload: true,
        },
      };
    }

    case "shadcn-component": {
      const title = source.displayName || source.registryItem.name || "Komponent";
      const depsLabel = formatDependencySuffix(source.registryItem.registryDependencies);
      const technicalPrompt = buildShadcnComponentPrompt(source.registryItem, {
        style: source.style,
        displayName: source.displayName,
        description: source.description,
        dependencyItems: source.dependencyItems,
        placement: source.placement,
        detectedSections: source.detectedSections,
        existingUiComponents: source.existingUiComponents,
      });
      return {
        title,
        depsLabel,
        message: wrapPlacementMessage(
          "UI‑element (komponent)",
          title,
          depsLabel,
          technicalPrompt,
          source.placement,
          options,
        ),
        meta: {
          sourceKind: "shadcn-component",
          isTechnical: true,
          preservePayload: true,
        },
      };
    }

    case "ai-element": {
      const depsLabel = formatDependencySuffix(source.item.dependencies);
      const technicalPrompt = buildAiElementPrompt(source.item, {
        placement: source.placement,
        detectedSections: source.detectedSections,
        componentTargetPath: source.componentTargetPath ?? AI_ELEMENTS_COMPONENT_TARGET,
      });
      return {
        title: source.item.label,
        depsLabel,
        message: wrapPlacementMessage(
          "AI‑element",
          source.item.label,
          depsLabel,
          technicalPrompt,
          source.placement,
          options,
        ),
        meta: {
          sourceKind: "ai-element",
          isTechnical: true,
          preservePayload: true,
        },
      };
    }
  }
}
