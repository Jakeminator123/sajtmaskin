"use client";

import type { ModelTraceSnapshot } from "@/lib/models/trace";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "sajtmaskin:model-trace-overlay";

type ModelTraceOverlayProps = {
  selectedModelTier: string;
  promptAssistModel: string;
  promptAssistDeep: boolean;
  enableThinking: boolean;
  canUseDeepBrief: boolean;
};

function statusChipClass(ok: boolean) {
  return ok
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-red-500/30 bg-red-500/10 text-red-200";
}

function providerLabel(value: string) {
  if (value === "off") return "Off";
  if (value === "v0") return "v0";
  if (value === "openai") return "OpenAI";
  if (value === "anthropic") return "Anthropic";
  if (value === "unknown") return "Unknown";
  if (value === "gateway") return "Gateway";
  return value;
}

function boolLabel(value: boolean) {
  return value ? "On" : "Off";
}

export function ModelTraceOverlay(props: ModelTraceOverlayProps) {
  const { selectedModelTier, promptAssistModel, promptAssistDeep, enableThinking, canUseDeepBrief } =
    props;
  const [isVisible, setIsVisible] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ModelTraceSnapshot | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const queryValue = searchParams.get("modelTrace");

    if (queryValue === "1") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      setIsVisible(true);
    } else if (queryValue === "0") {
      window.localStorage.removeItem(STORAGE_KEY);
      setIsVisible(false);
    } else {
      setIsVisible(window.localStorage.getItem(STORAGE_KEY) === "1");
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.key.toLowerCase() === "m")) return;
      event.preventDefault();
      setIsVisible((prev) => {
        const next = !prev;
        if (next) {
          window.localStorage.setItem(STORAGE_KEY, "1");
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({
      modelTier: selectedModelTier,
      promptAssistModel,
      promptAssistDeep: String(promptAssistDeep),
      thinking: String(enableThinking),
      canUseDeepBrief: String(canUseDeepBrief),
    });
    return `/api/ai/model-trace?${params.toString()}`;
  }, [canUseDeepBrief, enableThinking, promptAssistDeep, promptAssistModel, selectedModelTier]);

  useEffect(() => {
    if (!isVisible) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void fetch(requestUrl, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Model trace failed (${response.status})`);
        }
        const data = (await response.json()) as ModelTraceSnapshot;
        setSnapshot(data);
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load model trace.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [isVisible, refreshNonce, requestUrl]);

  if (!isVisible) return null;

  const selected = snapshot?.selected ?? null;

  return (
    <aside className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-[min(92vw,28rem)] justify-end">
      <div className="pointer-events-auto w-full rounded-xl border border-white/10 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-400">
              Model Trace
            </p>
            <p className="text-xs text-slate-300">
              Builder routing, env mapping, and active model lanes
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md border border-white/10 p-1.5 text-slate-300 transition hover:bg-white/5 hover:text-white"
              onClick={() => setRefreshNonce((value) => value + 1)}
              title="Refresh trace"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            </button>
            <button
              type="button"
              className="rounded-md border border-white/10 p-1.5 text-slate-300 transition hover:bg-white/5 hover:text-white"
              onClick={() => setIsCollapsed((value) => !value)}
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              className="rounded-md border border-white/10 p-1.5 text-slate-300 transition hover:bg-white/5 hover:text-white"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(STORAGE_KEY);
                }
                setIsVisible(false);
              }}
              title="Hide overlay"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="space-y-3 px-3 py-3 text-xs">
            {error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200">
                {error}
              </div>
            ) : null}

            {selected && snapshot ? (
              <>
                <section className="space-y-2">
                  <div className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
                    <span className="text-slate-400">Byggmodell</span>
                    <span>
                      {selected.buildProfileLabel} ({selected.buildTier})
                    </span>

                    <span className="text-slate-400">Resolved build</span>
                    <span>{selected.buildModel}</span>

                    <span className="text-slate-400">Provider</span>
                    <span>{providerLabel(selected.buildProvider)}</span>

                    <span className="text-slate-400">Thinking</span>
                    <span>{boolLabel(selected.thinkingRequested)}</span>

                    <span className="text-slate-400">Forbattra</span>
                    <span>{selected.promptAssistLabel}</span>

                    <span className="text-slate-400">Assist model</span>
                    <span className="break-all">{selected.promptAssistModel}</span>

                    <span className="text-slate-400">Assist provider</span>
                    <span>{providerLabel(selected.promptAssistProvider)}</span>

                    <span className="text-slate-400">Deep brief</span>
                    <span>
                      {selected.promptAssistDeepActive
                        ? "Active"
                        : selected.promptAssistDeepRequested
                          ? "Requested but inactive"
                          : "Off"}
                    </span>

                    <span className="text-slate-400">Skriv om</span>
                    <span className="break-all">{selected.polishModel}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-1 text-[11px]",
                        statusChipClass(selected.buildKnownCatalogModel),
                      )}
                    >
                      Build catalog: {selected.buildKnownCatalogModel ? "known" : "unknown"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-1 text-[11px]",
                        statusChipClass(selected.promptAssistAllowed),
                      )}
                    >
                      Assist allowlist: {selected.promptAssistAllowed ? "ok" : "blocked"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-1 text-[11px]",
                        statusChipClass(selected.polishModelAllowed),
                      )}
                    >
                      Polish allowlist: {selected.polishModelAllowed ? "ok" : "blocked"}
                    </span>
                  </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-white/3 p-2">
                  <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
                    Provider auth
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-2 py-1", statusChipClass(snapshot.auth.openai))}>
                      OpenAI key: {snapshot.auth.openai ? "set" : "missing"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-1",
                        statusChipClass(snapshot.auth.anthropic),
                      )}
                    >
                      Anthropic key: {snapshot.auth.anthropic ? "set" : "missing"}
                    </span>
                    <span className={cn("rounded-full border px-2 py-1", statusChipClass(snapshot.auth.v0PlatformConfigured))}>
                      v0 key: {snapshot.auth.v0PlatformConfigured ? "set" : "missing"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-1",
                        statusChipClass(snapshot.auth.aiGatewayApiKey || snapshot.auth.vercelOidcToken || snapshot.auth.onVercel),
                      )}
                    >
                      Gateway auth:{" "}
                      {snapshot.auth.aiGatewayApiKey
                        ? "api-key"
                        : snapshot.auth.vercelOidcToken
                          ? "oidc"
                          : snapshot.auth.onVercel
                            ? "vercel"
                            : "missing"}
                    </span>
                  </div>
                </section>

                {snapshot.warnings.length > 0 ? (
                  <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
                    <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
                      Warnings
                    </p>
                    <ul className="space-y-1">
                      {snapshot.warnings.map((warning) => (
                        <li key={warning}>- {warning}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <details className="rounded-lg border border-white/10 bg-white/3 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
                    Active Routes
                  </summary>
                  <div className="mt-2 space-y-2">
                    {snapshot.routes.map((route) => (
                      <div key={route.key} className="rounded-md border border-white/10 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-100">{route.label}</span>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                              route.active
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                : "border-white/10 bg-white/4 text-slate-400",
                            )}
                          >
                            {route.active ? "active" : "idle"}
                          </span>
                        </div>
                        <p className="mt-1 break-all text-slate-300">{route.route}</p>
                        <p className="mt-1 text-slate-400">{route.purpose}</p>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="rounded-lg border border-white/10 bg-white/3 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
                    Build Profiles
                  </summary>
                  <div className="mt-2 space-y-2">
                    {snapshot.buildProfiles.map((profile) => (
                      <div key={profile.id} className="rounded-md border border-white/10 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-100">
                            {profile.uiLabel} ({profile.id})
                          </span>
                          <span className="text-slate-400">{providerLabel(profile.provider)}</span>
                        </div>
                        <p className="mt-1 text-slate-300">{profile.configuredModel}</p>
                        <p className="mt-1 text-slate-400">{profile.uiDescription}</p>
                        {profile.warnings.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-amber-200">
                            {profile.warnings.map((warning) => (
                              <li key={warning}>- {warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>

                <details className="rounded-lg border border-white/10 bg-white/3 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
                    Prompt Assist Options
                  </summary>
                  <div className="mt-2 space-y-2">
                    {snapshot.promptAssistOptions.map((option) => (
                      <div key={option.value} className="rounded-md border border-white/10 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-100">{option.label}</span>
                          <span className="text-slate-400">{providerLabel(option.provider)}</span>
                        </div>
                        <p className="mt-1 break-all text-slate-300">{option.value}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5",
                              statusChipClass(option.allowed),
                            )}
                          >
                            allowlist: {option.allowed ? "ok" : "blocked"}
                          </span>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5",
                              statusChipClass(option.deepBriefEligible),
                            )}
                          >
                            deep brief: {option.deepBriefEligible ? "yes" : "no"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                <section className="rounded-lg border border-white/10 bg-white/3 p-2 text-slate-300">
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
                    Notes
                  </p>
                  <ul className="space-y-1">
                    {snapshot.notes.map((note) => (
                      <li key={note}>- {note}</li>
                    ))}
                  </ul>
                </section>
              </>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/3 px-3 py-2 text-slate-300">
                {isLoading ? "Loading model trace..." : "No model trace loaded yet."}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
