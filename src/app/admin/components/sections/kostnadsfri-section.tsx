"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, KeyRound, Link2, Mail, Rocket, Send, Users, Wand2, X } from "lucide-react";
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
import {
  classifyKostnadsfriSlug,
  type KostnadsfriSlugKind,
} from "@/lib/kostnadsfri/analytics-paths";
import { cn } from "@/lib/utils";
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
  skapad: "Slutförde formuläret",
};

const EVENT_TONE: Record<
  KostnadsfriAdminPayload["recent"][number]["event"],
  "off" | "ok" | "warn"
> = {
  besok: "off",
  verifierad: "warn",
  skapad: "ok",
};

const KIND_LABEL: Record<KostnadsfriSlugKind, string> = {
  utskick: "Utskick",
  ej_utskick: "Ej utskick",
  skrap: "Okänd path",
};

const KIND_TONE: Record<KostnadsfriSlugKind, "ok" | "off" | "warn"> = {
  utskick: "ok",
  ej_utskick: "off",
  skrap: "warn",
};

type KostnadsfriRow = {
  slug: string;
  kind: KostnadsfriSlugKind;
  companyName: string | null;
  saved: boolean;
  status: string | null;
  contactEmail: string | null;
  sentAt: string | null;
  source: string | null;
  stats: KostnadsfriAdminPayload["stats"][number] | null;
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sv-SE");
}

/** Date only — the send register is read per day, not per second. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}


type CountFilter = "any" | "gt0" | "eq0";

function isSameLocalDay(iso: string | null | undefined, day: Date = new Date()): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

/** Prefer Senast (lastSeen) when present; otherwise fall back to Skickat. */
function matchesTodayActivity(row: KostnadsfriRow): boolean {
  if (row.stats?.lastSeen) return isSameLocalDay(row.stats.lastSeen);
  return isSameLocalDay(row.sentAt);
}

function matchesCountFilter(value: number, filter: CountFilter): boolean {
  if (filter === "gt0") return value > 0;
  if (filter === "eq0") return value === 0;
  return true;
}

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full px-2.5 text-xs font-medium",
        active
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
          : "text-muted-foreground",
      )}
    >
      {children}
    </Button>
  );
}

