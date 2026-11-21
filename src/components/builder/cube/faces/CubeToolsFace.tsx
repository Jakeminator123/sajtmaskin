"use client";

/**
 * Verktyg som egen yta i byggkuben: reglagen som annars ligger i headerns
 * meny och i komposerns verktygsrad, samlade på ett ställe.
 *
 * Ytan äger inget tillstånd. Varje reglage läser och skriver samma värde som
 * sin förlaga i builderns vy-modell, så det spelar ingen roll var användaren
 * ändrar det.
 *
 * Sajtagentens befogenheter (`OpenClawPowersControl`) finns inte här: de står
 * vid inmatningen, där de avgör vad nästa meddelande får göra, och kontrollen
 * hämtar chattens sparade val när den monteras — två instanser vore två
 * hämtningar som tävlar.
 */

import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import type { ModelTier } from "@/lib/validations/chat-schemas";
import { ModelTierSlider } from "../../chat/ModelTierSlider";

export interface CubeToolsFaceProps {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;
  /** «Sajtagenten kommenterar efter varje bygge». */
  digestEnabled: boolean;
  onDigestEnabledChange: (enabled: boolean) => void;
  enableThinking: boolean;
  onEnableThinkingChange: (enabled: boolean) => void;
  enableImageGenerations: boolean;
  onEnableImageGenerationsChange: (enabled: boolean) => void;
  imageGenerationsSupported: boolean;
  /** Ett bygge pågår: byggvalen låses som i headern. */
  locked: boolean;
  /** Sajtagentens yta finns i den här miljön. */
  agentConfigured: boolean;
}

function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ToolSwitch({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-foreground block text-xs font-medium">
          {label}
        </label>
        <p id={`${id}-description`} className="text-muted-foreground text-[11px] leading-4">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={`${id}-description`}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function CubeToolsFace({
  selectedModelTier,
  onSelectedModelTierChange,
  digestEnabled,
  onDigestEnabledChange,
  enableThinking,
  onEnableThinkingChange,
  enableImageGenerations,
  onEnableImageGenerationsChange,
  imageGenerationsSupported,
  locked,
  agentConfigured,
}: CubeToolsFaceProps) {
  return (
    <div className="h-full min-h-0 space-y-5 overflow-y-auto px-3 py-3" data-testid="cube-tools">
      {agentConfigured ? (
        <ToolSection title="Sajtagenten">
          <ToolSwitch
            label="Kommenterar efter varje bygge"
            description="Sajtagenten säger kort vad som ändrades och föreslår ett nästa steg."
            checked={digestEnabled}
            onCheckedChange={onDigestEnabledChange}
            disabled={locked}
          />
          <p className="text-muted-foreground text-[11px] leading-4">
            Vad Sajtagenten får göra väljer du vid inmatningen, under Chatt.
          </p>
        </ToolSection>
      ) : null}

      <ToolSection title="Bygget">
        <ModelTierSlider
          value={selectedModelTier}
          onChange={onSelectedModelTierChange}
          disabled={locked}
          className="w-full"
        />
        <ToolSwitch
          label="Resonemang"
          description="Modellen tänker igenom uppgiften innan den skriver. Ger ofta bättre resultat, men tar längre tid."
          checked={enableThinking}
          onCheckedChange={onEnableThinkingChange}
          disabled={locked}
        />
        <ToolSwitch
          label="AI-bilder"
          description={
            imageGenerationsSupported
              ? "Bygget får skapa egna bilder till sajten."
              : "Inte tillgängligt i den här miljön."
          }
          checked={enableImageGenerations && imageGenerationsSupported}
          onCheckedChange={onEnableImageGenerationsChange}
          disabled={locked || !imageGenerationsSupported}
        />
      </ToolSection>
    </div>
  );
}
