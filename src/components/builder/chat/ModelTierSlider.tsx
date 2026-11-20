"use client";

import { Slider } from "@/components/ui/slider";
import { MODEL_TIER_OPTIONS } from "@/lib/builder/defaults";
import { SELECTABLE_MODEL_IDS, isSelectableModelId } from "@/lib/models/catalog";
import { cn } from "@/lib/utils";
import type { ModelTier } from "@/lib/validations/chat-schemas";
import { useLayoutEffect, useRef } from "react";

const MAX_INDEX = SELECTABLE_MODEL_IDS.length - 1;
/** Hidden persisted `codex` is shown as Mellan until the user moves the slider. */
const HIDDEN_TIER_DISPLAY = "max";

function selectableIndex(tier: ModelTier): number {
  if (isSelectableModelId(tier)) {
    return SELECTABLE_MODEL_IDS.indexOf(tier);
  }
  return SELECTABLE_MODEL_IDS.indexOf(HIDDEN_TIER_DISPLAY);
}

/**
 * Modellnivå som en rad: etikett, reglage, valt värde. Värdet stod förut
 * ovanpå reglaget i en 148 px bred ruta, där tummen (16 px, absolut placerad
 * av Radix) ritades över texten eftersom spåret bara är 6 px högt. Reglaget
 * har nu tummens höjd, och värdet står bredvid i stället för ovanför.
 */
export function ModelTierSlider({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ModelTier;
  onChange: (value: ModelTier) => void;
  disabled?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const displayIndex = selectableIndex(value);
  const option = MODEL_TIER_OPTIONS[displayIndex] ?? MODEL_TIER_OPTIONS[1];
  const label = option.label;

  useLayoutEffect(() => {
    const thumb = rootRef.current?.querySelector<HTMLElement>('[role="slider"]');
    thumb?.setAttribute("aria-valuetext", label);
  }, [label]);

  return (
    <div
      ref={rootRef}
      className={cn(
        // min-w-48: etikett + reglage (min 56 px) + värde (56 px) + luft ryms.
        "border-border/70 bg-background/80 flex h-8 min-w-48 flex-1 items-center gap-2.5 rounded-lg border px-2.5",
        className,
      )}
      title={option.description}
      data-testid="model-tier-slider"
    >
      <span className="text-muted-foreground shrink-0 text-[11px] font-medium" aria-hidden="true">
        Modell
      </span>
      <Slider
        aria-label="Modellväg"
        aria-valuetext={label}
        min={0}
        max={MAX_INDEX}
        step={1}
        value={[displayIndex]}
        disabled={disabled}
        onValueChange={(values) => {
          const nextIndex = values[0];
          if (nextIndex == null || nextIndex === displayIndex) return;
          const next = SELECTABLE_MODEL_IDS[nextIndex];
          if (next) onChange(next);
        }}
        // Tummens höjd, så den ryms i raden i stället för att sticka ut.
        className="h-4 min-w-14 flex-1"
      />
      {/* Fast bredd för den längsta nivån («Extra hög»), så raden inte hoppar. */}
      <span
        className="text-foreground w-14 shrink-0 text-right text-[11px] leading-none font-medium"
        aria-hidden="true"
        data-testid="model-tier-value"
      >
        {label}
      </span>
    </div>
  );
}
