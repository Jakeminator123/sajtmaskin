"use client";

/**
 * PreBuilderSettings - Compact model tier + prompt assist picker
 *
 * Used in pre-builder flows (free text, wizard, audit, category) to let
 * users configure AI settings before entering the builder.
 */

import { useState } from "react";
import { ChevronDown, HelpCircle, Settings2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { PromptAssistProvider } from "@/lib/builder/promptAssist";
import {
  MODEL_TIER_OPTIONS,
  PROMPT_ASSIST_PROVIDER_OPTIONS,
  DEFAULT_MODEL_TIER,
  DEFAULT_PROMPT_ASSIST,
  SETTINGS_URL_PARAMS,
} from "@/lib/builder/defaults";

export interface PreBuilderSettingsValue {
  modelTier: ModelTier;
  assistProvider: PromptAssistProvider;
  assistModel: string;
  assistDeep: boolean;
}

interface PreBuilderSettingsProps {
  value: PreBuilderSettingsValue;
  onChange: (value: PreBuilderSettingsValue) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function getDefaultPreBuilderSettings(): PreBuilderSettingsValue {
  return {
    modelTier: DEFAULT_MODEL_TIER,
    assistProvider: DEFAULT_PROMPT_ASSIST.provider,
    assistModel: DEFAULT_PROMPT_ASSIST.model,
    assistDeep: DEFAULT_PROMPT_ASSIST.deep,
  };
}

export function buildSettingsUrlParams(settings: PreBuilderSettingsValue): string {
  const params = new URLSearchParams();
  params.set(SETTINGS_URL_PARAMS.modelTier, settings.modelTier);
  params.set(SETTINGS_URL_PARAMS.assistProvider, settings.assistProvider);
  params.set(SETTINGS_URL_PARAMS.assistModel, settings.assistModel);
  params.set(SETTINGS_URL_PARAMS.assistDeep, String(settings.assistDeep));
  return params.toString();
}

export function PreBuilderSettings({
  value,
  onChange,
  disabled = false,
  compact = true,
}: PreBuilderSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentTier = MODEL_TIER_OPTIONS.find((t) => t.value === value.modelTier);

  const handleTierChange = (tier: string) => {
    onChange({ ...value, modelTier: tier as ModelTier });
  };

  const handleProviderChange = (provider: string) => {
    onChange({ ...value, assistProvider: provider as PromptAssistProvider });
  };

  const handleDeepChange = (deep: boolean) => {
    onChange({ ...value, assistDeep: deep });
  };

  // Compact mode: just show a small settings button with dropdown
  if (compact) {
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-8 px-2 text-gray-400 hover:text-white"
          >
            <Settings2 className="h-4 w-4" />
            <span className="ml-1.5 hidden text-xs sm:inline">
              {currentTier?.label}
              {value.assistProvider !== "off" && <span className="text-brand-teal ml-1">+AI</span>}
            </span>
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Zap className="text-brand-amber h-4 w-4" />
            Modell
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value.modelTier} onValueChange={handleTierChange}>
            {MODEL_TIER_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <span className="font-medium">{option.label}</span>
                <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                {option.hint && <span className="text-primary ml-1 text-xs">({option.hint})</span>}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="flex items-center gap-2">
            <Sparkles className="text-brand-teal h-4 w-4" />
            Prompt Assist
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value.assistProvider} onValueChange={handleProviderChange}>
            {PROMPT_ASSIST_PROVIDER_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
                {option.description && (
                  <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {value.assistProvider !== "off" && (
            <>
              <DropdownMenuSeparator />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuCheckboxItem
                        checked={value.assistDeep}
                        onCheckedChange={handleDeepChange}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Deep Brief Mode
                        <HelpCircle className="text-muted-foreground ml-1 h-3 w-3" />
                      </DropdownMenuCheckboxItem>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">
                      AI skapar först en detaljerad brief (specifikation) som sedan används för att
                      bygga en bättre prompt. Tar längre tid men ger mer genomtänkta resultat.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Expanded mode: show inline options (can be used in wizard final step)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Zap className="text-brand-amber h-4 w-4" />
          Modell
        </label>
        <div className="grid grid-cols-3 gap-2">
          {MODEL_TIER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleTierChange(option.value)}
              disabled={disabled}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-all ${
                value.modelTier === option.value
                  ? "border-brand-teal bg-brand-teal/20 text-brand-teal/80"
                  : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-center text-xs opacity-70">{option.description}</span>
              {option.hint && <span className="text-brand-teal text-xs">{option.hint}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Sparkles className="text-brand-teal h-4 w-4" />
          Prompt Assist
          <span className="text-xs font-normal text-gray-500">(förbättrar din prompt med AI)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PROMPT_ASSIST_PROVIDER_OPTIONS.slice(0, 3).map((option) => (
            <button
              key={option.value}
              onClick={() => handleProviderChange(option.value)}
              disabled={disabled}
              className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                value.assistProvider === option.value
                  ? "border-brand-teal bg-brand-teal/20 text-brand-teal/80"
                  : "border-gray-800 text-gray-400 hover:border-gray-700"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {value.assistProvider !== "off" && (
          <label className="mt-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.assistDeep}
              onChange={(e) => handleDeepChange(e.target.checked)}
              disabled={disabled}
              className="text-brand-teal focus:ring-brand-teal/50 rounded border-gray-700 bg-gray-900"
            />
            <span className="text-sm text-gray-300">Deep Brief Mode</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">
                    AI skapar först en detaljerad brief innan generation. Tar längre tid men ger mer
                    genomtänkta resultat.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
        )}
      </div>
    </div>
  );
}
