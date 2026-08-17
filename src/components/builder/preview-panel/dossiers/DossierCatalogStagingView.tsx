"use client";

import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DossierCatalogEntry } from "@/lib/builder/dossier-catalog";
import {
  buildDossierStagingLines,
  defaultDossierStagingAnswer,
  getDossierStagingSpec,
  type DossierStagingAnswer,
} from "@/lib/builder/dossier-staging";

export function DossierCatalogStagingView({
  entry,
  stage,
  confirmed,
  catalogPickDisabled,
  projectId,
  keyValues,
  setKeyValues,
  saving,
  saveError,
  saveConfirmation,
  onSaveKeys,
  onConfirm,
  onCancel,
}: {
  entry: DossierCatalogEntry;
  stage: "design" | "integrations";
  confirmed: boolean;
  catalogPickDisabled: boolean;
  projectId: string | null;
  keyValues: Record<string, string>;
  setKeyValues: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  saveError: string | null;
  saveConfirmation: boolean;
  onSaveKeys: () => void;
  onConfirm: (stagingLines?: string[]) => void;
  onCancel: () => void;
}) {
  const spec = getDossierStagingSpec(entry.id);
  const [answer, setAnswer] = useState<DossierStagingAnswer>(() =>
    defaultDossierStagingAnswer(spec),
  );
  const envVars = entry.envVars ?? [];
  const showKeys = entry.class === "hard" && envVars.length > 0;
  const showF2HardNotice = stage !== "integrations" && entry.class === "hard";
  const filledKeyCount = envVars.filter(
    (env) => (keyValues[env.key] ?? "").trim().length > 0,
  ).length;

  const confirmDisabled = catalogPickDisabled || confirmed;

  const stagingLines = useMemo(
    () => buildDossierStagingLines(spec, answer),
    [answer, spec],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border border-gray-800 bg-black/20 px-3 py-3">
        <p className="text-sm font-medium text-gray-100">{entry.label}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {confirmed ? "Tillagt via chatten" : "Valt, ej tillagt"}
        </p>
        {showF2HardNotice ? (
          <p className="mt-2 text-xs text-sky-200" aria-live="polite">
            I designen visas en demo. Kör &quot;Bygg integrationer&quot; för
            riktig funktion.
          </p>
        ) : null}
      </div>

      {confirmed ? (
        <p className="text-xs text-gray-400">
          Byggblocket &quot;{entry.label}&quot; läggs till via chatten.
        </p>
      ) : (
        <>
          {spec.kind === "placement" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-200">
                {spec.question}
              </legend>
              <div className="space-y-1">
                {spec.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-2 text-xs text-gray-300"
                  >
                    <input
                      type="radio"
                      name={`dossier-staging-${entry.id}`}
                      value={option.id}
                      checked={
                        answer.kind === "placement" && answer.optionId === option.id
                      }
                      onChange={() =>
                        setAnswer({ kind: "placement", optionId: option.id })
                      }
                      className="mt-0.5"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {spec.kind === "content" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-200">
                {spec.question}
              </span>
              <Input
                type="text"
                value={answer.kind === "content" ? answer.text : spec.defaultText}
                onChange={(event) =>
                  setAnswer({ kind: "content", text: event.target.value })
                }
                placeholder={spec.defaultText}
                className="h-8 border-gray-700 bg-black/30 text-xs"
              />
            </label>
          ) : null}

          {showKeys ? (
            <div className="space-y-3 border-t border-gray-800 pt-3">
              <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                Nycklar (valfritt)
              </p>
              <p className="text-xs text-gray-500">Utan nyckel körs demo.</p>
              <ul className="space-y-2">
                {envVars.map((env) => (
                  <li key={env.key} className="space-y-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <code className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-[11px] text-gray-200">
                        {env.key}
                      </code>
                      {env.required ? (
                        <span className="text-[11px] text-gray-500">rekommenderad</span>
                      ) : null}
                      {env.setupUrl ? (
                        <a
                          href={env.setupUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                        >
                          Hämta värde
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      <Input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`Värde för ${env.key}`}
                        value={keyValues[env.key] ?? ""}
                        disabled={!projectId || saving}
                        onChange={(event) =>
                          setKeyValues((current) => ({
                            ...current,
                            [env.key]: event.target.value,
                          }))
                        }
                        placeholder={
                          projectId ? "Klistra in riktigt värde" : "Projekt saknas"
                        }
                        className="h-8 border-gray-700 bg-black/30 text-xs"
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={!projectId || saving || filledKeyCount === 0}
                onClick={() => void onSaveKeys()}
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Spara nyckel
              </Button>
              {!projectId ? (
                <p className="text-xs text-gray-500">
                  Nycklar kan sparas när chatten är kopplad till ett projekt.
                </p>
              ) : null}
              {saveError ? (
                <p className="text-xs text-rose-300">{saveError}</p>
              ) : null}
              {saveConfirmation ? (
                <p className="text-xs text-emerald-300">
                  Nyckeln sparad. Previewn startas om.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={confirmDisabled}
              onClick={() => onConfirm(stagingLines)}
            >
              Lägg till i sajten
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs text-gray-400"
              disabled={confirmed}
              onClick={onCancel}
            >
              Avbryt
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
