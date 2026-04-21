"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { VersionMismatchOverlayPayload } from "@/lib/gen/preview/preview-host-client";

/**
 * Non-blocking overlay shown over the preview iframe during the transient
 * window where the app has finalized a new version but the preview-VM is
 * still booting / rebuilding the previous one. Without it the iframe would
 * display ~5–10 seconds of white screen and the user can't tell whether
 * something broke or it's just restarting.
 *
 * Type contract: {@link VersionMismatchOverlayPayload} (defined in
 * `src/lib/gen/preview/preview-host-client.ts`). Dispatch path is the
 * separate concern of whichever poll/SSE pipeline detects the mismatch
 * server-side; this component is the consumer half — render it whenever a
 * payload is set, hide it whenever it's null.
 *
 * Owner: P25b-rest (UX polish flyttad från P25). See
 * `docs/plans/avklarat/P25-builder-ui-and-csp-hygiene.md`.
 */
export interface VersionMismatchOverlayProps {
  payload: VersionMismatchOverlayPayload;
  /**
   * Optional manual-refresh handler. Wired to whatever the preview panel
   * uses to force-restart the VM (typically the same callback as the
   * iframe-reload button).
   */
  onForceRestart?: () => void;
}

function formatElapsed(msSinceMismatch: number): string {
  if (msSinceMismatch < 1_000) return "<1s";
  const seconds = Math.round(msSinceMismatch / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
}

export function VersionMismatchOverlay({
  payload,
  onForceRestart,
}: VersionMismatchOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      data-testid="version-mismatch-overlay"
    >
      <div className="mx-4 max-w-md rounded-lg border border-amber-500/40 bg-amber-950/85 p-4 text-amber-50 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold">Preview startar om</h4>
            <p className="mt-1 text-[12px] leading-snug text-amber-100/90">
              VM:en kör fortfarande en tidigare version. Den nya filerna
              installeras och servern startar om — vanligtvis 5–10 sekunder.
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-amber-200/80">
              <dt>Förväntad version</dt>
              <dd className="font-mono">{payload.expectedVersionId.slice(0, 8)}</dd>
              <dt>Aktuell i VM</dt>
              <dd className="font-mono">
                {payload.currentVersionId
                  ? payload.currentVersionId.slice(0, 8)
                  : "okänd"}
              </dd>
              <dt>Tid sedan</dt>
              <dd>{formatElapsed(payload.msSinceMismatch)}</dd>
            </dl>
            {onForceRestart ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                <span className="text-[11px] text-amber-200/80">
                  Försök tar normalt ~10 sekunder. Tryck om det dröjer mer än 30s.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 border-amber-400/40 bg-amber-900/40 text-[11px] text-amber-50 hover:bg-amber-800/60"
                  onClick={onForceRestart}
                >
                  Försök igen
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                <span className="text-[11px] text-amber-200/80">
                  Vänta tills omstarten är klar — preview uppdateras automatiskt.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
