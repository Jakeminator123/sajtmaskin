"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, HelpCircle, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MODEL_TIER_OPTIONS, getDefaultCustomInstructions, isDefaultCustomInstructions } from "@/lib/builder/defaults";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import { SCAFFOLD_CLIENT_LIST } from "@/lib/gen/scaffolds/types";

const STORAGE_KEY = "sajtmaskin:advanced-panel-open";
const HINTS_SEEN_KEY = "sajtmaskin:advanced-hints-seen";

function readPanelState(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

const FIELD_HINTS: Record<string, string> = {
  model: "Välj AI-modell. 'Fast' är snabbast, 'Max' ger bäst kvalitet.",
  thinking: "Låt AI:n resonera längre innan den svarar — bättre för komplexa sajter.",
  scaffold: "Styr vilken teknisk grundmall som används. 'Auto' väljer baserat på din beskrivning.",
  instructions: "Skriv egna regler som AI:n alltid ska följa, t.ex. 'Använd bara svenska'.",
};

export interface AdvancedSettingsPanelProps {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;
  enableThinking: boolean;
  onEnableThinkingChange: (v: boolean) => void;
  isThinkingSupported: boolean;
  customInstructions: string;
  onCustomInstructionsChange: (v: string) => void;
  scaffoldMode: ScaffoldMode;
  scaffoldId: string | null;
  onScaffoldModeChange: (mode: ScaffoldMode) => void;
  onScaffoldIdChange: (id: string | null) => void;
  disabled?: boolean;
}

function FieldHint({ field }: { field: string }) {
  const hint = FIELD_HINTS[field];
  if (!hint) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/40 transition-colors hover:text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px] text-xs">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AdvancedSettingsPanel(props: AdvancedSettingsPanelProps) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    enableThinking,
    onEnableThinkingChange,
    isThinkingSupported,
    customInstructions,
    onCustomInstructionsChange,
    scaffoldMode,
    scaffoldId,
    onScaffoldModeChange,
    onScaffoldIdChange,
    disabled = false,
  } = props;

  const [isOpen, setIsOpen] = useState(readPanelState);
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      const seen = localStorage.getItem(HINTS_SEEN_KEY);
      if (!seen) {
        setShowHints(true);
        localStorage.setItem(HINTS_SEEN_KEY, "true");
      }
    }
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((v) => !v);
  }, []);

  const scaffolds = SCAFFOLD_CLIENT_LIST;
  const hasCustomInstructions = Boolean(customInstructions.trim()) && !isDefaultCustomInstructions(customInstructions);

  return (
    <div className="shrink-0 border-t border-border/30" data-advanced-panel>
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>Avancerat</span>
        {hasCustomInstructions && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="space-y-3 border-t border-border/20 px-3 py-3">
          {showHints && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
              Hovra över <HelpCircle className="inline h-3 w-3" /> för att lära dig mer om varje inställning.
            </div>
          )}

          {/* Model tier */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Modell</Label>
              <FieldHint field="model" />
            </div>
            <select
              value={selectedModelTier}
              onChange={(e) => onSelectedModelTierChange(e.target.value as ModelTier)}
              disabled={disabled}
              className="w-full rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {MODEL_TIER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Thinking mode */}
          {isThinkingSupported && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Resonemang</Label>
                <FieldHint field="thinking" />
              </div>
              <Switch
                checked={enableThinking}
                onCheckedChange={onEnableThinkingChange}
                disabled={disabled}
                className="scale-75"
              />
            </div>
          )}

          {/* Scaffold override */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Teknisk mall</Label>
              <FieldHint field="scaffold" />
            </div>
            <div className="flex gap-1">
              <select
                value={scaffoldMode}
                onChange={(e) => {
                  const mode = e.target.value as ScaffoldMode;
                  onScaffoldModeChange(mode);
                  if (mode !== "manual") onScaffoldIdChange(null);
                }}
                disabled={disabled}
                className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="auto">Auto</option>
                <option value="manual">Manuell</option>
                <option value="off">Av</option>
              </select>
              {scaffoldMode === "manual" && (
                <select
                  value={scaffoldId ?? ""}
                  onChange={(e) => onScaffoldIdChange(e.target.value || null)}
                  disabled={disabled}
                  className="min-w-0 flex-1 rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">Välj...</option>
                  {scaffolds.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Custom instructions */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Egna instruktioner</Label>
                <FieldHint field="instructions" />
              </div>
              {hasCustomInstructions && (
                <button
                  type="button"
                  onClick={() => onCustomInstructionsChange(getDefaultCustomInstructions(scaffoldMode))}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground"
                >
                  Återställ
                </button>
              )}
            </div>
            <Textarea
              value={customInstructions}
              onChange={(e) => onCustomInstructionsChange(e.target.value)}
              disabled={disabled}
              placeholder="T.ex. 'Använd alltid svenska texter' eller 'Minimalistisk design'"
              rows={3}
              className="resize-none text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
