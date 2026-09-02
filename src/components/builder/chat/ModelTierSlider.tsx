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
        "border-border inline-flex w-[148px] shrink-0 flex-col justify-center gap-0.5 rounded border px-1.5 py-1",
        className,
      )}
      title={option.description}
    >
      <span className="text-foreground text-[10px] leading-none font-medium">{label}</span>
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
        className="w-full"
      />
    </div>
  );
}
