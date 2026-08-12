"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins, ExternalLink, ReceiptText, Save, Users, WandSparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import type { GenerationBillingPayload, GenerationBillingRowPayload } from "../types";

const PERIODS = [
  { value: "7", label: "7 dagar" },
  { value: "30", label: "30 dagar" },
  { value: "90", label: "90 dagar" },
  { value: "365", label: "1 år" },
];

function formatSek(ore: number): string {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(ore / 100);
}

function formatUsd(microUsd: number): string {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(microUsd / 1_000_000);
}

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("sv-SE");
}

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "error" | "off" }> = {
  charged: { label: "Debiterad", tone: "ok" },
  charged_estimated: { label: "Debiterad · prisestimat", tone: "warn" },
  free_generation: { label: "Gratisgenerering", tone: "ok" },
  zero_cost: { label: "0-kostnad", tone: "off" },
  test: { label: "Testkonto", tone: "off" },
  anonymous_unbilled: { label: "Anonym · ej debiterad", tone: "error" },
  unpriced: { label: "Saknar pris", tone: "error" },
  usage_incomplete: { label: "Ofullständig usage", tone: "error" },
  needs_reconciliation: { label: "Behöver avstämning", tone: "error" },
  no_usage: { label: "Saknar usage", tone: "warn" },
  pending: { label: "Pågår", tone: "warn" },
};

function BillingStatus({ value }: { value: string }) {
  const status = STATUS[value] ?? { label: value, tone: "off" as const };
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}

function GenerationDetails({ row }: { row: GenerationBillingRowPayload }) {
  return (
    <TechnicalDetails summary="Visa kostnad och tokens">
      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>Input: {formatCount(row.inputTokens)}</div>
        <div>Cache read: {formatCount(row.cachedInputTokens)}</div>
        <div>Cache write: {formatCount(row.cacheWriteTokens)}</div>
        <div>Output: {formatCount(row.outputTokens)}</div>
        <div>Reasoning: {formatCount(row.reasoningTokens)}</div>
        <div>LLM-anrop: {formatCount(row.llmCalls)}</div>
        <div>USD: {formatUsd(row.providerCostMicroUsd)}</div>
        <div>Prisversion: {row.pricingVersion}</div>
      </div>
      <pre className="bg-muted/40 mt-2 max-h-72 overflow-auto rounded-md p-3 text-xs">
        {JSON.stringify(row.priceBreakdown, null, 2)}
      </pre>
    </TechnicalDetails>
  );
}

