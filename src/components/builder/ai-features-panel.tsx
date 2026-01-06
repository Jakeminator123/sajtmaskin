"use client";

/**
 * AI Features Panel
 *
 * UI för att aktivera/avaktivera AI SDK 6:s avancerade funktioner.
 * Visas som en expanderbar panel i builder-vyn.
 *
 * STRUKTUR:
 * - Base features: Alltid aktiva (structuredToolOutput, extendedUsage)
 * - Advanced features: Kräver master-toggle + individuella toggles
 * - Placeholder features: Visas men är disabled med tydlig indikation
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
  Lock,
  Clock,
  Power,
} from "lucide-react";
import {
  useAIFeatures,
  FEATURE_STATUS_CONFIG,
  isBaseFeature,
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
  disabled?: boolean; // When advanced mode is off
}

function FeatureToggle({
  feature,
  onToggle,
  disabled = false,
}: FeatureToggleProps) {
  const statusConfig = FEATURE_STATUS_CONFIG[feature.status];
  const isPlaceholder = feature.status === "placeholder";
  const isBase = isBaseFeature(feature.id);
  const isDisabled = disabled || isPlaceholder || isBase;

  // Determine the visual state
  const getToggleState = () => {
    if (isBase) return "base"; // Always on, locked
    if (isPlaceholder) return "placeholder"; // Not implemented
    if (disabled) return "disabled"; // Advanced mode is off
    return feature.enabled ? "enabled" : "disabled-toggle";
  };

  const toggleState = getToggleState();

  return (
    <div
      className={`
        group relative p-3 rounded-lg border transition-all duration-200
        ${
          toggleState === "enabled"
            ? "bg-violet-500/10 border-violet-500/30"
            : ""
        }
        ${toggleState === "base" ? "bg-green-500/5 border-green-500/20" : ""}
        ${
          toggleState === "placeholder"
            ? "bg-gray-800/30 border-gray-700/30 opacity-50"
            : ""
        }
        ${
          toggleState === "disabled"
            ? "bg-gray-800/30 border-gray-700/30 opacity-60"
            : ""
        }
        ${
          toggleState === "disabled-toggle"
            ? "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"
            : ""
        }
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-sm font-medium ${
                isDisabled && !isBase ? "text-gray-400" : "text-gray-200"
              }`}
            >
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
            {/* Base feature indicator */}
            {isBase && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border bg-green-500/20 text-green-400 border-green-500/30">
                <Lock className="h-2.5 w-2.5" />
                Alltid på
              </span>
            )}
          </div>
          <p
            className={`text-xs leading-relaxed ${
              isDisabled && !isBase ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {feature.description}
          </p>

          {/* Placeholder notice */}
          {isPlaceholder && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>Denna funktion är inte implementerad ännu</span>
            </div>
          )}

          {/* Extra info for features requiring install */}
          {feature.requiresInstall && !isPlaceholder && (
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
              className={`inline-flex items-center gap-1 mt-2 text-xs transition-colors ${
                isDisabled
                  ? "text-gray-500 hover:text-gray-400"
                  : "text-violet-400 hover:text-violet-300"
              }`}
            >
              <ExternalLink className="h-3 w-3" />
              Dokumentation
            </a>
          )}
        </div>

        {/* Toggle button - different states */}
        {isBase ? (
          // Base features: Locked ON indicator
          <div
            className="relative w-12 h-6 rounded-full bg-green-600/50 cursor-default"
            title="Denna funktion är alltid aktiverad"
          >
            <span className="absolute top-1 left-7 w-4 h-4 rounded-full bg-white shadow-sm" />
            <Lock className="absolute top-1.5 left-1.5 h-3 w-3 text-green-200" />
          </div>
        ) : isPlaceholder ? (
          // Placeholder: Disabled with clock icon
          <div
            className="relative w-12 h-6 rounded-full bg-gray-700/50 cursor-not-allowed"
            title="Kommer snart - funktionen är inte implementerad ännu"
          >
            <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-gray-500 shadow-sm" />
            <Clock className="absolute top-1.5 right-1.5 h-3 w-3 text-gray-400" />
          </div>
        ) : (
          // Normal toggleable feature
          <button
            onClick={() => onToggle(feature.id)}
            disabled={disabled}
            className={`
              relative w-12 h-6 rounded-full transition-all duration-200
              ${disabled ? "bg-gray-700/50 cursor-not-allowed" : ""}
              ${!disabled && feature.enabled ? "bg-violet-500" : ""}
              ${
                !disabled && !feature.enabled
                  ? "bg-gray-600 hover:bg-gray-500"
                  : ""
              }
            `}
            title={
              disabled
                ? "Aktivera avancerat läge först"
                : feature.enabled
                ? "Inaktivera"
                : "Aktivera"
            }
          >
            <span
              className={`
                absolute top-1 w-4 h-4 rounded-full shadow-sm transition-transform duration-200
                ${disabled ? "bg-gray-400 left-1" : "bg-white"}
                ${!disabled && feature.enabled ? "left-7" : "left-1"}
              `}
            />
          </button>
        )}
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
  advancedModeEnabled: boolean;
}

function CategorySection({
  category,
  features,
  onToggle,
  advancedModeEnabled,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const Icon = CATEGORY_ICONS[category];
  const label = CATEGORY_LABELS[category];

  // Count enabled features (excluding placeholders)
  const activeFeatures = features.filter((f) => f.status !== "placeholder");
  const enabledCount = activeFeatures.filter((f) => f.enabled).length;
  const placeholderCount = features.filter(
    (f) => f.status === "placeholder"
  ).length;

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
            ({enabledCount}/{activeFeatures.length} aktiva
            {placeholderCount > 0 && `, ${placeholderCount} kommande`})
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
              disabled={!advancedModeEnabled && !isBaseFeature(feature.id)}
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
  const {
    getAllFeatures,
    getBaseFeatures,
    getAdvancedFeatures,
    toggleFeature,
    resetToDefaults,
    advancedModeEnabled,
    toggleAdvancedMode,
  } = useAIFeatures();

  const allFeatures = getAllFeatures();
  const baseFeatures = getBaseFeatures();
  const advancedFeatures = getAdvancedFeatures();

  // Group advanced features by category (excluding base features)
  const advancedByCategory = advancedFeatures.reduce((acc, feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = [];
    }
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<AIFeature["category"], AIFeature[]>);

  // Count active features
  const activeAdvanced = advancedFeatures.filter(
    (f) => f.enabled && f.status !== "placeholder"
  ).length;
  const totalImplemented = allFeatures.filter(
    (f) => f.status !== "placeholder"
  ).length;
  const totalEnabled = allFeatures.filter((f) => f.enabled).length;

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
              {totalEnabled} av {totalImplemented} funktioner aktiva
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

      {/* Base features section - always visible */}
      <div className="px-4 py-3 border-b border-gray-800 bg-green-500/5">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium text-gray-200">
            Basfunktioner
          </span>
          <span className="text-xs text-gray-500">(alltid aktiva)</span>
        </div>
        <div className="space-y-2">
          {baseFeatures.map((feature) => (
            <FeatureToggle
              key={feature.id}
              feature={feature}
              onToggle={toggleFeature}
            />
          ))}
        </div>
      </div>

      {/* Advanced mode master toggle */}
      <div className="px-4 py-3 border-b border-gray-800 bg-violet-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Power className="h-4 w-4 text-violet-400" />
            <div>
              <span className="text-sm font-medium text-gray-200">
                Avancerat läge
              </span>
              <p className="text-xs text-gray-500">
                {advancedModeEnabled
                  ? `${activeAdvanced} avancerade funktioner aktiva`
                  : "Aktivera för att använda avancerade AI-funktioner"}
              </p>
            </div>
          </div>
          <button
            onClick={toggleAdvancedMode}
            className={`
              relative w-14 h-7 rounded-full transition-all duration-300
              ${
                advancedModeEnabled
                  ? "bg-violet-500 shadow-lg shadow-violet-500/30"
                  : "bg-gray-600 hover:bg-gray-500"
              }
            `}
            title={
              advancedModeEnabled
                ? "Stäng av avancerat läge"
                : "Aktivera avancerat läge"
            }
          >
            <span
              className={`
                absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm
                transition-transform duration-300
                ${advancedModeEnabled ? "left-8" : "left-1"}
              `}
            />
          </button>
        </div>
      </div>

      {/* Info banner - only show when advanced mode is off */}
      {!advancedModeEnabled && (
        <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-300/80 leading-relaxed">
              Aktivera <strong>Avancerat läge</strong> ovan för att få tillgång
              till Smart Agent Mode, MCP-verktyg och andra experimentella
              funktioner. Vissa funktioner är under utveckling.
            </p>
          </div>
        </div>
      )}

      {/* Advanced features categories */}
      <div
        className={`p-4 space-y-3 max-h-[50vh] overflow-y-auto transition-opacity duration-300 ${
          !advancedModeEnabled ? "opacity-60" : ""
        }`}
      >
        {(Object.keys(advancedByCategory) as Array<AIFeature["category"]>).map(
          (category) => (
            <CategorySection
              key={category}
              category={category}
              features={advancedByCategory[category]}
              onToggle={toggleFeature}
              advancedModeEnabled={advancedModeEnabled}
            />
          )
        )}
      </div>

      {/* Footer with status summary */}
      <div className="p-4 border-t border-gray-800 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-gray-400">
                {allFeatures.filter((f) => f.status === "stable").length}{" "}
                stabila
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-gray-400">
                {allFeatures.filter((f) => f.status === "beta").length} beta
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-gray-400" />
              <span className="text-gray-400">
                {allFeatures.filter((f) => f.status === "placeholder").length}{" "}
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
  const { advancedModeEnabled, getAllFeatures } = useAIFeatures();
  const allFeatures = getAllFeatures();
  const implementedFeatures = allFeatures.filter(
    (f) => f.status !== "placeholder"
  );
  const enabledCount = allFeatures.filter((f) => f.enabled).length;

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg
        bg-gray-800/50 hover:bg-gray-800 border 
        text-sm text-gray-300 hover:text-gray-100
        transition-all duration-200
        ${
          advancedModeEnabled
            ? "border-violet-500/50 shadow-sm shadow-violet-500/20"
            : "border-gray-700"
        }
        ${className}
      `}
      title="AI SDK 6 Avancerade Funktioner"
    >
      <Sparkles
        className={`h-4 w-4 ${
          advancedModeEnabled ? "text-violet-400" : "text-gray-400"
        }`}
      />
      <span className="hidden sm:inline">AI Funktioner</span>
      <span
        className={`text-xs ${
          advancedModeEnabled ? "text-violet-400" : "text-gray-500"
        }`}
      >
        {enabledCount}/{implementedFeatures.length}
      </span>
      {advancedModeEnabled && (
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
      )}
    </button>
  );
}

export default AIFeaturesPanel;
