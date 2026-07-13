"use client";

import { AlertCircle, CheckCircle2, Info, KeyRound, Loader2, Wand2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dispatchProjectEnvVarsUpdated } from "@/lib/builder/project-env-events";

export type F3MissingIntegration = {
  key: string;
  name: string;
  missing: string[];
};

export type F3BuilderStatus = {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
};

interface F3RequirementsSurfaceProps {
  projectId: string | null;
  chatId: string | null;
  versionId: string | null;
  missingByIntegration: F3MissingIntegration[];
  onRetry: () => void;
}

type EnvVarsResponse = {
  success?: boolean;
  error?: string;
};

const STATUS_STYLES: Record<F3BuilderStatus["tone"], string> = {
  info: "border-sky-500/40 bg-sky-500/5 text-sky-100",
  warning: "border-amber-500/40 bg-amber-500/5 text-amber-100",
  error: "border-rose-500/40 bg-rose-500/5 text-rose-100",
  success: "border-emerald-500/40 bg-emerald-500/5 text-emerald-100",
};

export function F3StatusSurface({ status }: { status: F3BuilderStatus }) {
  const Icon =
    status.tone === "success" ? CheckCircle2 : status.tone === "info" ? Info : AlertCircle;

  return (
    <section
      aria-label="Status för integrationsbygge"
      aria-live="polite"
      className={`mx-3 mt-2 rounded-md border p-3 text-xs ${STATUS_STYLES[status.tone]}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <h2 className="font-medium">{status.title}</h2>
          <p className="mt-1 opacity-90">{status.description}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Persistent, non-modal F3 blocker shown only after an explicit
 * "Bygg integrationer" request receives a 412 from finalize-design.
 *
 * The server owns both the integration grouping and the build-key scope. This
 * surface deliberately renders that payload as-is rather than re-detecting
 * integrations from the client, which could demand a broader set of keys.
 */
export function F3RequirementsSurface({
  projectId,
  chatId,
  versionId,
  missingByIntegration,
  onRetry,
}: F3RequirementsSurfaceProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueKeys = useMemo(
    () =>
      Array.from(
        new Set(
          missingByIntegration.flatMap((integration) =>
            integration.missing.map((key) => key.trim()).filter(Boolean),
          ),
        ),
      ),
    [missingByIntegration],
  );
  const filledKeys = uniqueKeys.filter((key) => (values[key] ?? "").trim().length > 0);

  const handleSave = useCallback(async () => {
    if (!projectId || isSaving || filledKeys.length === 0) return;

    setIsSaving(true);
    setError(null);
    try {
      const vars = filledKeys.map((key) => ({
        key,
        value: values[key].trim(),
        sensitive: true,
      }));
      const response = await fetch(
        `/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vars, upsert: true }),
        },
      );
      const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
      if (!response.ok || !data?.success) {
        setError(data?.error || "Kunde inte spara miljövariabler.");
        return;
      }
      setValues({});
      dispatchProjectEnvVarsUpdated({
        projectId,
        chatId,
        versionId,
        envKeys: filledKeys,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Kunde inte spara miljövariabler: ${saveError.message}`
          : "Kunde inte spara miljövariabler.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [chatId, filledKeys, isSaving, projectId, values, versionId]);

  return (
    <section
      aria-label="Krav för integrationsbygge"
      className="border-border mx-3 mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
    >
      <div className="flex items-start gap-2">
        {missingByIntegration.length === 0 ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        )}
        <div>
          <h2 className="font-medium text-amber-100">Krav för integrationsbygge</h2>
          <p className="mt-1 text-amber-100/80">
            {missingByIntegration.length === 0
              ? "Alla nycklar är sparade — fortsätt integrationsbygget."
              : "Designpreviewn är kvar i F2. Spara riktiga värden nedan (eller under Byggblock i previewen) och fortsätt sedan integrationsbygget."}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {missingByIntegration.map((integration) => (
          <div
            key={`${integration.key}:${integration.name}`}
            className="rounded-md border border-border/80 bg-background/50 p-2.5"
          >
            <p className="font-medium text-foreground">{integration.name}</p>
            <div className="mt-2 space-y-2">
              {integration.missing.map((key) => (
                <label key={`${integration.key}:${key}`} className="block space-y-1">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <KeyRound className="h-3 w-3" />
                    <code className="text-foreground text-[11px]">{key}</code>
                  </span>
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={values[key] ?? ""}
                    disabled={!projectId || isSaving}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [key]: event.target.value }))
                    }
                    placeholder={projectId ? "Klistra in riktigt värde" : "Projekt saknas"}
                    className="h-8 text-xs"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!projectId ? (
        <p className="mt-3 text-[11px] text-amber-200">
          Miljövariabler kan sparas när chatten är kopplad till ett projekt.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[11px] text-rose-300">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {uniqueKeys.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            disabled={!projectId || isSaving || filledKeys.length === 0}
          >
            {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {filledKeys.length > 0
              ? `Spara ${filledKeys.length} ${filledKeys.length === 1 ? "nyckel" : "nycklar"}`
              : "Spara nycklar"}
          </Button>
        ) : null}
        <Button size="sm" onClick={onRetry} disabled={isSaving}>
          <Wand2 className="mr-1 h-3.5 w-3.5" />
          Fortsätt integrationsbygget
        </Button>
      </div>
    </section>
  );
}
