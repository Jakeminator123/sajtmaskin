"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export interface PreviewPanelF3TriggerProps {
  chatId: string;
  versionId?: string | null;
  /**
   * Called after a successful F3 trigger with `{ parentVersionId }`.
   * The parent component is responsible for invoking the chat-stream
   * with the appropriate `meta.lifecycleStage` + `meta.parentVersionId`.
   */
  onReady?: (payload: {
    parentVersionId: string;
    requirements: Array<{
      key: string;
      name: string;
      requiredRealEnvKeys: string[];
    }>;
  }) => void;
  /** Called when the readiness check finds missing tier-3 env keys. */
  onMissingEnv?: (payload: {
    parentVersionId: string;
    missingByIntegration: Array<{
      key: string;
      name: string;
      missing: string[];
    }>;
  }) => void;
  className?: string;
  /**
   * External "is the builder busy with another generation right now?" flag.
   * Disables the trigger so a second `/finalize-design` call (and the
   * follow-up auto-`sendMessage` from C3's `onReady`) cannot race the
   * stream that the previous click is currently running.
   */
  isBusy?: boolean;
}

type FinalizeDesignResponse = {
  ready: boolean;
  parentVersionId?: string;
  requirements?: Array<{
    key: string;
    name: string;
    requiredRealEnvKeys: string[];
  }>;
  missingByIntegration?: Array<{
    key: string;
    name: string;
    missing: string[];
  }>;
  message?: string;
};

/**
 * Minimal "Bygg integrationer" (F3) trigger button. Calls the
 * `/finalize-design` validator and surfaces missing env keys via toast +
 * the `onMissingEnv` callback. The actual F3 generation is kicked off by
 * the parent via the regular chat-stream endpoint with
 * `meta.lifecycleStage: "integrations"` and `meta.parentVersionId`.
 */
export function PreviewPanelF3Trigger({
  chatId,
  versionId,
  onReady,
  onMissingEnv,
  className,
  isBusy = false,
}: PreviewPanelF3TriggerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/engine/chats/${encodeURIComponent(chatId)}/finalize-design`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(versionId ? { versionId } : {}),
        },
      );

      const data = (await res.json().catch(() => ({}))) as FinalizeDesignResponse;

      if (res.status === 412 && data.parentVersionId) {
        const missing = data.missingByIntegration ?? [];
        const totalMissing = missing.reduce(
          (sum, entry) => sum + entry.missing.length,
          0,
        );
        // P26: surface the actual missing env-key names, not just a count,
        // so the user knows which secrets to add. Tidigare gav bara
        // räkning vilket lämnade användaren utan handlingsinformation.
        const missingKeyList = missing
          .flatMap((entry) =>
            entry.missing.map((envKey) => `${envKey} (${entry.name})`),
          )
          .slice(0, 6);
        const overflow = totalMissing > missingKeyList.length;
        toast.warning(
          `Saknar ${totalMissing} env-värde${totalMissing === 1 ? "" : "n"} för integrationsbygge`,
          {
            description: missingKeyList.length
              ? `${missingKeyList.join(", ")}${overflow ? ", …" : ""}`
              : undefined,
            duration: 8000,
          },
        );
        onMissingEnv?.({
          parentVersionId: data.parentVersionId,
          missingByIntegration: missing,
        });
        return;
      }

      if (!res.ok || !data.ready || !data.parentVersionId) {
        toast.error(data.message ?? "Kunde inte starta F3-bygget.");
        return;
      }

      toast.success("F3 redo att starta.");
      onReady?.({
        parentVersionId: data.parentVersionId,
        requirements: data.requirements ?? [],
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `F3-trigger fel: ${err.message}`
          : "F3-trigger fel.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [chatId, versionId, onReady, onMissingEnv]);

  // Block the click if we don't yet have a concrete versionId — otherwise
  // the request body becomes `{}` and the server can't anchor the F3 step
  // to a parent version. Discovered in Wave 5 race-condition audit.
  const noVersion = !versionId;
  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={handleClick}
      disabled={isLoading || isBusy || noVersion}
      title={
        isBusy
          ? "En annan generering pågår — vänta tills den är klar innan du startar F3-bygget."
          : noVersion
            ? "Vänta tills första versionen är skapad innan du startar F3-bygget."
            : "Lyft sajten till F3 / fidelity 3 — då frågas du efter riktiga env-värden för externa integrationer (Stripe, Klarna, Redis m.fl.)."
      }
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}
      <span className="ml-1.5">Bygg integrationer</span>
    </Button>
  );
}
