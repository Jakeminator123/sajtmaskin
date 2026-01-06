/**
 * AI SDK 6 Advanced Features Configuration
 *
 * Centraliserad hantering av AI SDK 6:s avancerade funktioner.
 * Användare kan aktivera/avaktivera features via UI.
 *
 * FEATURE KATEGORIER:
 * - Base features: Alltid aktiva, kan ej stängas av (structuredToolOutput, extendedUsage)
 * - Advanced features: Kan slås av/på med master-toggle + individuella toggles
 * - Placeholder features: Visas men är disabled (ej implementerade ännu)
 *
 * @see https://vercel.com/blog/ai-sdk-6
 * @see https://vercel.com/docs/ai-sdk
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================================================
// FEATURE DEFINITIONS
// ============================================================================

export interface AIFeature {
  id: string;
  name: string;
  description: string;
  category: "agents" | "tools" | "debug" | "optimization";
  status: "stable" | "beta" | "experimental" | "placeholder";
  enabled: boolean;
  requiresInstall?: string; // NPM package if additional install needed
  docsUrl?: string;
  isBase?: boolean; // Base features are always on and cannot be toggled
}

// Base features that are always enabled and cannot be turned off
export const BASE_FEATURE_IDS = new Set<string>([
  "structuredToolOutput",
  "extendedUsage",
]);

// Check if a feature is a base feature (always on)
export function isBaseFeature(featureId: string): boolean {
  return BASE_FEATURE_IDS.has(featureId);
}

// Check if a feature is a placeholder (not implemented yet)
export function isPlaceholderFeature(featureId: string): boolean {
  const feature = AI_SDK_FEATURES[featureId];
  return feature?.status === "placeholder";
}

/**
 * Alla tillgängliga AI SDK 6 features
 */