function cycleCountFilter(current: CountFilter, next: "gt0" | "eq0"): CountFilter {
  return current === next ? "any" : next;
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
  const registeredSlugs = useMemo(() => new Set((data?.pages ?? []).map((page) => page.slug)), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const bySlug = new Map<string, KostnadsfriRow>();
    for (const page of data.pages) {
      bySlug.set(page.slug, {
        slug: page.slug,
        kind: classifyKostnadsfriSlug(page.slug, true),
        companyName: page.companyName,
        saved: true,
        status: page.status,
        contactEmail: page.contactEmail,
        sentAt: page.sentAt,
        source: page.source,
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
          kind: classifyKostnadsfriSlug(stat.slug, registeredSlugs.has(stat.slug)),
          companyName: null,
          saved: false,
          status: null,
          contactEmail: null,
          sentAt: null,
          source: null,
          stats: stat,
        });
      }
    }
    // Sent rows first (newest send on top) — this is a send register. Rows
    // without a send keep the old "last visit" ordering below them.
    return [...bySlug.values()].sort((a, b) => {
      if (a.sentAt && b.sentAt && a.sentAt !== b.sentAt) return a.sentAt < b.sentAt ? 1 : -1;
      if (Boolean(a.sentAt) !== Boolean(b.sentAt)) return a.sentAt ? -1 : 1;
      const aLast = a.stats?.lastSeen ?? "";
      const bLast = b.stats?.lastSeen ?? "";
      return aLast < bLast ? 1 : aLast > bLast ? -1 : a.slug.localeCompare(b.slug);
    });
  }, [data, registeredSlugs]);

  const [rowFilter, setRowFilter] = useState("");
  const [showOtherPaths, setShowOtherPaths] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [unikaGt0, setUnikaGt0] = useState(false);
  const [verifiedFilter, setVerifiedFilter] = useState<CountFilter>("any");
  const [startedFilter, setStartedFilter] = useState<CountFilter>("any");

  const hasActiveTableFilters =
    todayOnly || unikaGt0 || verifiedFilter !== "any" || startedFilter !== "any";

  const clearTableFilters = () => {
    setTodayOnly(false);
    setUnikaGt0(false);
    setVerifiedFilter("any");
    setStartedFilter("any");
    setRowFilter("");
  };

  const filteredRows = useMemo(() => {
    const needle = rowFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showOtherPaths && row.kind !== "utskick") return false;
      if (todayOnly && !matchesTodayActivity(row)) return false;
      if (unikaGt0 && (row.stats?.uniqueVisitors ?? 0) <= 0) return false;
      if (!matchesCountFilter(row.stats?.verified ?? 0, verifiedFilter)) return false;
      if (!matchesCountFilter(row.stats?.started ?? 0, startedFilter)) return false;
      if (!needle) return true;
      return [row.companyName, row.slug, row.contactEmail].some((field) =>
        field?.toLowerCase().includes(needle),
      );
    });
  }, [rows, rowFilter, showOtherPaths, todayOnly, unikaGt0, verifiedFilter, startedFilter]);

  const recentRows = useMemo(() => {
    if (!data) return [];
    return data.recent.map((row) => ({
      ...row,
      kind: classifyKostnadsfriSlug(row.slug, registeredSlugs.has(row.slug)),
    }));
  }, [data, registeredSlugs]);

  const visibleRecent = useMemo(
    () => (showOtherPaths ? recentRows : recentRows.filter((row) => row.kind === "utskick")),
    [recentRows, showOtherPaths],
  );

  const totals = useMemo(() => {
    const inviteStats = (data?.stats ?? []).filter(
      (stat) => classifyKostnadsfriSlug(stat.slug, registeredSlugs.has(stat.slug)) === "utskick",
    );
    return {
      slugs: inviteStats.length,
      visits: inviteStats.reduce((sum, s) => sum + s.visits, 0),
      verified: inviteStats.reduce((sum, s) => sum + s.verified, 0),
      started: inviteStats.reduce((sum, s) => sum + s.started, 0),
      // Sends are lifetime facts on the DB row, not period statistics.
      sent: (data?.pages ?? []).filter((page) => page.sentAt).length,
    };
  }, [data, registeredSlugs]);

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
                <AlertTitle>
                  {result.warning.level === "error"
                    ? "Uppgifterna nedan går inte att skicka"
                    : "Kontroll mot databasen"}
                </AlertTitle>
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
                {/* Never hand out credentials the verify route will reject: a saved
                    row with its own password or an expired page wins over the
                    derived password, so the derived one is hidden in that case. */}
                {result.warning?.level === "error" ? (
                  <p className="text-muted-foreground rounded border border-dashed px-2 py-1.5 text-xs">
                    Dolt — gäller inte för den här sluggen (se rutan ovan).
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <code className="bg-background flex-1 rounded border px-2 py-1.5 font-mono text-xs">
                      {result.invite.password}
                    </code>
                    <CopyButton value={result.invite.password} label="lösenord" />
                  </div>
                )}
              </div>
            </div>
            {result.warning?.level !== "error" && (
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                  value={`Hej!\n\nHär är er kostnadsfria webbsida från Sajtmaskin:\n${result.invite.url}\n\nLösenord: ${result.invite.password}\n`}
                  label="mejltext"
                />
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <Mail className="h-3.5 w-3.5" /> Kopierar en färdig mejltext med länk och
                  lösenord. Mejlet skickas manuellt — det finns ingen utskickare.
                </span>
              </div>
            )}
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Utskick" value={totals.sent} hint="totalt" icon={Send} />
              <StatCard
                label="Länkar med besök"
                value={totals.slugs}
                hint={`utskick, ${periodLabel}`}
                icon={Link2}
              />
              <StatCard label="Besök" value={totals.visits} hint={`utskick, ${periodLabel}`} icon={Eye} />
              <StatCard
                label="Rätt lösenord"
                value={totals.verified}
                hint={periodLabel}
                icon={KeyRound}
              />
              <StatCard
                label="Slutförda formulär"
                value={totals.started}
                hint={periodLabel}
                icon={Rocket}
              />
            </div>

            <SectionCard
              title="Per företag"
              description={`Bara utskick som standard — skräpsluggar och osparade pathar räknas inte i talen ovan. "Skickat" är utskicksdatumet på den sparade raden och påverkas inte av perioden.`}
              icon={Users}
            >
              <div className="mb-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-sm flex-1">
                    <Label htmlFor="kostnadsfri-filter" className="sr-only">
                      Sök i registret
                    </Label>
                    <Input
                      id="kostnadsfri-filter"
                      value={rowFilter}
                      onChange={(event) => setRowFilter(event.target.value)}
                      placeholder="Sök företag, slug eller e-post"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="kostnadsfri-other-paths"
                        checked={showOtherPaths}
                        onCheckedChange={setShowOtherPaths}
                      />
                      <Label htmlFor="kostnadsfri-other-paths" className="text-sm">
                        Visa övriga pathar
                      </Label>
                    </div>
                    {(hasActiveTableFilters || rowFilter.trim()) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                        onClick={clearTableFilters}
                      >
                        <X className="h-3.5 w-3.5" />
                        Rensa filter
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterChip
                    active={todayOnly}
                    onClick={() => setTodayOnly((value) => !value)}
                    title="Senast idag om raden har aktivitet, annars skickat idag"
                  >
                    Idag
                  </FilterChip>
                  <FilterChip active={unikaGt0} onClick={() => setUnikaGt0((value) => !value)}>
                    Unika {">"} 0
                  </FilterChip>
                  <FilterChip
                    active={verifiedFilter === "gt0"}
                    onClick={() => setVerifiedFilter((value) => cycleCountFilter(value, "gt0"))}
                  >
                    Rätt lösenord {">"} 0
                  </FilterChip>
                  <FilterChip
                    active={verifiedFilter === "eq0"}
                    onClick={() => setVerifiedFilter((value) => cycleCountFilter(value, "eq0"))}
                  >
                    Rätt lösenord = 0
                  </FilterChip>
                  <FilterChip
                    active={startedFilter === "gt0"}
                    onClick={() => setStartedFilter((value) => cycleCountFilter(value, "gt0"))}
                  >
                    Formulär klara {">"} 0
                  </FilterChip>
                  <FilterChip
                    active={startedFilter === "eq0"}
                    onClick={() => setStartedFilter((value) => cycleCountFilter(value, "eq0"))}
                  >
                    Formulär klara = 0
                  </FilterChip>
                </div>
              </div>
              <DataState
                isEmpty={filteredRows.length === 0}
                emptyTitle={
                  rowFilter.trim() || hasActiveTableFilters ? "Inga träffar" : "Inga länkar ännu"
                }
                emptyDescription={
                  rowFilter.trim() || hasActiveTableFilters
                    ? "Ingen rad matchar sökningen eller filtren. Rensa för att se hela registret."
                    : showOtherPaths
                      ? "Ingen kostnadsfri-länk har besökts under perioden och ingen sida är sparad."
                      : "Inget utskick i registret för perioden. Slå på «Visa övriga pathar» för skräp och osparade sluggar."
                }
                emptyIcon={Link2}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Företag / slug</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Skickat</TableHead>
                      <TableHead className="text-right">Besök</TableHead>
                      <TableHead className="text-right">Unika</TableHead>
                      <TableHead className="text-right">Rätt lösenord</TableHead>
                      <TableHead
                        className="text-right"
                        title="Räknas server-side när wizarden skapat sin prompt-handoff — före buildern. Säger inte om en sajt faktiskt genererades."
                      >
                        Formulär klara
                      </TableHead>
                      <TableHead>Senast</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={row.slug}>
                        <TableCell>
                          <p className="font-medium">
                            {row.kind === "skrap" ? "—" : (row.companyName ?? "—")}
                          </p>
                          <p className="text-muted-foreground font-mono text-xs">
                            /kostnadsfri/{row.slug}
                          </p>
                          <p className="text-muted-foreground text-xs">{row.contactEmail || "—"}</p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <p>{formatDate(row.sentAt)}</p>
                          {row.source && (
                            <p className="text-muted-foreground text-[11px]">{row.source}</p>
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
              description="Vem som gjorde vad, nyast först. E-post visas när besökaren var inloggad, annars IP-adress. Skräpsluggar märks som okänd path."
              icon={Eye}
            >
              <DataState
                isEmpty={visibleRecent.length === 0}
                emptyTitle="Inga händelser"
                emptyDescription={
                  showOtherPaths
                    ? "Ingen har besökt en kostnadsfri-länk under perioden."
                    : "Inga utskickshändelser under perioden."
                }
                emptyIcon={Eye}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>När</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Händelse</TableHead>
                      <TableHead>Besökare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRecent.map((row, index) => (
                      <TableRow key={`${row.at}-${row.slug}-${index}`}>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatTime(row.at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                        <TableCell>
                          <StatusBadge tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</StatusBadge>
                        </TableCell>
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