export function GenereringarSection() {
  const [days, setDays] = useState("30");
  const resource = useAdminResource<GenerationBillingPayload>(
    `/api/admin/generation-billing?days=${days}`,
    { errorMessage: "Kunde inte hämta generationskostnaderna" },
  );
  const [markup, setMarkup] = useState("2");
  const [usdToSek, setUsdToSek] = useState("10.5");
  const [sekPerCredit, setSekPerCredit] = useState("3");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!resource.data?.settings) return;
    setMarkup(String(resource.data.settings.markupMultiplier));
    setUsdToSek(String(resource.data.settings.usdToSek));
    setSekPerCredit(String(resource.data.settings.sekPerCredit));
  }, [resource.data?.settings]);

  const saveSettings = async () => {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/admin/generation-billing", {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          markupMultiplier: Number(markup.replace(",", ".")),
          usdToSek: Number(usdToSek.replace(",", ".")),
          sekPerCredit: Number(sekPerCredit.replace(",", ".")),
        }),
      });
      const json = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || json.success === false) {
        throw new Error(json.error || "Kunde inte spara.");
      }
      setSaveMessage("Sparat. Nya genereringar får de nya parametrarna.");
      await resource.reload({ silent: true });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  };

  const data = resource.data;
  const reconciliation = data?.openAiReconciliation;
  const reconciliationDeltaMicroUsd = reconciliation
    ? reconciliation.totalCostMicroUsd - (data?.summary.openAiProviderCostMicroUsd ?? 0)
    : 0;

  const reconcileBilling = async () => {
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const response = await fetch("/api/admin/generation-billing", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      const json = (await response.json()) as {
        success?: boolean;
        error?: string;
        reconciliation?: { attempted: number; settled: number; failed: number };
      };
      if (!response.ok || json.success === false || !json.reconciliation) {
        throw new Error(json.error || "Kunde inte köra avstämningen.");
      }
      const { attempted, settled, failed } = json.reconciliation;
      setReconcileMessage(
        attempted === 0
          ? "Inga väntande generationskostnader hittades."
          : `${settled} av ${attempted} rader stämdes av${failed ? `, ${failed} misslyckades` : ""}.`,
      );
      await resource.reload({ silent: true });
    } catch (error) {
      setReconcileMessage(error instanceof Error ? error.message : "Kunde inte stämma av.");
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40">
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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void reconcileBilling()} disabled={reconciling}>
            {reconciling ? "Stämmer av…" : "Stäm av väntande"}
          </Button>
          <RefreshButton onClick={() => void resource.reload()} loading={resource.loading} />
        </div>
      </div>
      {reconcileMessage && <p className="text-muted-foreground text-sm">{reconcileMessage}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Genereringar" value={data?.summary.generations ?? 0} icon={WandSparkles} />
        <StatCard
          label="Beräknad självkostnad"
          value={formatSek(data?.summary.providerCostOre ?? 0)}
          hint="OpenAI + Anthropic"
          icon={ReceiptText}
        />
        <StatCard
          label="Efter påslag"
          value={formatSek(data?.summary.billableOre ?? 0)}
          hint="Värdet före avrundning till credits"
          icon={Coins}
        />
        <StatCard label="Credits dragna" value={data?.summary.creditsCharged ?? 0} icon={Coins} />
        <StatCard
          label="Gratisgenereringar"
          value={data?.summary.freeGenerations ?? 0}
          icon={WandSparkles}
        />
        <StatCard label="LLM-anrop" value={data?.summary.llmCalls ?? 0} />
      </div>

      <SectionCard
        title="OpenAI-kontoavstämning"
        description="Officiell kostnad från OpenAI jämförs med den OpenAI-del som Sajtmaskins egen usage-ledger har kopplat till genereringar. Organisationsvärdet kan även innehålla andra appar eller nycklar och kan därför inte fördelas direkt på Sajtmaskin-användare."
        icon={ReceiptText}
      >
        {reconciliation?.status === "unconfigured" && (
          <Alert className="mb-4">
            <AlertDescription>
              OPENAI_ADMIN_KEY saknas i den här miljön. Den lokala, användarkopplade kostnadsboken
              fungerar fortfarande, men kontoavstämningen är avstängd.
            </AlertDescription>
          </Alert>
        )}
        {reconciliation?.status === "error" && (
          <Alert className="mb-4" variant="destructive">
            <AlertDescription>
              {reconciliation.error || "OpenAI-kontots kostnad kunde inte hämtas."}
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            label="OpenAI organisation"
            value={
              reconciliation?.status === "ok"
                ? formatUsd(reconciliation.totalCostMicroUsd)
                : "Ej tillgänglig"
            }
            hint="Officiellt konto, vald period"
          />
          <StatCard
            label="Sajtmaskins OpenAI-ledger"
            value={formatUsd(data?.summary.openAiProviderCostMicroUsd ?? 0)}
            hint="Kopplad till generationsversioner"
          />
          <StatCard
            label="Skillnad"
            value={
              reconciliation?.status === "ok"
                ? formatUsd(reconciliationDeltaMicroUsd)
                : "Ej beräknad"
            }
            hint="Kontrollvärde; periodisering och annan org-usage kan skilja"
          />
        </div>
        {reconciliation?.status === "ok" && reconciliation.lineItems.length > 0 && (
          <TechnicalDetails summary="Visa OpenAI:s kostnadsrader">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead>OpenAI-projekt</TableHead>
                    <TableHead>API-nyckel-id</TableHead>
                    <TableHead className="text-right">Kostnad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliation.lineItems.map((item) => (
                    <TableRow
                      key={`${item.projectId ?? "organization"}-${item.apiKeyId ?? "all-keys"}-${item.lineItem}`}
                    >
                      <TableCell>{item.lineItem}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.projectId || "Hela organisationen"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.apiKeyId || "Alla nycklar"}
                      </TableCell>
                      <TableCell className="text-right">{formatUsd(item.costMicroUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TechnicalDetails>
        )}
      </SectionCard>

      <SectionCard
        title="Prisregel"
        description="Formel: leverantörskostnad i USD × USD/SEK × X-påslag ÷ SEK per credit. Resultatet avrundas uppåt till hela credits. En generering behåller sin snapshot även om regeln ändras senare."
        icon={Coins}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="billing-markup">Påslag (X)</Label>
            <Input
              id="billing-markup"
              inputMode="decimal"
              value={markup}
              onChange={(event) => setMarkup(event.target.value)}
              aria-describedby="billing-markup-help"
            />
            <p id="billing-markup-help" className="text-muted-foreground text-xs">
              X1,0–X10,0. Exempel: 15 kr × X2,8 = 42 kr.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing-fx">USD till SEK</Label>
            <Input
              id="billing-fx"
              inputMode="decimal"
              value={usdToSek}
              onChange={(event) => setUsdToSek(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Manuell revisionskurs, inte en livekurs.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing-credit-value">SEK per credit</Label>
            <Input
              id="billing-credit-value"
              inputMode="decimal"
              value={sekPerCredit}
              onChange={(event) => setSekPerCredit(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">Nuvarande produktantagande är 3 kr.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void saveSettings()} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Sparar…" : "Spara prisregel"}
          </Button>
          {saveMessage && <span className="text-sm text-emerald-500">{saveMessage}</span>}
          {saveError && <span className="text-destructive text-sm">{saveError}</span>}
        </div>
      </SectionCard>

      <SectionCard
        title="Användare"
        description="Summerad självkostnad och debitering för vald period."
        icon={Users}
      >
        <DataState
          loading={resource.loading && !data}
          error={resource.error}
          isEmpty={!data?.users.length}
          onRetry={() => void resource.reload()}
          emptyTitle="Inga debiterade genereringar ännu"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Användare</TableHead>
                  <TableHead className="text-right">Genereringar</TableHead>
                  <TableHead className="text-right">Självkostnad</TableHead>
                  <TableHead className="text-right">Gratis</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.users ?? []).map((user, index) => (
                  <TableRow key={user.userId ?? `guest-${index}`}>
                    <TableCell>
                      <div className="font-medium">{user.name}</div>
                      {user.email && (
                        <div className="text-muted-foreground text-xs">{user.email}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCount(user.generations)}</TableCell>
                    <TableCell className="text-right">{formatSek(user.providerCostOre)}</TableCell>
                    <TableCell className="text-right">
                      {formatCount(user.freeGenerations)}
                    </TableCell>
                    <TableCell className="text-right">{formatCount(user.creditsCharged)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DataState>
      </SectionCard>

      <SectionCard
        title="Genereringar"
        description={`Varje rad är en version. Prompt, användare, tokenförbrukning, kostnadssnapshot och kredittransaktion hör ihop.${
          data && data.summary.generations > data.generations.length
            ? ` Tabellen visar de senaste ${data.generations.length} av ${data.summary.generations} raderna för perioden.`
            : ""
        }`}
        icon={WandSparkles}
      >
        {data?.generations.some(
          (row) =>
            row.status === "unpriced" ||
            row.status === "no_usage" ||
            row.status === "usage_incomplete" ||
            row.status === "needs_reconciliation",
        ) && (
          <Alert className="mb-4">
            <AlertDescription>
              Minst en rad saknar komplett pris eller usage. Den markeras tydligt för manuell
              avstämning; en redan genomförd debitering sänks aldrig automatiskt.
            </AlertDescription>
          </Alert>
        )}
        <DataState
          loading={resource.loading && !data}
          error={resource.error}
          isEmpty={!data?.generations.length}
          onRetry={() => void resource.reload()}
          emptyTitle="Inga generationsrader ännu"
          emptyDescription="Nya own-engine-genereringar fyller tabellen efter att databasmigreringen är körd."
        >
          <div className="space-y-3">
            {(data?.generations ?? []).map((row) => (
              <div key={row.id} className="border-border rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <BillingStatus value={row.status} />
                      <Badge variant="outline">v{row.versionNumber ?? "?"}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {formatWhen(row.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 font-medium">
                      {row.projectName || row.chatTitle || "Namnlös generering"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {row.userName || row.userEmail || "Gäst"}
                      {row.userName && row.userEmail ? ` · ${row.userEmail}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/builder?chatId=${encodeURIComponent(row.chatId)}`}>
                      Öppna <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>

                {row.promptExcerpt && (
                  <p className="bg-muted/30 mt-3 line-clamp-3 rounded-md p-3 text-sm whitespace-pre-wrap">
                    {row.promptExcerpt}
                  </p>
                )}

                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <span className="text-muted-foreground block text-xs">
                      Beräknad självkostnad
                    </span>
                    {formatSek(row.providerCostOre)}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Påslag</span>X
                    {(row.markupBasisPoints / 10_000).toLocaleString("sv-SE")}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Efter påslag</span>
                    {formatSek(row.billableOre)}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Draget</span>
                    {row.freeGenerationApplied
                      ? "Gratisgenerering"
                      : `${formatCount(row.creditsCharged)} credits`}
                  </div>
                </div>
                <div className="mt-3">
                  <GenerationDetails row={row} />
                </div>
              </div>
            ))}
          </div>
        </DataState>
      </SectionCard>
    </div>
  );
}
