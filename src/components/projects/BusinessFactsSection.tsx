"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Loader2, PencilLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BUSINESS_WEEKDAYS,
  EMPTY_WEEK,
  OPENING_HOURS_MODES,
  OPENING_HOURS_MODE_LABELS_SV,
  WEEKDAY_LABELS_SV,
  formatOpeningHoursLines,
  type BusinessFactsInput,
  type BusinessFactsPersisted,
  type BusinessFactsSupportState,
  type BusinessWeekday,
  type DayHours,
  type OpeningHoursMode,
  type WeekHours,
} from "@/lib/projects/business-facts-schema";
import { getProjectBusinessFacts, saveProjectBusinessFacts } from "@/lib/projects/project-client";

type BusinessFactsSectionProps = {
  projectId: string;
  /** True once a version is live; drives the "publicera om" hint after save. */
  hasLiveVersion: boolean;
  /**
   * Whether the LIVE site carries `lib/business-facts.ts`. Only `supported`
   * may promise that "Publicera om" carries the edit; `unsupported` sends the
   * customer to the builder for a one-time upgrade; `unknown` stays neutral.
   */
  support: BusinessFactsSupportState;
};

/**
 * All customer-facing copy that depends on the support state: save toast,
 * footer and the builder callout. One owner so the three never disagree.
 * `callout === null` means no callout is shown.
 */
export function supportCopy(
  support: BusinessFactsSupportState,
  hasLiveVersion: boolean,
): { toast: string; footer: string; callout: { text: string; action: string } | null } {
  if (!hasLiveVersion) {
    return {
      toast: "Sparat. Uppgifterna används när sajten byggs och publiceras.",
      footer: "Uppgifterna används när sajten byggs och publiceras första gången.",
      callout: null,
    };
  }
  switch (support) {
    case "supported":
      return {
        toast: "Sparat. Publicera om sajten så syns ändringen.",
        footer:
          "Ändringar når den publicerade sajten när du publicerar om. Ingen ny generering behövs.",
        callout: null,
      };
    case "unsupported":
      return {
        toast: "Sparat. Den publicerade sajten behöver uppdateras i byggaren innan ändringen syns.",
        footer:
          "Den publicerade sajten är byggd utan automatiska företagsuppgifter. Öppna byggaren och be den uppdatera öppettider och kontakt – därefter räcker det att publicera om.",
        callout: {
          text: "Sajten behöver en engångsuppdatering i byggaren.",
          action: "Uppdatera i byggaren",
        },
      };
    case "imported":
      return {
        toast: "Sparat. Importerade projekt uppdateras inte automatiskt – ändra texterna i byggaren.",
        footer:
          "Den här sajten är ett importerat projekt och tar inte emot företagsuppgifter automatiskt. Ändra öppettider och kontakt direkt i byggaren.",
        callout: {
          text: "Importerade projekt ändras direkt i byggaren.",
          action: "Ändra i byggaren",
        },
      };
    default:
      return {
        toast: "Sparat. Ändringen tas med vid nästa publicering.",
        footer:
          "Vid nästa publicering kontrolleras om sajten tar emot uppgifterna automatiskt; annars får du besked här.",
        callout: null,
      };
  }
}

/** 30-minute steps keep the list short; the schema also accepts quarter hours. */
export const TIME_OPTIONS: readonly string[] = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});

/**
 * Options for one time select. A saved quarter-hour value (e.g. `09:15`, set
 * via API or an earlier UI) is kept in the list in sort order, so the select
 * shows what is stored instead of silently displaying another time.
 */
export function timeOptionsFor(current: string): readonly string[] {
  if (TIME_OPTIONS.includes(current)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, current].sort();
}

type ContactForm = {
  phone: string;
  email: string;
  orgNumber: string;
  street: string;
  postalCode: string;
  city: string;
};

type FormState = {
  mode: OpeningHoursMode;
  week: WeekHours;
  contact: ContactForm;
};