export const AI_SDK_FEATURES: Record<string, Omit<AIFeature, "enabled">> = {
  // ─────────────────────────────────────────────────────────────────────────
  // AGENTS
  // ─────────────────────────────────────────────────────────────────────────
  toolLoopAgent: {
    id: "toolLoopAgent",
    name: "Smart Agent Mode",
    description:
      "Använder AI SDK 6:s ToolLoopAgent för smartare prompt-hantering. Agenten analyserar, söker i kod och förbättrar prompten automatiskt innan v0 anropas.",
    category: "agents",
    status: "stable",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/agents",
  },

  agentCallOptions: {
    id: "agentCallOptions",
    name: "Agent Call Options",
    description:
      "Skicka dynamiska parametrar till agenten baserat på projektkontext (t.ex. användarens kontotyp, projekthistorik).",
    category: "agents",
    status: "placeholder",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/agents#call-options",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOLS
  // ─────────────────────────────────────────────────────────────────────────
  toolApproval: {
    id: "toolApproval",
    name: "Tool Approval (Human-in-the-Loop)",
    description:
      "Be om bekräftelse innan känsliga verktyg körs. Ger dig kontroll över vad AI:n får göra.",
    category: "tools",
    status: "placeholder",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling",
  },

  structuredToolOutput: {
    id: "structuredToolOutput",
    name: "Structured Tool Output",
    description:
      "Verktyg returnerar strukturerad data (JSON Schema) istället för fritext. Förbättrar tillförlitlighet.",
    category: "tools",
    status: "stable",
    docsUrl:
      "https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data",
  },

  mcpTools: {
    id: "mcpTools",
    name: "MCP Tools Integration",
    description:
      "Aktiverar dokumentationssökning och error logging via MCP-servern.",
    category: "tools",
    status: "beta",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/mcp",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEBUG & OPTIMIZATION
  // ─────────────────────────────────────────────────────────────────────────
  devTools: {
    id: "devTools",
    name: "AI DevTools",
    description:
      "Visuell debugger för AI-anrop. Se exakt vad som skickas till modellen och svaret.",
    category: "debug",
    status: "placeholder",
    requiresInstall: "@ai-sdk/devtools",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/devtools",
  },

  extendedUsage: {
    id: "extendedUsage",
    name: "Extended Usage Tracking",
    description:
      "Detaljerad tokenräkning: input/output tokens, reasoning tokens, cache hits.",
    category: "debug",
    status: "stable",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/generating-text",
  },

  reranking: {
    id: "reranking",
    name: "Reranking",
    description:
      "Omranka sökresultat med AI för bättre relevans. Användbart för Code Crawler.",
    category: "optimization",
    status: "placeholder",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/reranking",
  },

  imageEditing: {
    id: "imageEditing",
    name: "AI Image Editing",
    description:
      "Redigera bilder med AI (beskärning, stil, bakgrund). Utökar bildgenerering.",
    category: "optimization",
    status: "placeholder",
    docsUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/image-generation",
  },
} as const;

// ============================================================================
// FEATURE FLAGS STORE
// ============================================================================

interface AIFeaturesState {
  // Master toggle for advanced features (base features are always on)
  advancedModeEnabled: boolean;

  // Aktiverade features (by ID) - only applies when advancedModeEnabled is true
  enabledFeatures: Set<string>;

  // Actions
  toggleAdvancedMode: () => void;
  setAdvancedMode: (enabled: boolean) => void;
  enableFeature: (featureId: string) => void;
  disableFeature: (featureId: string) => void;
  toggleFeature: (featureId: string) => void;
  isFeatureEnabled: (featureId: string) => boolean;
  getEnabledFeatures: () => AIFeature[];
  getAllFeatures: () => AIFeature[];
  getBaseFeatures: () => AIFeature[];
  getAdvancedFeatures: () => AIFeature[];
  resetToDefaults: () => void;
}

// Default enabled features (stable ones that are toggled on by default)
const DEFAULT_ENABLED_FEATURES = new Set<string>([
  "structuredToolOutput",
  "extendedUsage",
  // Advanced features default to off (user must enable them)
]);

export const useAIFeatures = create<AIFeaturesState>()(
  persist(
    (set, get) => ({
      advancedModeEnabled: false, // Master toggle starts OFF
      enabledFeatures: new Set(DEFAULT_ENABLED_FEATURES),

      toggleAdvancedMode: () => {
        set((state) => ({ advancedModeEnabled: !state.advancedModeEnabled }));
      },

      setAdvancedMode: (enabled: boolean) => {
        set({ advancedModeEnabled: enabled });
      },

      enableFeature: (featureId: string) => {
        if (!(featureId in AI_SDK_FEATURES)) {
          console.warn(`[AIFeatures] Unknown feature: ${featureId}`);
          return;
        }
        // Don't allow toggling base features or placeholders
        if (isBaseFeature(featureId) || isPlaceholderFeature(featureId)) {
          return;
        }
        set((state) => ({
          enabledFeatures: new Set([...state.enabledFeatures, featureId]),
        }));
      },

      disableFeature: (featureId: string) => {
        // Don't allow disabling base features
        if (isBaseFeature(featureId)) {
          return;
        }
        set((state) => {
          const newSet = new Set(state.enabledFeatures);
          newSet.delete(featureId);
          return { enabledFeatures: newSet };
        });
      },

      toggleFeature: (featureId: string) => {
        // Don't allow toggling base features or placeholders
        if (isBaseFeature(featureId) || isPlaceholderFeature(featureId)) {
          return;
        }
        const { enabledFeatures, enableFeature, disableFeature } = get();
        if (enabledFeatures.has(featureId)) {
          disableFeature(featureId);
        } else {
          enableFeature(featureId);
        }
      },

      isFeatureEnabled: (featureId: string) => {
        const { advancedModeEnabled, enabledFeatures } = get();

        // Base features are ALWAYS enabled
        if (isBaseFeature(featureId)) {
          return true;
        }

        // Placeholder features are NEVER enabled (not implemented)
        if (isPlaceholderFeature(featureId)) {
          return false;
        }

        // Advanced features require master toggle + individual toggle
        if (!advancedModeEnabled) {
          return false;
        }

        return enabledFeatures.has(featureId);
      },

      getEnabledFeatures: () => {
        const state = get();
        return Object.values(AI_SDK_FEATURES)
          .filter((f) => state.isFeatureEnabled(f.id))
          .map((f) => ({ ...f, enabled: true, isBase: isBaseFeature(f.id) }));
      },

      getAllFeatures: () => {
        const state = get();
        return Object.values(AI_SDK_FEATURES).map((f) => ({
          ...f,
          enabled: state.isFeatureEnabled(f.id),
          isBase: isBaseFeature(f.id),
        }));
      },

      getBaseFeatures: () => {
        return Object.values(AI_SDK_FEATURES)
          .filter((f) => isBaseFeature(f.id))
          .map((f) => ({ ...f, enabled: true, isBase: true }));
      },

      getAdvancedFeatures: () => {
        const state = get();
        return Object.values(AI_SDK_FEATURES)
          .filter((f) => !isBaseFeature(f.id))
          .map((f) => ({
            ...f,
            enabled: state.isFeatureEnabled(f.id),
            isBase: false,
          }));
      },

      resetToDefaults: () => {
        set({
          advancedModeEnabled: false,
          enabledFeatures: new Set(DEFAULT_ENABLED_FEATURES),
        });
      },
    }),
    {
      name: "ai-sdk-features",
      // Custom serialization for Set
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              advancedModeEnabled: parsed.state.advancedModeEnabled ?? false,
              enabledFeatures: new Set(parsed.state.enabledFeatures || []),
            },
          };
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              advancedModeEnabled: value.state.advancedModeEnabled,
              enabledFeatures: [...value.state.enabledFeatures],
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Kontrollera om en feature är aktiverad (för use i icke-React kontext)
 * Takes into account: base features (always on), placeholders (always off),
 * and advanced mode toggle.
 */
export function isAIFeatureEnabled(featureId: string): boolean {
  return useAIFeatures.getState().isFeatureEnabled(featureId);
}

/**
 * Kontrollera om advanced mode är aktiverat
 */
export function isAdvancedModeEnabled(): boolean {
  return useAIFeatures.getState().advancedModeEnabled;
}

/**
 * Hämta feature-konfiguration
 */
export function getAIFeature(featureId: string): AIFeature | null {
  const feature = AI_SDK_FEATURES[featureId];
  if (!feature) return null;
  return {
    ...feature,
    enabled: isAIFeatureEnabled(featureId),
    isBase: isBaseFeature(featureId),
  };
}

/**
 * Kontrollera vilka features som kräver extra installation
 */
export function getFeaturesRequiringInstall(): AIFeature[] {
  return Object.values(AI_SDK_FEATURES)
    .filter((f) => f.requiresInstall)
    .map((f) => ({
      ...f,
      enabled: isAIFeatureEnabled(f.id),
      isBase: isBaseFeature(f.id),
    }));
}

/**
 * Hämta features by kategori
 */
export function getFeaturesByCategory(
  category: AIFeature["category"]
): AIFeature[] {
  const state = useAIFeatures.getState();
  return Object.values(AI_SDK_FEATURES)
    .filter((f) => f.category === category)
    .map((f) => ({
      ...f,
      enabled: state.isFeatureEnabled(f.id),
      isBase: isBaseFeature(f.id),
    }));
}

// ============================================================================
// FEATURE STATUS BADGES
// ============================================================================

export const FEATURE_STATUS_CONFIG = {
  stable: {
    label: "Stabil",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    description: "Testad och redo för produktion",
  },
  beta: {
    label: "Beta",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    description: "Fungerar men kan ha mindre buggar",
  },
  experimental: {
    label: "Experimentell",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    description: "Under utveckling, kan ändras",
  },
  placeholder: {
    label: "Kommer snart",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    description: "Planerad feature, ej implementerad",
  },
} as const;
