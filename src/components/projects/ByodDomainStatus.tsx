"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DnsRecord, DomainObservation } from "@/lib/domains/domain-observation";

type ByodDomainStatusProps = {
  chatId: string | null;
  initialDomain?: string | null;
};

function statusLabel(
  value:
    DomainObservation["connection"] | DomainObservation["ownership"] | DomainObservation["dns"],
): string {
  switch (value) {
    case "connected":
      return "Kopplad till projektet";
    case "not_connected":
      return "Inte kopplad till projektet";
    case "verified":
      return "Ägarskap verifierat";
    case "pending":
      return "Väntar";
    case "valid":
      return "Giltig DNS-konfiguration";
    case "invalid":
      return "DNS behöver ändras";
    default:
      return "Kunde inte avgöras";
  }
}

function recordPurpose(record: DnsRecord): string {
  return record.purpose === "ownership" ? "Ägarskap" : "Pekning";
}

function ObservationSummary({ observation }: { observation: DomainObservation }) {
  const fullyObserved =
    observation.connection === "connected" &&
    observation.ownership === "verified" &&
    observation.dns === "valid";

  return (
    <div className="space-y-4" aria-live="polite">
      <p className="text-sm text-gray-400">
        Kontroll för <code className="text-gray-200">{observation.domain}</code>
      </p>
      <div
        className={`border p-3 text-sm ${
          fullyObserved
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-200"
        }`}
      >
        <div className="flex items-start gap-2">
          {fullyObserved ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="space-y-1">
            <p className="font-medium">
              {fullyObserved
                ? "DNS verifierad för den kontrollerade domänen."
                : observation.connection === "not_connected"
                  ? "Domänen är inte kopplad till det här projektet."
                  : observation.dns === "invalid"
                    ? "DNS-inställningarna behöver uppdateras."
                    : "Kontrollen gav inget fullständigt besked."}
            </p>
            <p className="text-xs opacity-80">
              Den här kontrollen ändrar inte sajtens liveadress, verifierar inte HTTPS och aktiverar
              ingen adress.
            </p>
          </div>
        </div>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="border border-gray-800 p-2">
          <dt className="text-gray-500">Projektkoppling</dt>
          <dd className="mt-1 text-gray-300">{statusLabel(observation.connection)}</dd>
        </div>
        <div className="border border-gray-800 p-2">
          <dt className="text-gray-500">Ägarskap</dt>
          <dd className="mt-1 text-gray-300">{statusLabel(observation.ownership)}</dd>
        </div>
        <div className="border border-gray-800 p-2">
          <dt className="text-gray-500">DNS</dt>
          <dd className="mt-1 text-gray-300">{statusLabel(observation.dns)}</dd>
        </div>
      </dl>

      {observation.records.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {observation.connection === "not_connected"
              ? "Säkert förhandsunderlag från Vercel. Endast A-rekommendation visas tills projektkopplingen kan bevisas."
              : "DNS-poster som Vercel rekommenderar för exakt den kontrollerade domänen:"}
          </p>
          <div className="overflow-x-auto border border-gray-800">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Syfte</th>
                  <th className="px-3 py-2 font-medium">Typ</th>
                  <th className="px-3 py-2 font-medium">Domännamn</th>
                  <th className="px-3 py-2 font-medium">Värde</th>
                </tr>
              </thead>
              <tbody>
                {observation.records.map((record) => (
                  <tr
                    key={`${record.purpose}:${record.type}:${record.host}:${record.value}`}
                    className="border-t border-gray-800"
                  >
                    <td className="px-3 py-2 text-gray-400">{recordPurpose(record)}</td>
                    <td className="px-3 py-2 font-mono text-gray-300">{record.type}</td>
                    <td className="px-3 py-2 font-mono text-gray-300">{record.host}</td>
                    <td className="px-3 py-2 font-mono break-all text-gray-300">{record.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ByodDomainStatus({ chatId, initialDomain }: ByodDomainStatusProps) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [observation, setObservation] = useState<DomainObservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const requestGeneration = useRef(0);

  useEffect(() => {
    requestGeneration.current += 1;
    setDomain(initialDomain ?? "");
    setObservation(null);
    setError(null);
    setChecking(false);
  }, [chatId, initialDomain]);

  async function checkDomain() {
    const candidate = domain.trim();
    if (!candidate || !chatId) return;
    const generation = ++requestGeneration.current;
    setChecking(true);
    setError(null);
    setObservation(null);

    try {
      const query = new URLSearchParams({ domain: candidate, chatId });
      const response = await fetch(`/api/domains/status?${query.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => null)) as
        DomainObservation | { error?: string } | null;
      if (requestGeneration.current !== generation) return;
      if (!response.ok) {
        throw new Error(
          data && "error" in data && data.error ? data.error : "Domänen kunde inte kontrolleras.",
        );
      }
      setObservation(data as DomainObservation);
    } catch (caught) {
      if (requestGeneration.current !== generation) return;
      setError(caught instanceof Error ? caught.message : "Domänen kunde inte kontrolleras.");
    } finally {
      if (requestGeneration.current === generation) setChecking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="byod-domain" className="text-xs font-medium text-gray-400">
          Domän du redan äger
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="byod-domain"
            value={domain}
            onChange={(event) => {
              requestGeneration.current += 1;
              setDomain(event.target.value);
              setObservation(null);
              setError(null);
              setChecking(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void checkDomain();
            }}
            placeholder="exempel.se"
            autoCapitalize="none"
            autoComplete="url"
            spellCheck={false}
            disabled={checking}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void checkDomain()}
            disabled={checking || !domain.trim() || !chatId}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Kontrollera domän
          </Button>
        </div>
        <p className="text-xs text-gray-600">
          Kontrollen läser Vercels aktuella DNS-råd. Den köper, kopplar, verifierar eller aktiverar
          inte domänen.
        </p>
        {!chatId && (
          <p className="text-xs text-amber-500">
            Projektet saknar en publiceringschatt och kan därför inte kontrolleras ännu.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {observation && <ObservationSummary observation={observation} />}
    </div>
  );
}
