"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, KeyRound, Link2, Mail, Rocket, Users, Wand2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  DataState,
  RefreshButton,
  SectionCard,
  StatCard,
  StatusBadge,
  TechnicalDetails,
  formatCount,
} from "../ui-bits";
import type { KostnadsfriAdminPayload, KostnadsfriInvitePayload } from "../types";

const PERIODS = [
  { value: "30", label: "Senaste 30 dagarna" },
  { value: "90", label: "Senaste 90 dagarna" },
  { value: "365", label: "Senaste året" },
  { value: "3650", label: "Allt" },
];

const EVENT_LABEL: Record<KostnadsfriAdminPayload["recent"][number]["event"], string> = {
  besok: "Besökte länken",
  verifierad: "Angav rätt lösenord",
  skapad: "Skapade webbplats",
};

const EVENT_TONE: Record<
  KostnadsfriAdminPayload["recent"][number]["event"],
  "off" | "ok" | "warn"
> = {
  besok: "off",
  verifierad: "warn",
  skapad: "ok",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sv-SE");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Kunde inte kopiera");
        }
      }}
      aria-label={`Kopiera ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Kopierat" : "Kopiera"}
    </Button>
  );
}

export function KostnadsfriSection() {
  const [days, setDays] = useState("90");
  const resource = useAdminResource<KostnadsfriAdminPayload>(
    `/api/admin/kostnadsfri?days=${days}`,
    { errorMessage: "Kunde inte hämta kostnadsfri-data" },
  );
  const data = resource.data;

  // ── Generator ──────────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState("");
  const [saveRecord, setSaveRecord] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<KostnadsfriInvitePayload | null>(null);

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyName.trim() || generating) return;
    setGenerating(true);
    try {
      const expires = Number.parseInt(expiresInDays, 10);
      const response = await fetch("/api/admin/kostnadsfri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          saveRecord,
          contactEmail: saveRecord && contactEmail.trim() ? contactEmail.trim() : undefined,
          expiresInDays:
            saveRecord && Number.isFinite(expires) && expires > 0 ? expires : undefined,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        (Partial<KostnadsfriInvitePayload> & { success?: boolean; error?: string }) | null;

      if (!json) {
        toast.error(`Kunde inte skapa länk (HTTP ${response.status})`);
        return;
      }
      if (json.invite) {
        // A 409/500 still carries the invite; `warning` says whether a saved
        // DB row makes the shown link or password unusable.
        setResult({ invite: json.invite, saved: Boolean(json.saved), warning: json.warning });
      }
      if (!response.ok || json.success === false) {
        toast.error(json.error || "Kunde inte skapa länk");
        return;
      }
      toast.success(json.saved ? "Länk skapad och sparad" : "Länk skapad");
      if (json.saved) void resource.reload({ silent: true });
    } catch {
      toast.error("Kunde inte skapa länk");
    } finally {
      setGenerating(false);
    }
  };

  // ── Merge DB rows and visit stats into one table keyed by slug ─────────
  const rows = useMemo(() => {
    if (!data) return [];
    const bySlug = new Map<
      string,
      {
        slug: string;
        companyName: string | null;
        saved: boolean;
        status: string | null;
        contactEmail: string | null;
        stats: KostnadsfriAdminPayload["stats"][number] | null;
      }
    >();
    for (const page of data.pages) {
      bySlug.set(page.slug, {
        slug: page.slug,
        companyName: page.companyName,
        saved: true,
        status: page.status,
        contactEmail: page.contactEmail,
        stats: null,
      });
    }
    for (const stat of data.stats) {
      const existing = bySlug.get(stat.slug);
      if (existing) {
        existing.stats = stat;
      } else {
        bySlug.set(stat.slug, {
          slug: stat.slug,
          companyName: null,
          saved: false,
          status: null,
          contactEmail: null,
          stats: stat,
        });
      }
    }
    return [...bySlug.values()].sort((a, b) => {
      const aLast = a.stats?.lastSeen ?? "";
      const bLast = b.stats?.lastSeen ?? "";
      return aLast < bLast ? 1 : aLast > bLast ? -1 : a.slug.localeCompare(b.slug);
    });
  }, [data]);

  const totals = useMemo(() => {
    const stats = data?.stats ?? [];
    return {
      slugs: stats.length,
      visits: stats.reduce((sum, s) => sum + s.visits, 0),
      verified: stats.reduce((sum, s) => sum + s.verified, 0),
      started: stats.reduce((sum, s) => sum + s.started, 0),
    };
  }, [data]);

  const periodLabel = PERIODS.find((p) => p.value === days)?.label.toLowerCase() ?? "";

  return (
    <div className="space-y-6">
      {data && !data.configured && (
        <Alert variant="destructive">
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Lösenordsseed saknas</AlertTitle>
          <AlertDescription>
            <code className="font-mono text-xs">KOSTNADSFRI_PASSWORD_SEED</code> är inte satt i den
            här miljön. Länkar kan varken skapas eller verifieras.
          </AlertDescription>
        </Alert>
      )}

      {data?.truncated && (
        <Alert>
          <AlertTitle>Statistiken är avhuggen</AlertTitle>
          <AlertDescription>
            Perioden har fler händelser än servern räknar (5 000). Siffrorna nedan är en undre gräns
            — välj en kortare period för exakta tal.
          </AlertDescription>
        </Alert>
      )}

      <SectionCard
        title="Skapa länk"
        description="Skriv företagsnamnet. Slug och lösenord räknas fram från namnet och seeden, så samma namn ger alltid samma länk och lösenord — även utan att spara något."
        icon={Wand2}
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="kostnadsfri-company">Företagsnamn</Label>
              <Input
                id="kostnadsfri-company"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="t.ex. Jakobs Företag AB"
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={!companyName.trim() || generating} className="gap-2">
              <Link2 className="h-4 w-4" />
              {generating ? "Skapar…" : "Skapa länk"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="kostnadsfri-save" checked={saveRecord} onCheckedChange={setSaveRecord} />
              <Label htmlFor="kostnadsfri-save" className="text-sm">
                Spara i databasen (ger företagsnamn med rätt stavning, kontakt och giltighetstid)
              </Label>
            </div>
          </div>

          {saveRecord && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kostnadsfri-email">Kontakt-e-post (valfritt)</Label>
                <Input
                  id="kostnadsfri-email"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="namn@foretag.se"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kostnadsfri-expires">Giltig i dagar (valfritt)</Label>
                <Input
                  id="kostnadsfri-expires"
                  type="number"
                  min={1}
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                  placeholder="t.ex. 30"
                />
              </div>
            </div>
          )}
        </form>

        {result && (
          <div className="border-border bg-muted/30 mt-5 space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{result.invite.companyName}</p>
              <StatusBadge tone={result.saved ? "ok" : "off"}>
                {result.saved ? "Sparad i databasen" : "Bara länk (inget sparat)"}
              </StatusBadge>
            </div>
            {result.warning && (
              <Alert variant={result.warning.level === "error" ? "destructive" : "default"}>
                <AlertTitle>Kontroll mot databasen</AlertTitle>
                <AlertDescription>{result.warning.message}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Länk</p>
                <div className="flex items-center gap-2">
                  <code className="bg-background flex-1 truncate rounded border px-2 py-1.5 font-mono text-xs">
                    {result.invite.url}
                  </code>
                  <CopyButton value={result.invite.url} label="länk" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Lösenord</p>
                <div className="flex items-center gap-2">
                  <code className="bg-background flex-1 rounded border px-2 py-1.5 font-mono text-xs">
                    {result.invite.password}
                  </code>
                  <CopyButton value={result.invite.password} label="lösenord" />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                value={`Hej!\n\nHär är er kostnadsfria webbsida från Sajtmaskin:\n${result.invite.url}\n\nLösenord: ${result.invite.password}\n`}
                label="mejltext"
              />
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Mail className="h-3.5 w-3.5" /> Kopierar en färdig mejltext med länk och lösenord.
                Mejlet skickas manuellt — det finns ingen utskickare.
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-56" aria-label="Välj period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RefreshButton onClick={() => void resource.reload()} loading={resource.loading} />
      </div>

      <DataState
        loading={resource.loading && !data}
        error={resource.error}
        isEmpty={!data}
        onRetry={() => void resource.reload()}
        emptyTitle="Ingen data"
        skeletonRows={4}
      >
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Länkar med besök"
                value={totals.slugs}
                hint={periodLabel}
                icon={Link2}
              />
              <StatCard label="Besök" value={totals.visits} hint={periodLabel} icon={Eye} />
              <StatCard
                label="Rätt lösenord"
                value={totals.verified}
                hint={periodLabel}
                icon={KeyRound}
              />
              <StatCard
                label="Skapade webbplatser"
                value={totals.started}
                hint={periodLabel}
                icon={Rocket}
              />
            </div>

            <SectionCard
              title="Per företag"
              description={`Sparade sidor och alla länkar som fått besök, ${periodLabel}. Rader utan "Sparad" är deterministiska länkar som aldrig lades i databasen.`}
              icon={Users}
            >
              <DataState
                isEmpty={rows.length === 0}
                emptyTitle="Inga länkar ännu"
                emptyDescription="Ingen kostnadsfri-länk har besökts under perioden och ingen sida är sparad."
                emptyIcon={Link2}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Företag / slug</TableHead>
                      <TableHead className="text-right">Besök</TableHead>
                      <TableHead className="text-right">Unika</TableHead>
                      <TableHead className="text-right">Rätt lösenord</TableHead>
                      <TableHead
                        className="text-right"
                        title="Räknas server-side när wizarden skapat sin prompt-handoff."
                      >
                        Skapade
                      </TableHead>
                      <TableHead>Senast</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.slug}>
                        <TableCell>
                          <p className="font-medium">{row.companyName ?? "—"}</p>
                          <p className="text-muted-foreground font-mono text-xs">
                            /kostnadsfri/{row.slug}
                          </p>
                          {row.contactEmail && (
                            <p className="text-muted-foreground text-xs">{row.contactEmail}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(row.stats?.visits ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(row.stats?.uniqueVisitors ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(row.stats?.verified ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(row.stats?.started ?? 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatTime(row.stats?.lastSeen)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.saved ? (
                            <StatusBadge tone={row.status === "expired" ? "warn" : "ok"}>
                              {row.status === "expired" ? "Utgången" : "Sparad"}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="off">Bara länk</StatusBadge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataState>
            </SectionCard>

            <SectionCard
              title="Senaste händelser"
              description="Vem som gjorde vad, nyast först. E-post visas när besökaren var inloggad, annars IP-adress."
              icon={Eye}
            >
              <DataState
                isEmpty={data.recent.length === 0}
                emptyTitle="Inga händelser"
                emptyDescription="Ingen har besökt en kostnadsfri-länk under perioden."
                emptyIcon={Eye}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>När</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Händelse</TableHead>
                      <TableHead>Besökare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((row, index) => (
                      <TableRow key={`${row.at}-${row.slug}-${index}`}>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatTime(row.at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                        <TableCell>
                          <StatusBadge tone={EVENT_TONE[row.event]}>
                            {EVENT_LABEL[row.event]}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <p>{row.userEmail ?? row.ipAddress ?? "okänd"}</p>
                          {row.userAgent && (
                            <TechnicalDetails summary="Webbläsare">
                              <p className="text-muted-foreground max-w-[360px] font-mono text-[11px] break-words">
                                {row.userAgent}
                              </p>
                            </TechnicalDetails>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataState>
            </SectionCard>
          </>
        )}
      </DataState>
    </div>
  );
}
