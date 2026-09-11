"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Coins, Globe, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidCreditPrice, type ModelTier } from "@/lib/credits/pricing";
import { applyMarkupSek, referenceWholesaleSek } from "@/lib/domains/pricing";
import { CANONICAL_MODEL_IDS, MODEL_LABELS } from "@/lib/models/catalog";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  scalarCreditPatch,
  tierCreditPatch,
  type ScalarCreditField,
} from "../../lib/pricing-patches";
import {
  DataState,
  RefreshButton,
  SectionCard,
  StatCard,
  StatusBadge,
} from "../ui-bits";
import type { GenerationBillingPayload, PricingSettingsAdminPayload } from "../types";

function parseDecimal(value: string): number {
  return Number(value.replace(",", "."));
}

function parseCreditInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function isScalarOverridden(
  stored: PricingSettingsAdminPayload["settings"]["creditActionPrices"],
  field: ScalarCreditField,
): boolean {
  return isValidCreditPrice(stored[field]);
}

function isTierOverridden(
  stored: PricingSettingsAdminPayload["settings"]["creditActionPrices"],
  group: "promptCreate" | "promptRefine",
  tier: ModelTier,
): boolean {
  const groupValue = stored[group];
  if (!groupValue || typeof groupValue !== "object") return false;
  return isValidCreditPrice(groupValue[tier]);
}

function SourceBadge({ overridden }: { overridden: boolean }) {
  return overridden ? (
    <StatusBadge tone="warn">Databas</StatusBadge>
  ) : (
    <StatusBadge tone="off">Kod</StatusBadge>
  );
}

