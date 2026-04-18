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
        toast.warning(
          `Lägg in ${totalMissing} env-värde${totalMissing === 1 ? "" : "n"} innan du kan bygga integrationer.`,
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

  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={handleClick}
      disabled={isLoading}
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