function toForm(facts: BusinessFactsPersisted | null): FormState {
  return {
    mode: facts?.hours.mode ?? "unspecified",
    week: facts?.hours.week ?? structuredClone(EMPTY_WEEK),
    contact: {
      phone: facts?.contact.phone ?? "",
      email: facts?.contact.email ?? "",
      orgNumber: facts?.contact.orgNumber ?? "",
      street: facts?.contact.address?.street ?? "",
      postalCode: facts?.contact.address?.postalCode ?? "",
      city: facts?.contact.address?.city ?? "",
    },
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Form → wire shape. Empty strings become `null`; a half-filled address is sent as-is so the server can say what is missing. */
export function toInput(form: FormState): BusinessFactsInput {
  const street = orNull(form.contact.street);
  const postalCode = orNull(form.contact.postalCode);
  const city = orNull(form.contact.city);
  const hasAnyAddress = Boolean(street || postalCode || city);
  return {
    hours: {
      mode: form.mode,
      week: form.mode === "regular" ? form.week : null,
    },
    contact: {
      phone: orNull(form.contact.phone),
      email: orNull(form.contact.email),
      orgNumber: orNull(form.contact.orgNumber),
      address: hasAnyAddress
        ? { street: street ?? "", postalCode: postalCode ?? "", city: city ?? "" }
        : null,
    },
  };
}

const MODE_HELP: Record<OpeningHoursMode, string> = {
  unspecified: "Sajten visar inga öppettider alls.",
  regular: "Välj tider per veckodag. Dagar utan öppet markeras som stängda.",
  always_open: "För webbutiker, självbetjäning och tjänster som alltid är tillgängliga.",
  by_appointment: "Inga fasta tider. Sajten hänvisar till bokning eller kontakt.",
};

function DayRow({
  day,
  value,
  onChange,
}: {
  day: BusinessWeekday;
  value: DayHours;
  onChange: (next: DayHours) => void;
}) {
  const id = `hours-${day}`;
  return (
    <div className="grid grid-cols-[7rem_auto_1fr] items-center gap-3 text-sm">
      <Label htmlFor={`${id}-open`} className="text-gray-300">
        {WEEKDAY_LABELS_SV[day]}
      </Label>
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-open`}
          size="sm"
          checked={!value.closed}
          aria-label={`${WEEKDAY_LABELS_SV[day]} öppet`}
          onCheckedChange={(checked) =>
            onChange(checked ? { closed: false, open: "09:00", close: "17:00" } : { closed: true })
          }
        />
        <span className="w-12 text-xs text-gray-500">{value.closed ? "Stängt" : "Öppet"}</span>
      </div>
      {value.closed ? (
        <span className="text-xs text-gray-600">—</span>
      ) : (
        <div className="flex items-center gap-2">
          <NativeSelect
            size="sm"
            aria-label={`${WEEKDAY_LABELS_SV[day]} öppnar`}
            value={value.open}
            onChange={(event) => onChange({ ...value, open: event.target.value })}
          >
            {timeOptionsFor(value.open).map((time) => (
              <NativeSelectOption key={time} value={time}>
                {time}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="text-gray-500">–</span>
          <NativeSelect
            size="sm"
            aria-label={`${WEEKDAY_LABELS_SV[day]} stänger`}
            value={value.close}
            onChange={(event) => onChange({ ...value, close: event.target.value })}
          >
            {timeOptionsFor(value.close).map((time) => (
              <NativeSelectOption key={time} value={time}>
                {time}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}

/**
 * Företagsuppgifter: standardized opening hours and contact details the
 * customer owns. Saved to `project_data.meta.business`; the generated site's
 * `lib/business-facts.ts` is rewritten from it on every publish, so a change
 * here reaches the live site with "Publicera om" — no regeneration.
 */
export function BusinessFactsSection({
  projectId,
  hasLiveVersion,
  support,
}: BusinessFactsSectionProps) {
  const copy = supportCopy(support, hasLiveVersion);
  const [form, setForm] = useState<FormState>(() => toForm(null));
  const [lastSetAt, setLastSetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const facts = await getProjectBusinessFacts(projectId);
      setForm(toForm(facts));
      setLastSetAt(facts?.lastSetAt ?? null);
      setDirty(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Kunde inte läsa företagsuppgifter");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback((patch: (current: FormState) => FormState) => {
    setForm((current) => patch(current));
    setDirty(true);
  }, []);

  const previewLines = useMemo(
    () =>
      formatOpeningHoursLines({
        mode: form.mode,
        week: form.mode === "regular" ? form.week : null,
      }),
    [form.mode, form.week],
  );

  async function save() {
    setSaving(true);
    try {
      const saved = await saveProjectBusinessFacts(projectId, toInput(form));
      setForm(toForm(saved));
      setLastSetAt(saved.lastSetAt);
      setDirty(false);
      toast.success(copy.toast);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte spara företagsuppgifter");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4" />
        {loadError}
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Försök igen
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-300">Öppettider</legend>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Typ av öppettider"
            value={form.mode}
            onChange={(event) =>
              update((current) => ({ ...current, mode: event.target.value as OpeningHoursMode }))
            }
          >
            {OPENING_HOURS_MODES.map((mode) => (
              <NativeSelectOption key={mode} value={mode}>
                {OPENING_HOURS_MODE_LABELS_SV[mode]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-gray-500">{MODE_HELP[form.mode]}</p>
        </div>

        {form.mode === "regular" && (
          <div className="space-y-2 border border-gray-800 bg-gray-900/40 p-3">
            {BUSINESS_WEEKDAYS.map((day) => (
              <DayRow
                key={day}
                day={day}
                value={form.week[day]}
                onChange={(next) =>
                  update((current) => ({ ...current, week: { ...current.week, [day]: next } }))
                }
              />
            ))}
          </div>
        )}

        {previewLines.length > 0 && (
          <div className="text-sm">
            <p className="text-xs text-gray-500">Så visas det på sajten</p>
            <ul className="mt-1 space-y-0.5 text-gray-300" data-testid="hours-preview">
              {previewLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-300">Kontakt</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="business-phone">Telefon</Label>
            <Input
              id="business-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="08-123 45 67"
              value={form.contact.phone}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  contact: { ...current.contact, phone: event.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="business-email">E-post</Label>
            <Input
              id="business-email"
              type="email"
              autoComplete="email"
              placeholder="info@foretaget.se"
              value={form.contact.email}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  contact: { ...current.contact, email: event.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="business-orgnr">Organisationsnummer</Label>
            <Input
              id="business-orgnr"
              inputMode="numeric"
              placeholder="556677-8899"
              value={form.contact.orgNumber}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  contact: { ...current.contact, orgNumber: event.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="business-street">Gatuadress</Label>
            <Input
              id="business-street"
              autoComplete="street-address"
              placeholder="Storgatan 1"
              value={form.contact.street}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  contact: { ...current.contact, street: event.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="business-postal">Postnummer</Label>
            <Input
              id="business-postal"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="123 45"
              value={form.contact.postalCode}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  contact: { ...current.contact, postalCode: event.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="business-city">Ort</Label>
            <Input
              id="business-city"
              autoComplete="address-level2"
              placeholder="Staden"
              value={form.contact.city}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  contact: { ...current.contact, city: event.target.value },
                }))
              }
            />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="gap-2" disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Spara uppgifter
        </Button>
        <p className="text-xs text-gray-600">
          {lastSetAt
            ? `Senast sparad ${new Date(lastSetAt).toLocaleString("sv-SE", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}.`
            : "Inget sparat ännu."}{" "}
          {copy.footer}
        </p>
      </div>
      {copy.callout && (
        <div className="flex flex-wrap items-center gap-3 border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{copy.callout.text}</span>
          <Link href={`/builder?project=${projectId}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <PencilLine className="h-4 w-4" />
              {copy.callout.action}
            </Button>
          </Link>
        </div>
      )}
    </form>
  );
}
