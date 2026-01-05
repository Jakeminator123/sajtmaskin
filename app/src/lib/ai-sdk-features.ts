/**
 * AI SDK 6 Advanced Features Configuration
 *
 * Centraliserad hantering av AI SDK 6:s avancerade funktioner.
 * Användare kan aktivera/avaktivera features via UI.
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
      "Anslut externa MCP-servrar för utökade verktyg (databaser, API:er, etc.).",
    category: "tools",
    status: "placeholder",
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
  // Aktiverade features (by ID)
  enabledFeatures: Set<string>;

  // Actions
  enableFeature: (featureId: string) => void;
  disableFeature: (featureId: string) => void;
  toggleFeature: (featureId: string) => void;
  isFeatureEnabled: (featureId: string) => boolean;
  getEnabledFeatures: () => AIFeature[];
  getAllFeatures: () => AIFeature[];
  resetToDefaults: () => void;
}

// Default enabled features (stable ones)
const DEFAULT_ENABLED_FEATURES = new Set<string>([
  "structuredToolOutput",
  "extendedUsage",
]);

export const useAIFeatures = create<AIFeaturesState>()(
  persist(
    (set, get) => ({
      enabledFeatures: new Set(DEFAULT_ENABLED_FEATURES),

      enableFeature: (featureId: string) => {
        if (!(featureId in AI_SDK_FEATURES)) {
          console.warn(`[AIFeatures] Unknown feature: ${featureId}`);
          return;
        }
        set((state) => ({
          enabledFeatures: new Set([...state.enabledFeatures, featureId]),
        }));
      },

      disableFeature: (featureId: string) => {
        set((state) => {
          const newSet = new Set(state.enabledFeatures);
          newSet.delete(featureId);
          return { enabledFeatures: newSet };
        });
      },

      toggleFeature: (featureId: string) => {
        const { enabledFeatures, enableFeature, disableFeature } = get();
        if (enabledFeatures.has(featureId)) {
          disableFeature(featureId);
        } else {
          enableFeature(featureId);
        }
      },

      isFeatureEnabled: (featureId: string) => {
        return get().enabledFeatures.has(featureId);
      },

      getEnabledFeatures: () => {
        const { enabledFeatures } = get();
        return Object.values(AI_SDK_FEATURES)
          .filter((f) => enabledFeatures.has(f.id))
          .map((f) => ({ ...f, enabled: true }));
      },

      getAllFeatures: () => {
        const { enabledFeatures } = get();
        return Object.values(AI_SDK_FEATURES).map((f) => ({
          ...f,
          enabled: enabledFeatures.has(f.id),
        }));
      },

      resetToDefaults: () => {
        set({ enabledFeatures: new Set(DEFAULT_ENABLED_FEATURES) });
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
              enabledFeatures: new Set(parsed.state.enabledFeatures || []),
            },
          };
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
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
 */
export function isAIFeatureEnabled(featureId: string): boolean {
  return useAIFeatures.getState().isFeatureEnabled(featureId);
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
  };
}

/**
 * Kontrollera vilka features som kräver extra installation
 */
export function getFeaturesRequiringInstall(): AIFeature[] {
  return Object.values(AI_SDK_FEATURES)
    .filter((f) => f.requiresInstall)
    .map((f) => ({ ...f, enabled: isAIFeatureEnabled(f.id) }));
}

/**
 * Hämta features by kategori
 */
export function getFeaturesByCategory(
  category: AIFeature["category"]
): AIFeature[] {
  const { enabledFeatures } = useAIFeatures.getState();
  return Object.values(AI_SDK_FEATURES)
    .filter((f) => f.category === category)
    .map((f) => ({ ...f, enabled: enabledFeatures.has(f.id) }));
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
