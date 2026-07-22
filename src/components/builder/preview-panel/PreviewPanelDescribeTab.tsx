"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Plus, Puzzle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DescribeCandidate } from "@/lib/shadcn/describe";
import type { ShadcnInsertSelection } from "@/lib/builder/shadcn-insert";

/**
 * "Beskriv"-fliken — fritext → `POST /api/shadcn/describe` → rankade
 * kandidatkort (thumbnails där de finns) → användaren väljer → insättning via
 * `onInsertItem` (samma own-engine-lane som Bläddra-galleriets kortval).
 *
 * Del av plan: `docs/plans/active/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 2 v1 + Fas 3 — Beskriv).
 *
 * Routen är flagg-gated (`NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE`) och svarar
 * 404 när flaggan är av — fliken visar då en tydlig "inte aktiverad"-yta i
 * stället för ett kryptiskt fel. Ingen fetch sker förrän användaren söker.
 */

export interface PreviewPanelDescribeTabProps {
  disabled?: boolean;
  /**
   * Insättnings-lane v1: valt kort skickas som prompt genom befintliga
   * sendMessage/own-engine-vägen (se `shadcn-insert.ts`). Saknas callbacken
   * visas korten utan "Lägg till"-knapp aktiv.
   */
  onInsertItem?: (selection: ShadcnInsertSelection) => void | Promise<void>;
}

type DescribeResponse = {
  candidates: DescribeCandidate[];
};

function candidateKey(candidate: DescribeCandidate): string {
  return `${candidate.registry}/${candidate.name}`;
}

function toSelection(candidate: DescribeCandidate): ShadcnInsertSelection {
  return {
    name: candidate.name,
    registry: candidate.registry,
    title: candidate.title,
    description: candidate.description,
    dependencies: candidate.dependencies,
    registryDependencies: candidate.registryDependencies,
    addCommand: candidate.addCommand,
    origin: "describe",
  };
}

function errorMessageForStatus(status: number): string {
  if (status === 404) return "Beskriv-flödet är inte aktiverat i den här miljön.";
  if (status === 401) return "Logga in för att använda Beskriv.";
  if (status === 429) return "För många förfrågningar — vänta en stund och försök igen.";
  return `Sökningen misslyckades (HTTP ${status}).`;
}

export function PreviewPanelDescribeTab({
  disabled = false,
  onInsertItem,
}: PreviewPanelDescribeTabProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = ingen sökning gjord ännu (visa intro-copy, inte "0 träffar"). */
  const [candidates, setCandidates] = useState<DescribeCandidate[] | null>(null);
  const [insertingKey, setInsertingKey] = useState<string | null>(null);
  const [insertedKey, setInsertedKey] = useState<string | null>(null);
  // Ignorera svar från en äldre sökning som löser efter en nyare.
  const requestIdRef = useRef(0);
  // Ref-guard mot dubbelklick: två snabba klick före nästa render ser båda
  // `insertingKey === null` (stale closure) — refen uppdateras synkront.
  const insertingRef = useRef(false);

  const handleSearch = useCallback(async () => {
    const trimmed = description.trim();
    if (!trimmed || loading) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setInsertedKey(null);
    try {
      const response = await fetch("/api/shadcn/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) {
        setCandidates(null);
        setError(errorMessageForStatus(response.status));
        return;
      }
      const data = (await response.json()) as DescribeResponse;
      if (requestId !== requestIdRef.current) return;
      setCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setCandidates(null);
      setError("Kunde inte nå Beskriv-tjänsten. Kontrollera anslutningen och försök igen.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [description, loading]);

  const handleInsert = useCallback(
    async (candidate: DescribeCandidate) => {
      if (!onInsertItem || insertingRef.current) return;
      insertingRef.current = true;
      const key = candidateKey(candidate);
      setInsertingKey(key);
      setInsertedKey(null);
      try {
        await onInsertItem(toSelection(candidate));
        setInsertedKey(key);
      } catch {
        // Fel-ytan ägs av callern (toast) — markera bara ALDRIG som skickad.
      } finally {
        insertingRef.current = false;
        setInsertingKey(null);
      }
    },
    [onInsertItem],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-zinc-950/95",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-label="Beskriv-fliken"
    >
      <div className="border-b border-violet-900/40 px-2 py-2">
        <label htmlFor="describe-input" className="sr-only">
          Beskriv vad du vill lägga till
        </label>
        <textarea
          id="describe-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSearch();
            }
          }}
          rows={3}
          maxLength={2000}
          placeholder="T.ex. en stapel-graf med tre staplar som mäter försäljning"
          className="w-full resize-none rounded-md border border-violet-900/50 bg-black/40 px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={!description.trim() || loading}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-800/60 bg-violet-950/40 px-3 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Search className="h-3.5 w-3.5" aria-hidden />
          )}
          {loading ? "Söker…" : "Hitta block"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertCircle className="h-5 w-5 text-rose-400" aria-hidden />
            <p className="text-[11px] text-rose-200/90">{error}</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Letar efter matchande block…
          </div>
        ) : candidates === null ? (
          <p className="px-2 py-8 text-center text-[11px] leading-snug text-zinc-500">
            Beskriv i fritext vad du vill lägga till, så letar en agent upp de bäst matchande
            blocken ur shadcn-registren.
          </p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-[11px] text-zinc-500">
            Inga träffar. Prova en enklare eller mer konkret beskrivning.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Matchande block">
            {candidates.map((candidate) => {
              const key = candidateKey(candidate);
              return (
                <li key={key}>
                  <DescribeCandidateCard
                    candidate={candidate}
                    inserting={insertingKey === key}
                    inserted={insertedKey === key}
                    insertDisabled={!onInsertItem || Boolean(insertingKey)}
                    onInsert={() => void handleInsert(candidate)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DescribeCandidateCard({
  candidate,
  inserting,
  inserted,
  insertDisabled,
  onInsert,
}: {
  candidate: DescribeCandidate;
  inserting: boolean;
  inserted: boolean;
  insertDisabled: boolean;
  onInsert: () => void;
}) {
  const title = candidate.title || candidate.name;
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-violet-900/50 bg-black/30">
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-zinc-900/80">
        {candidate.previewLight ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.previewLight}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <Puzzle className="h-6 w-6 text-zinc-600" aria-hidden />
        )}
      </div>
      <div className="space-y-1 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-violet-100">{title}</span>
          <span className="shrink-0 font-mono text-[9px] text-zinc-500">{candidate.registry}</span>
        </div>
        {candidate.description ? (
          <p className="line-clamp-2 text-[10px] leading-snug text-zinc-500">
            {candidate.description}
          </p>
        ) : null}
        {candidate.reason ? (
          <p className="line-clamp-2 text-[10px] leading-snug text-violet-300/70">
            {candidate.reason}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onInsert}
          disabled={insertDisabled || inserting || inserted}
          className={cn(
            "mt-1 flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
            inserted
              ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200"
              : "border-violet-800/60 bg-violet-950/30 text-violet-200 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {inserting ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : inserted ? (
            <Check className="h-3 w-3" aria-hidden />
          ) : (
            <Plus className="h-3 w-3" aria-hidden />
          )}
          {inserting
            ? "Skickar…"
            : inserted
              ? "Skickad — följ genereringen i chatten"
              : "Lägg till i sajten"}
        </button>
      </div>
    </div>
  );
}
