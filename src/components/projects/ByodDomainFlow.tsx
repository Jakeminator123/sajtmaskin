"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CustomerDomainSnapshot,
  DnsRecord,
  HostCheck,
} from "@/lib/domains/domain-observation";

type ByodDomainFlowProps = {
  projectId: string;
  chatId: string | null;
  publishedSlug: string | null;
  initialDomain?: string | null;
  onChanged?: () => void;
};

type SnapshotResponse = {
  success?: boolean;
  snapshot?: CustomerDomainSnapshot;
  error?: string;
};

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1"
      title="Kopiera"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only">Kopiera {value}</span>
    </button>
  );
}

function toneClass(status: HostCheck["status"]): string {
  switch (status) {
    case "live":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "problem":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "unknown":
    case "paused":
      return "border-gray-700 bg-gray-900/40 text-gray-300";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
}

function HostCard({ host, title }: { host: HostCheck; title: string }) {
  return (
    <div className={`space-y-2 border p-3 ${toneClass(host.status)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">{title}</p>
          <p className="font-mono text-sm text-white">{host.domain}</p>
        </div>
        <span className="border border-current/30 px-2 py-0.5 text-xs">{host.statusLabel}</span>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">Ägarskap</dt>
          <dd>
            {host.ownership === "verified"
              ? "Verifierad"
              : host.ownership === "pending"
                ? "Väntar"
                : "Okänd status"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">DNS-riktning</dt>
          <dd>
            {host.dns === "valid"
              ? "Pekar rätt"
              : host.dns === "invalid"
                ? "Behöver ändras"
                : host.dns === "pending"
                  ? "Väntar på DNS"
                  : "Okänd status"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">HTTPS</dt>
          <dd>
            {host.https === "valid"
              ? "Fungerar"
              : host.https === "invalid"
                ? "Problem"
                : host.https === "not_checked"
                  ? "Kontrollerar HTTPS"
                  : "Okänd status"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RecordTable({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Poster från den aktuella konfigurationen för just den här sajten. Kopiera varje värde till
        din registrar. E-postposter (MX, SPF, DKIM, DMARC) ska lämnas ifred.
      </p>
      <div className="overflow-x-auto border border-gray-800">
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead className="bg-gray-950 text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Syfte</th>
              <th className="px-3 py-2 font-medium">Typ</th>
              <th className="px-3 py-2 font-medium">Namn</th>
              <th className="px-3 py-2 font-medium">Värde</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={`${record.purpose}:${record.type}:${record.host}:${record.value}`}
                className="border-t border-gray-800"
              >
                <td className="px-3 py-2 text-gray-400">
                  {record.purpose === "ownership" ? "Ägarskap" : "Pekning"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-300">{record.type}</td>
                <td className="px-3 py-2 font-mono text-gray-300">{record.host}</td>
                <td className="px-3 py-2 font-mono break-all text-gray-300">
                  <span className="inline-flex items-center gap-2">
                    {record.value}
                    <CopyValue value={record.value} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ByodDomainFlow({
  projectId,
  chatId,
  publishedSlug,
  initialDomain,
  onChanged,
}: ByodDomainFlowProps) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [snapshot, setSnapshot] = useState<CustomerDomainSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "link" | "verify" | "activate" | "unlink" | null>(
    "load",
  );
  const generation = useRef(0);

  const applyResponse = useCallback((data: SnapshotResponse, ok: boolean) => {
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!ok) {
      setError(data.error || "Åtgärden misslyckades.");
      return;
    }
    setError(null);
  }, []);

  const load = useCallback(
    async (candidate?: string) => {
      const gen = ++generation.current;
      setBusy("load");
      setError(null);
      try {
        const query = new URLSearchParams();
        if (candidate?.trim()) query.set("domain", candidate.trim());
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/domain?${query.toString()}`,
          { headers: { Accept: "application/json" } },
        );
        const data = (await response.json().catch(() => null)) as SnapshotResponse | null;
        if (generation.current !== gen) return;
        if (!response.ok || !data?.snapshot) {
          throw new Error(data?.error || "Kunde inte läsa domänstatus.");
        }
        setSnapshot(data.snapshot);
      } catch (caught) {
        if (generation.current !== gen) return;
        setError(caught instanceof Error ? caught.message : "Kunde inte läsa domänstatus.");
      } finally {
        if (generation.current === gen) setBusy(null);
      }
    },
    [projectId],
  );

  useEffect(() => {
    generation.current += 1;
    setDomain(initialDomain ?? "");
    setSnapshot(null);
    setError(null);
    void load(initialDomain ?? undefined);
  }, [projectId, initialDomain, load]);

  async function mutate(action: "link" | "verify" | "activate" | "unlink", nextDomain?: string) {
    const gen = ++generation.current;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, domain: nextDomain ?? domain }),
      });
      const data = (await response.json().catch(() => null)) as SnapshotResponse | null;
      if (generation.current !== gen) return;
      applyResponse(data ?? {}, response.ok);
      if (response.ok) onChanged?.();
    } catch (caught) {
      if (generation.current !== gen) return;
      setError(caught instanceof Error ? caught.message : "Åtgärden misslyckades.");
    } finally {
      if (generation.current === gen) setBusy(null);
    }
  }

  const records = [
    ...(snapshot?.primary?.records ?? []),
    ...(snapshot?.companion?.records ?? []),
  ];
  const seen = new Set<string>();
  const uniqueRecords = records.filter((record) => {
    const key = `${record.purpose}:${record.type}:${record.host}:${record.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="byod-own-domain" className="text-xs font-medium text-gray-400">
          Jag har redan en domän
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="byod-own-domain"
            value={domain}
            onChange={(event) => {
              generation.current += 1;
              setDomain(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void mutate("link", event.currentTarget.value);
            }}
            placeholder="exempel.se"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={busy !== null}
          />
          <Button
            type="button"
            className="gap-2"
            onClick={() => void mutate("link")}
            disabled={busy !== null || !domain.trim() || !chatId}
          >
            {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Koppla
          </Button>
        </div>
        <p className="text-xs text-gray-600">
          Ingen tillgänglighetskontroll eller köpoffert. Domänköp är avstängt här.
        </p>
        {!chatId && (
          <p className="text-xs text-amber-500">
            Publicera sajten först så att domänen kan kopplas till rätt projekt.
          </p>
        )}
      </div>

      {publishedSlug && (
        <p className="text-xs text-gray-500">
          Publicerad slug: <code className="text-gray-300">{publishedSlug}</code>. Ett namnbyte på
          projektet ändrar inte den här reserverade slugen.
        </p>
      )}

      {error && (
        <p role="alert" className="border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {snapshot?.message && (
        <p className="border border-gray-800 bg-gray-950/50 p-3 text-sm text-gray-300">
          {snapshot.message}
        </p>
      )}

      {busy === "load" && !snapshot && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Hämtar domänstatus…
        </p>
      )}

      {snapshot?.primary && <HostCard host={snapshot.primary} title="Primär adress" />}
      {snapshot?.companion && (
        <HostCard
          host={snapshot.companion}
          title={
            snapshot.redirectArmed
              ? "www/apex (omdirigering aktiv)"
              : "www/apex (omdirigering när båda är klara)"
          }
        />
      )}

      <RecordTable records={uniqueRecords} />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => void mutate("verify")}
          disabled={busy !== null || !domain.trim()}
        >
          {busy === "verify" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Kontrollera igen
        </Button>
        {snapshot?.canActivate && (
          <Button
            type="button"
            className="gap-2"
            onClick={() => void mutate("activate")}
            disabled={busy !== null}
          >
            {busy === "activate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Gör till primäradress
          </Button>
        )}
        {snapshot?.canUnlink && (
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void mutate("unlink")}
            disabled={busy !== null}
          >
            {busy === "unlink" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            Koppla loss
          </Button>
        )}
      </div>

      {snapshot?.primary?.status === "unknown" && (
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Statusen är tillfälligt okänd. Det är inte bevis för att en tidigare verifierad domän
          blivit ogiltig.
        </p>
      )}
    </div>
  );
}
