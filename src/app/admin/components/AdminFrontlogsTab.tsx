"use client";

import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FrontlogEntry, FrontlogsPayload } from "./types";

interface AdminFrontlogsTabProps {
  frontlogs: FrontlogsPayload | null;
  frontlogsLoading: boolean;
  frontlogsError: string | null;
  selectedSlug: string | null;
  onSlugChange: (slug: string | null) => void;
  onRefresh: () => void | Promise<void>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

function summarizeEntry(entry: FrontlogEntry) {
  const type = readString(entry.data.type) || "okänd typ";
  const message = readString(entry.data.message);
  const model =
    readString(entry.data.modelId) ||
    readString(entry.data.model) ||
    readString(entry.data.modelTier);
  const chatId = readString(entry.data.chatId);
  const versionId = readString(entry.data.versionId);
  const durationMs = readNumber(entry.data.durationMs);

  return {
    type,
    message,
    model,
    chatId,
    versionId,
    durationMs,
  };
}

export function AdminFrontlogsTab({
  frontlogs,
  frontlogsLoading,
  frontlogsError,
  selectedSlug,
  onSlugChange,
  onRefresh,
}: AdminFrontlogsTabProps) {
  return (
    <div className="space-y-6">
      <div className="border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center">
              <FileText className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Frontloggar</h2>
              <p className="text-sm text-muted-foreground">
                Runtime- och frontendnära loggar från den lokala dev-loggen
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={frontlogsLoading}
            className="gap-2 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${frontlogsLoading ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </div>

        {frontlogs && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="Entries" value={String(frontlogs.entryCount)} />
            <SummaryCard label="Senaste slug" value={frontlogs.latestSlug || "—"} mono />
            <SummaryCard label="Aktivt flöde" value={selectedSlug || "Alla"} mono />
            <SummaryCard label="Tillgängliga sluggar" value={String(frontlogs.slugs.length)} />
          </div>
        )}

        {frontlogs?.slugs && frontlogs.slugs.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSlugChange(null)}
              className={`rounded-full border px-3 py-1 text-xs ${
                selectedSlug === null
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Alla flöden
            </button>
            {frontlogs.slugs.map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => onSlugChange(slug)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedSlug === slug
                    ? "border-brand-blue/50 bg-brand-blue/10 text-brand-blue"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {slug}
              </button>
            ))}
          </div>
        )}

        {frontlogsLoading && <p className="text-sm text-muted-foreground">Hämtar frontloggar...</p>}
        {frontlogsError && <p className="text-sm text-red-400">{frontlogsError}</p>}
        {frontlogs?.note && <p className="text-sm text-amber-300">{frontlogs.note}</p>}

        {!frontlogsLoading && !frontlogsError && frontlogs && frontlogs.entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Inga frontloggar hittades för det här urvalet.</p>
        )}

        {frontlogs && frontlogs.entries.length > 0 && (
          <div className="space-y-4">
            {frontlogs.entries.map((entry, index) => {
              const summary = summarizeEntry(entry);
              return (
                <div
                  key={`${entry.ts}-${entry.target}-${index}`}
                  className="border border-border bg-muted/50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatWhen(entry.ts)}</span>
                    <span>• {entry.target}</span>
                    <span>• {summary.type}</span>
                    {entry.slug && <span>• slug: {entry.slug}</span>}
                    {summary.model && <span>• modell: {summary.model}</span>}
                    {summary.chatId && <span>• chat: {summary.chatId}</span>}
                    {summary.versionId && <span>• version: {summary.versionId}</span>}
                    {summary.durationMs !== null && <span>• {summary.durationMs} ms</span>}
                  </div>

                  {summary.message && (
                    <p className="mt-3 text-sm whitespace-pre-wrap text-foreground">{summary.message}</p>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-foreground">Visa JSON</summary>
                    <pre className="mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap text-xs text-foreground">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border border-border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
