"use client";

/**
 * AI Features Panel
 *
 * UI för att aktivera/avaktivera AI SDK 6:s avancerade funktioner.
 * Visas som en expanderbar panel i builder-vyn.
 */

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Bot,
  Wrench,
  Bug,
  Zap,
  ExternalLink,
  AlertCircle,
  Check,
  X,
  RotateCcw,
  Info,
} from "lucide-react";
import {
  useAIFeatures,
  AI_SDK_FEATURES,
  FEATURE_STATUS_CONFIG,
  type AIFeature,
} from "@/lib/ai/ai-sdk-features";

// ============================================================================
// CATEGORY ICONS
// ============================================================================

const CATEGORY_ICONS = {
  agents: Bot,
  tools: Wrench,
  debug: Bug,
  optimization: Zap,
} as const;

const CATEGORY_LABELS = {
  agents: "Agenter",
  tools: "Verktyg",
  debug: "Debug & Analys",
  optimization: "Optimering",
} as const;

// ============================================================================
// FEATURE TOGGLE COMPONENT
// ============================================================================

interface FeatureToggleProps {
  feature: AIFeature;
  onToggle: (featureId: string) => void;
}

function FeatureToggle({ feature, onToggle }: FeatureToggleProps) {
  const statusConfig = FEATURE_STATUS_CONFIG[feature.status];
  const isPlaceholder = feature.status === "placeholder";

  return (
    <div
      className={`
        group relative p-3 rounded-lg border transition-all duration-200
        ${
          feature.enabled
            ? "bg-violet-500/10 border-violet-500/30"
            : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"
        }
        ${isPlaceholder ? "opacity-60" : ""}
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-200">
              {feature.name}
            </span>
            <span
              className={`
                px-1.5 py-0.5 text-[10px] font-medium rounded border
                ${statusConfig.color}
              `}
              title={statusConfig.description}
            >
              {statusConfig.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            {feature.description}
          </p>

          {/* Extra info for features requiring install */}
          {feature.requiresInstall && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400/80">
              <AlertCircle className="h-3 w-3" />
              <span>Kräver: {feature.requiresInstall}</span>
            </div>
          )}

          {/* Docs link */}
          {feature.docsUrl && (
            <a
              href={feature.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Dokumentation
            </a>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => onToggle(feature.id)}
          disabled={isPlaceholder}
          className={`
            relative w-12 h-6 rounded-full transition-all duration-200
            ${
              isPlaceholder
                ? "bg-gray-700 cursor-not-allowed"
                : feature.enabled
                  ? "bg-violet-500"
                  : "bg-gray-600 hover:bg-gray-500"
            }
          `}
          title={
            isPlaceholder
              ? "Kommer snart"
              : feature.enabled
                ? "Inaktivera"
                : "Aktivera"
          }
        >
          <span
            className={`
              absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm
              transition-transform duration-200
              ${feature.enabled ? "left-7" : "left-1"}
            `}
          />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY SECTION
// ============================================================================

interface CategorySectionProps {
  category: AIFeature["category"];
  features: AIFeature[];
  onToggle: (featureId: string) => void;
}

function CategorySection({
  category,
  features,
  onToggle,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const Icon = CATEGORY_ICONS[category];
  const label = CATEGORY_LABELS[category];
  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      {/* Category header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-gray-200">{label}</span>
          <span className="text-xs text-gray-500">
            ({enabledCount}/{features.length} aktiva)
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Features list */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-gray-900/50">
          {features.map((feature) => (
            <FeatureToggle
              key={feature.id}
              feature={feature}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

interface AIFeaturesPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AIFeaturesPanel({
  isOpen = true,
  onClose,
}: AIFeaturesPanelProps) {
  const { getAllFeatures, toggleFeature, resetToDefaults, enabledFeatures } =
    useAIFeatures();

  const features = getAllFeatures();

  // Group features by category
  const featuresByCategory = features.reduce(
    (acc, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = [];
      }
      acc[feature.category].push(feature);
      return acc;
    },
    {} as Record<AIFeature["category"], AIFeature[]>
  );

  const totalEnabled = enabledFeatures.size;
  const totalFeatures = Object.keys(AI_SDK_FEATURES).length;

  if (!isOpen) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20">
            <Sparkles className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-100">
              AI SDK 6 Features
            </h3>
            <p className="text-xs text-gray-400">
              {totalEnabled} av {totalFeatures} funktioner aktiva
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Reset button */}
          <button
            onClick={resetToDefaults}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            title="Återställ till standard"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-300/80 leading-relaxed">
            Aktivera avancerade AI-funktioner för att förbättra din
            webbplatsbyggarupplevelse. Vissa funktioner är under utveckling och
            kommer snart.
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {(
          Object.keys(featuresByCategory) as Array<AIFeature["category"]>
        ).map((category) => (
          <CategorySection
            key={category}
            category={category}
            features={featuresByCategory[category]}
            onToggle={toggleFeature}
          />
        ))}
      </div>

      {/* Footer with status summary */}
      <div className="p-4 border-t border-gray-800 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-gray-400">
                {features.filter((f) => f.status === "stable").length} stabila
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-gray-400">
                {features.filter((f) => f.status === "beta").length} beta
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-gray-400">
                {features.filter((f) => f.status === "placeholder").length}{" "}
                kommande
              </span>
            </div>
          </div>

          <a
            href="https://vercel.com/blog/ai-sdk-6"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
          >
            Läs mer
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT TOGGLE BUTTON
// ============================================================================

interface AIFeaturesButtonProps {
  onClick: () => void;
  className?: string;
}

export function AIFeaturesButton({
  onClick,
  className = "",
}: AIFeaturesButtonProps) {
  const { enabledFeatures } = useAIFeatures();
  const totalFeatures = Object.keys(AI_SDK_FEATURES).length;

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg
        bg-gray-800/50 hover:bg-gray-800 border border-gray-700
        text-sm text-gray-300 hover:text-gray-100
        transition-all duration-200
        ${className}
      `}
      title="AI SDK 6 Avancerade Funktioner"
    >
      <Sparkles className="h-4 w-4 text-violet-400" />
      <span className="hidden sm:inline">AI Funktioner</span>
      <span className="text-xs text-gray-500">
        {enabledFeatures.size}/{totalFeatures}
      </span>
    </button>
  );
}

export default AIFeaturesPanel;

