"use client";

/**
 * SEO opt-in panel for the deploy ("Bygg") dialog.
 *
 * Controlled component: parent owns the form state so it can pass the
 * value to the deploy POST body (`/api/v0/deployments`). On mount this
 * panel loads the persisted preferences for the project (so the user
 * sees their previous choice prefilled) and seeds the parent via
 * `onChange`.
 *
 * Scope (PR-B):
 * - Switch: "Optimera för Google" (optIn)
 * - Input: site URL (required when optIn=true)
 * - Brand fields are NOT exposed in v1 — they live in the schema so the
 *   API/persisted preferences can carry them, but the deploy dialog
 *   stays minimal. Brand UI can be added later without touching the
 *   wire format.
 *
 * Validation: optIn=true with empty/invalid URL is surfaced as a local
 * error and disables the parent's confirm button via `onValidityChange`.
 *
 * Persisting: the deploy handler (`useBuilderDeployActions.handleConfirmDeploy`)
 * is responsible for persisting the value via PATCH /preferences before
 * deploying — the panel itself only edits the in-memory form value.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SeoFormValue = {
  optIn: boolean;
  siteUrl: string;
};

type Props = {
  projectId: string | null | undefined;
  value: SeoFormValue;
  onChange: (next: SeoFormValue) => void;
  /**
   * Notify parent whether current value is valid (optIn=false is always
   * valid; optIn=true requires a non-empty siteUrl that parses as a URL).
   */
  onValidityChange?: (valid: boolean) => void;
  /**
   * Notify parent when the user actually interacts with the panel (toggles
   * the switch or types in the URL field). Fetch-seeded values do NOT
   * count as user-interaction — this distinction lets the parent decide
   * whether to send `seo` in the deploy body or fall back to persisted
   * preferences. Without this guard, a fast Publicera-click before the
   * fetch returns would overwrite persisted opt-in with the default
   * (false) state. See SEO-F3-PROMOTION-NEXT-PR.md regression notes.
   */
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
  className?: string;
};

type PreferencesResponse = {
  success?: boolean;
  preferences?: {
    seo?: {
      optIn?: boolean;
      siteUrl?: string | null;
    };
  };
  error?: string;
};

function isValidHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function SeoOptInPanel({
  projectId,
  value,
  onChange,
  onValidityChange,
  onDirtyChange,
  disabled,
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tracks whether the user has touched the controls. Fetch-seeded
  // values must NOT mark dirty — see `onDirtyChange` JSDoc.
  const dirtyRef = useRef(false);
  const switchId = useId();
  const inputId = useId();

  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      onDirtyChange?.(true);
    }
  }, [onDirtyChange]);

  // Load persisted preferences once on mount and seed parent state.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/projects/${encodeURIComponent(projectId)}/preferences`, {
      method: "GET",
      credentials: "same-origin",
    })
      .then(async (res) => (await res.json()) as PreferencesResponse)
      .then((body) => {
        if (cancelled) return;
        const seo = body.preferences?.seo;
        if (seo) {
          onChange({
            optIn: seo.optIn === true,
            siteUrl: typeof seo.siteUrl === "string" ? seo.siteUrl : "",
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Report validity upward whenever value changes.
  const urlValid = value.optIn ? isValidHttpUrl(value.siteUrl) : true;
  useEffect(() => {
    onValidityChange?.(urlValid);
  }, [urlValid, onValidityChange]);

  const onToggle = useCallback(
    (next: boolean) => {
      markDirty();
      onChange({ ...value, optIn: next });
    },
    [markDirty, onChange, value],
  );

  const onUrlChange = useCallback(
    (next: string) => {
      markDirty();
      onChange({ ...value, siteUrl: next });
    },
    [markDirty, onChange, value],
  );

  const showUrlError = value.optIn && value.siteUrl.trim().length > 0 && !urlValid;
  const showRequiredError = value.optIn && value.siteUrl.trim().length === 0;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/20 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor={switchId}
              className="text-xs font-medium text-foreground"
            >
              Optimera för Google
            </Label>
            <div className="flex items-center gap-1.5">
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : null}
              <Switch
                id={switchId}
                checked={value.optIn}
                onCheckedChange={onToggle}
                disabled={disabled || loading}
              />
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            När på: vi lägger till robots.txt, sitemap.xml, social-bilder
            (Open Graph) och fyller i metadata på sajten — så Google och
            sociala medier visar den korrekt. Behöver din slutgiltiga
            URL.
          </p>

          {value.optIn ? (
            <div className="space-y-1">
              <Label
                htmlFor={inputId}
                className="text-[11px] font-medium text-foreground"
              >
                Sajtens URL
              </Label>
              <Input
                id={inputId}
                value={value.siteUrl}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://example.com"
                disabled={disabled}
                className="h-8 text-xs"
                inputMode="url"
                spellCheck={false}
                autoComplete="url"
                aria-invalid={showUrlError ? true : undefined}
              />
              {showRequiredError ? (
                <p className="text-[10px] text-amber-500">
                  Ange URL för att aktivera SEO.
                </p>
              ) : null}
              {showUrlError ? (
                <p className="text-[10px] text-red-400">
                  Ogiltig URL. Måste börja med http:// eller https://.
                </p>
              ) : null}
              <p className="text-[10px] leading-snug text-muted-foreground">
                Använd din slutgiltiga domän om du har en. Annars
                den publicerade adressen (namn.vercel.app). Du kan ändra senare och
                publicera om.
              </p>
            </div>
          ) : null}

          {loadError ? (
            <p className="text-[10px] text-red-400">
              Kunde inte läsa SEO-inställningar: {loadError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
