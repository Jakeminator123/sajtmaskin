"use client";

/**
 * F3 placeholder-toggle.
 *
 * Drops a single switch into the env panel: "Tillåt placeholders för
 * tier-3 i F3 (sajten kraschar vid riktiga API-anrop)". When ON, the F3
 * readiness gate accepts placeholder-covered keys with a warning instead
 * of blocking the build. Persists in `project_data.meta.allowPlaceholdersInF3`
 * via `PATCH /api/projects/[id]/preferences`.
 *
 * Default OFF — opt-in only, since enabling this lets a deploy succeed
 * with non-functional integrations.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string | null | undefined;
  className?: string;
  /**
   * Optional callback fired after a successful toggle so the caller can
   * refresh readiness without waiting for the next polling tick.
   */
  onChanged?: (allow: boolean) => void;
};

type PreferencesResponse = {
  success?: boolean;
  preferences?: { allowPlaceholdersInF3?: boolean };
  error?: string;
};

export function F3PlaceholderToggle({ projectId, className, onChanged }: Props) {
  const [allow, setAllow] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [pending, setPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${encodeURIComponent(projectId)}/preferences`, {
      method: "GET",
      credentials: "same-origin",
    })
      .then(async (res) => (await res.json()) as PreferencesResponse)
      .then((body) => {
        if (cancelled) return;
        setAllow(body.preferences?.allowPlaceholdersInF3 === true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (!projectId || pending) return;
      setPending(true);
      setError(null);
      const previous = allow;
      setAllow(next);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/preferences`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ allowPlaceholdersInF3: next }),
          },
        );
        const body = (await res.json()) as PreferencesResponse;
        if (!res.ok || body.success === false) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const persisted = body.preferences?.allowPlaceholdersInF3 === true;
        setAllow(persisted);
        onChanged?.(persisted);
      } catch (err) {
        setAllow(previous);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(false);
      }
    },
    [allow, onChanged, pending, projectId],
  );

  if (!projectId) return null;

  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px]",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="f3-placeholder-toggle"
              className="text-[11px] font-medium text-foreground"
            >
              Tillåt placeholders för tier-3 i F3
            </Label>
            <div className="flex items-center gap-1.5">
              {loading || pending ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : null}
              <Switch
                id="f3-placeholder-toggle"
                checked={allow}
                onCheckedChange={onToggle}
                disabled={loading || pending}
              />
            </div>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            När på: integrationsbygget passerar med placeholder-värden för secrets.
            Sajten deployas men integrationer som anropar riktiga API:er
            (Stripe, OpenAI, Resend …) kraschar tills du fyller i riktiga
            nycklar. Bra för att förhandsvisa innan affärsavtalen är klara.
          </p>
          {error ? (
            <p className="mt-1 text-[10px] text-red-400">Fel: {error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