export function PriserSection() {
  const pricing = useAdminResource<PricingSettingsAdminPayload>("/api/admin/pricing-settings", {
    errorMessage: "Kunde inte hämta prisinställningarna",
  });
  const billing = useAdminResource<GenerationBillingPayload>(
    "/api/admin/generation-billing?days=7",
    { errorMessage: "Kunde inte hämta avräkningsregeln" },
  );

  const [domainMarkup, setDomainMarkup] = useState("5");
  const [domainUsdToSek, setDomainUsdToSek] = useState("11");
  const [billingMarkup, setBillingMarkup] = useState("2");
  const [billingUsdToSek, setBillingUsdToSek] = useState("10.5");
  const [sekPerCredit, setSekPerCredit] = useState("3");
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const data = pricing.data;
    if (!data) return;
    setDomainMarkup(String(data.effective.domain.markup));
    setDomainUsdToSek(String(data.effective.domain.usdToSek));
    const next: Record<string, string> = {};
    const credits = data.effective.creditActionPrices;
    next.wizard = String(credits.wizard);
    next.auditBasic = String(credits.auditBasic);
    next.auditAdvanced = String(credits.auditAdvanced);
    next.deployPreview = String(credits.deployPreview);
    next.deployProduction = String(credits.deployProduction);
    next.openclawTip = String(credits.openclawTip);
    for (const tier of CANONICAL_MODEL_IDS) {
      next[`promptCreate.${tier}`] = String(credits.promptCreate[tier] ?? "");
      next[`promptRefine.${tier}`] = String(credits.promptRefine[tier] ?? "");
    }
    setCreditDrafts(next);
  }, [pricing.data]);

  useEffect(() => {
    if (!billing.data?.settings) return;
    setBillingMarkup(String(billing.data.settings.markupMultiplier));
    setBillingUsdToSek(String(billing.data.settings.usdToSek));
    setSekPerCredit(String(billing.data.settings.sekPerCredit));
  }, [billing.data?.settings]);

  const seExample = useMemo(() => {
    const markup = parseDecimal(domainMarkup);
    const usdToSek = parseDecimal(domainUsdToSek);
    const wholesale = referenceWholesaleSek("se");
    if (!Number.isFinite(markup) || markup <= 0 || !Number.isFinite(usdToSek) || usdToSek <= 0) {
      return null;
    }
    return {
      wholesale,
      customer: applyMarkupSek(wholesale, { markup, usdToSek }),
      markup,
    };
  }, [domainMarkup, domainUsdToSek]);

  const patchPricing = async (body: Record<string, unknown>, key: string) => {
    setSavingKey(key);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/admin/pricing-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || json.success === false) {
        throw new Error(json.error || "Kunde inte spara.");
      }
      setSaveMessage("Sparat. Nya köp och debiteringar läser det nya priset.");
      await pricing.reload({ silent: true });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveBilling = async () => {
    setSavingKey("billing");
    setSaveMessage(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/admin/generation-billing", {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          markupMultiplier: parseDecimal(billingMarkup),
          usdToSek: parseDecimal(billingUsdToSek),
          sekPerCredit: parseDecimal(sekPerCredit),
        }),
      });
      const json = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || json.success === false) {
        throw new Error(json.error || "Kunde inte spara.");
      }
      setSaveMessage("Sparat. Nya genereringar får de nya avräkningsparametrarna.");
      await billing.reload({ silent: true });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveScalar = (field: ScalarCreditField) => {
    const parsed = parseCreditInput(creditDrafts[field] ?? "");
    if (parsed === null || !isValidCreditPrice(parsed)) {
      setSaveError("Creditpriset måste vara ett heltal mellan 0 och 1000.");
      return;
    }
    void patchPricing({ creditActionPrices: scalarCreditPatch(field, parsed) }, field);
  };

  const resetScalar = (field: ScalarCreditField) => {
    void patchPricing({ creditActionPrices: scalarCreditPatch(field, null) }, `${field}:reset`);
  };

  const saveTier = (group: "promptCreate" | "promptRefine", tier: ModelTier) => {
    const parsed = parseCreditInput(creditDrafts[`${group}.${tier}`] ?? "");
    if (parsed === null || !isValidCreditPrice(parsed)) {
      setSaveError("Creditpriset måste vara ett heltal mellan 0 och 1000.");
      return;
    }
    void patchPricing(
      { creditActionPrices: tierCreditPatch(group, tier, parsed) },
      `${group}.${tier}`,
    );
  };

  const resetTier = (group: "promptCreate" | "promptRefine", tier: ModelTier) => {
    void patchPricing(
      { creditActionPrices: tierCreditPatch(group, tier, null) },
      `${group}.${tier}:reset`,
    );
  };

  const saveDomainField = (field: "domainMarkup" | "domainUsdToSek", raw: string) => {
    const parsed = parseDecimal(raw);
    if (!Number.isFinite(parsed)) {
      setSaveError("Fältet måste vara ett giltigt tal.");
      return;
    }
    void patchPricing({ [field]: parsed }, field);
  };

  const resetDomain = (field: "domainMarkup" | "domainUsdToSek") => {
    const defaults = pricing.data?.defaults.domain;
    if (!defaults) return;
    const value = field === "domainMarkup" ? defaults.markup : defaults.usdToSek;
    void patchPricing({ [field]: value }, `${field}:reset`);
  };

  const data = pricing.data;
  const stored = data?.settings.creditActionPrices;
  const defaults = data?.defaults.creditActionPrices;
  const effective = data?.effective.creditActionPrices;
  const domainDefaults = data?.defaults.domain;
  const domainEffective = data?.effective.domain;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          En sammanhållen prisbild. Domänpåslag och creditpriser läses om vid varje
          debitering. Avräkningsregeln fryses per generering och ligger i en annan tabell.
        </p>
        <RefreshButton
          onClick={() => {
            void pricing.reload();
            void billing.reload();
          }}
          loading={pricing.loading || billing.loading}
        />
      </div>
      {saveMessage && <span className="text-sm text-emerald-500">{saveMessage}</span>}
      {saveError && <span className="text-destructive text-sm">{saveError}</span>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Uppskattat .se"
          value={
            seExample
              ? `${seExample.customer.toLocaleString("sv-SE")} kr`
              : "—"
          }
          hint="Riktvärde före registraroffert"
          icon={Globe}
        />
        <StatCard
          label="Publicering"
          value={effective?.deployProduction ?? "—"}
          hint="credits"
          icon={Coins}
        />
        <StatCard
          label="Audit basic / advanced"
          value={
            effective
              ? `${effective.auditBasic} / ${effective.auditAdvanced}`
              : "—"
          }
          icon={Coins}
        />
        <StatCard
          label="Tips"
          value={effective?.openclawTip ?? "—"}
          hint="credits per hämtning"
          icon={CircleDollarSign}
        />
      </div>

      <SectionCard
        title="Prisregel"
        description="Formel: leverantörskostnad i USD × USD/SEK × X-påslag ÷ SEK per credit. Resultatet avrundas uppåt till hela credits. En generering behåller sin snapshot även om regeln ändras senare. Det här är LLM-avräkningen — inte domänkursen."
        icon={Coins}
      >
        <DataState
          loading={billing.loading && !billing.data}
          error={billing.error}
          onRetry={() => void billing.reload()}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="billing-markup">Påslag (X)</Label>
              <Input
                id="billing-markup"
                inputMode="decimal"
                value={billingMarkup}
                onChange={(event) => setBillingMarkup(event.target.value)}
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
                value={billingUsdToSek}
                onChange={(event) => setBillingUsdToSek(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Manuell revisionskurs för genereringar, inte domänkursen.
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
          <div className="mt-4">
            <Button
              onClick={() => void saveBilling()}
              disabled={savingKey === "billing"}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {savingKey === "billing" ? "Sparar…" : "Spara prisregel"}
            </Button>
          </div>
        </DataState>
      </SectionCard>

      <SectionCard
        title="Domänpåslag"
        description="Multiplikator och USD/SEK för kundpriset på en domän. Skild från avräkningskursen ovan. Ett köp debiteras aldrig på det här riktvärdet — bara på en bindande registraroffert."
        icon={Globe}
      >
        <DataState
          loading={pricing.loading && !data}
          error={pricing.error}
          onRetry={() => void pricing.reload()}
        >
          {data && domainDefaults && domainEffective && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="domain-markup">Påslag (X)</Label>
                    <SourceBadge
                      overridden={domainEffective.markup !== domainDefaults.markup}
                    />
                  </div>
                  <Input
                    id="domain-markup"
                    inputMode="decimal"
                    value={domainMarkup}
                    onChange={(event) => setDomainMarkup(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Kodens konstant: X{domainDefaults.markup.toLocaleString("sv-SE")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveDomainField("domainMarkup", domainMarkup)}
                      disabled={savingKey === "domainMarkup"}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Spara
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetDomain("domainMarkup")}
                      disabled={
                        savingKey === "domainMarkup:reset" ||
                        domainEffective.markup === domainDefaults.markup
                      }
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Återställ till kod
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="domain-fx">USD till SEK</Label>
                    <SourceBadge
                      overridden={domainEffective.usdToSek !== domainDefaults.usdToSek}
                    />
                  </div>
                  <Input
                    id="domain-fx"
                    inputMode="decimal"
                    value={domainUsdToSek}
                    onChange={(event) => setDomainUsdToSek(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Kodens konstant: {domainDefaults.usdToSek.toLocaleString("sv-SE")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveDomainField("domainUsdToSek", domainUsdToSek)}
                      disabled={savingKey === "domainUsdToSek"}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Spara
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetDomain("domainUsdToSek")}
                      disabled={
                        savingKey === "domainUsdToSek:reset" ||
                        domainEffective.usdToSek === domainDefaults.usdToSek
                      }
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Återställ till kod
                    </Button>
                  </div>
                </div>
              </div>
              <div className="border-border bg-muted/30 rounded-md border px-3 py-2.5 text-sm">
                {seExample ? (
                  <>
                    Ett{" "}
                    <span className="font-medium">.se</span> med riktvärde{" "}
                    {seExample.wholesale.toLocaleString("sv-SE")} kr × X
                    {seExample.markup.toLocaleString("sv-SE")} landar på{" "}
                    <span className="font-semibold">
                      {seExample.customer.toLocaleString("sv-SE")} kr/år
                    </span>{" "}
                    innan du sparar. Uppskattning, inte offert.
                  </>
                ) : (
                  "Ange giltiga tal för att se vad ett .se landar på."
                )}
              </div>
            </div>
          )}
        </DataState>
      </SectionCard>

      <SectionCard
        title="Creditpriser"
        description="Varje rad sparas för sig. Återställ skickar null så getCreditCost går tillbaka till kodens konstant. Skicka aldrig hela listan."
        icon={CircleDollarSign}
      >
        <DataState
          loading={pricing.loading && !data}
          error={pricing.error}
          onRetry={() => void pricing.reload()}
        >
          {data && stored && defaults && effective && (
            <div className="space-y-6">
              <CreditGroup title="Åtgärder">
                <CreditRow
                  label="Publicering"
                  fieldKey="deployProduction"
                  draft={creditDrafts.deployProduction ?? ""}
                  codeValue={defaults.deployProduction}
                  overridden={isScalarOverridden(stored, "deployProduction")}
                  saving={savingKey === "deployProduction" || savingKey === "deployProduction:reset"}
                  onDraftChange={(value) =>
                    setCreditDrafts((current) => ({ ...current, deployProduction: value }))
                  }
                  onSave={() => saveScalar("deployProduction")}
                  onReset={() => resetScalar("deployProduction")}
                />
                <CreditRow
                  label="Preview-publicering"
                  fieldKey="deployPreview"
                  draft={creditDrafts.deployPreview ?? ""}
                  codeValue={defaults.deployPreview}
                  overridden={isScalarOverridden(stored, "deployPreview")}
                  saving={savingKey === "deployPreview" || savingKey === "deployPreview:reset"}
                  onDraftChange={(value) =>
                    setCreditDrafts((current) => ({ ...current, deployPreview: value }))
                  }
                  onSave={() => saveScalar("deployPreview")}
                  onReset={() => resetScalar("deployPreview")}
                />
                <CreditRow
                  label="Audit basic"
                  fieldKey="auditBasic"
                  draft={creditDrafts.auditBasic ?? ""}
                  codeValue={defaults.auditBasic}
                  overridden={isScalarOverridden(stored, "auditBasic")}
                  saving={savingKey === "auditBasic" || savingKey === "auditBasic:reset"}
                  onDraftChange={(value) =>
                    setCreditDrafts((current) => ({ ...current, auditBasic: value }))
                  }
                  onSave={() => saveScalar("auditBasic")}
                  onReset={() => resetScalar("auditBasic")}
                />
                <CreditRow
                  label="Audit advanced"
                  fieldKey="auditAdvanced"
                  draft={creditDrafts.auditAdvanced ?? ""}
                  codeValue={defaults.auditAdvanced}
                  overridden={isScalarOverridden(stored, "auditAdvanced")}
                  saving={savingKey === "auditAdvanced" || savingKey === "auditAdvanced:reset"}
                  onDraftChange={(value) =>
                    setCreditDrafts((current) => ({ ...current, auditAdvanced: value }))
                  }
                  onSave={() => saveScalar("auditAdvanced")}
                  onReset={() => resetScalar("auditAdvanced")}
                />
                <CreditRow
                  label="Wizard"
                  fieldKey="wizard"
                  draft={creditDrafts.wizard ?? ""}
                  codeValue={defaults.wizard}
                  overridden={isScalarOverridden(stored, "wizard")}
                  saving={savingKey === "wizard" || savingKey === "wizard:reset"}
                  onDraftChange={(value) =>
                    setCreditDrafts((current) => ({ ...current, wizard: value }))
                  }
                  onSave={() => saveScalar("wizard")}
                  onReset={() => resetScalar("wizard")}
                />
                <CreditRow
                  label="Tips"
                  fieldKey="openclawTip"
                  draft={creditDrafts.openclawTip ?? ""}
                  codeValue={defaults.openclawTip}
                  overridden={isScalarOverridden(stored, "openclawTip")}
                  saving={savingKey === "openclawTip" || savingKey === "openclawTip:reset"}
                  onDraftChange={(value) =>
                    setCreditDrafts((current) => ({ ...current, openclawTip: value }))
                  }
                  onSave={() => saveScalar("openclawTip")}
                  onReset={() => resetScalar("openclawTip")}
                />
              </CreditGroup>

              <CreditGroup title="Generering per modell">
                {CANONICAL_MODEL_IDS.map((tier) => (
                  <CreditRow
                    key={`create-${tier}`}
                    label={MODEL_LABELS[tier]}
                    fieldKey={`promptCreate.${tier}`}
                    draft={creditDrafts[`promptCreate.${tier}`] ?? ""}
                    codeValue={defaults.promptCreate[tier] ?? 0}
                    overridden={isTierOverridden(stored, "promptCreate", tier)}
                    saving={
                      savingKey === `promptCreate.${tier}` ||
                      savingKey === `promptCreate.${tier}:reset`
                    }
                    onDraftChange={(value) =>
                      setCreditDrafts((current) => ({
                        ...current,
                        [`promptCreate.${tier}`]: value,
                      }))
                    }
                    onSave={() => saveTier("promptCreate", tier)}
                    onReset={() => resetTier("promptCreate", tier)}
                  />
                ))}
              </CreditGroup>

              <CreditGroup title="Follow-up per modell">
                {CANONICAL_MODEL_IDS.map((tier) => (
                  <CreditRow
                    key={`refine-${tier}`}
                    label={MODEL_LABELS[tier]}
                    fieldKey={`promptRefine.${tier}`}
                    draft={creditDrafts[`promptRefine.${tier}`] ?? ""}
                    codeValue={defaults.promptRefine[tier] ?? 0}
                    overridden={isTierOverridden(stored, "promptRefine", tier)}
                    saving={
                      savingKey === `promptRefine.${tier}` ||
                      savingKey === `promptRefine.${tier}:reset`
                    }
                    onDraftChange={(value) =>
                      setCreditDrafts((current) => ({
                        ...current,
                        [`promptRefine.${tier}`]: value,
                      }))
                    }
                    onSave={() => saveTier("promptRefine", tier)}
                    onReset={() => resetTier("promptRefine", tier)}
                  />
                ))}
              </CreditGroup>

              {data.settings.updatedAt && (
                <p className="text-muted-foreground text-xs">
                  Senast ändrad {new Date(data.settings.updatedAt).toLocaleString("sv-SE")}
                  {data.settings.updatedBy ? ` · ${data.settings.updatedBy}` : ""}
                </p>
              )}
            </div>
          )}
        </DataState>
      </SectionCard>
    </div>
  );
}

function CreditGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CreditRow({
  label,
  fieldKey,
  draft,
  codeValue,
  overridden,
  saving,
  onDraftChange,
  onSave,
  onReset,
}: {
  label: string;
  fieldKey: string;
  draft: string;
  codeValue: number;
  overridden: boolean;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`credit-${fieldKey}`}>{label}</Label>
          <SourceBadge overridden={overridden} />
        </div>
        <p className="text-muted-foreground text-xs">
          Kodens konstant: {codeValue}
          {overridden ? " · databasen vinner tills du återställer" : ""}
        </p>
      </div>
      <Input
        id={`credit-${fieldKey}`}
        inputMode="numeric"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          Spara
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          disabled={saving || !overridden}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Återställ
        </Button>
      </div>
    </div>
  );
}
