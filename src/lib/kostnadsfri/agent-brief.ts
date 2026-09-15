/**
 * Sajtagentens faktaunderlag i kampanjflödet.
 *
 * Sajtagenten (OpenClaw + D-ID) satt tidigare med företagsnamnet som enda
 * fakta, så en uppföljningsfråga kunde bara bli allmän. Den här modulen samlar
 * det som *redan är bestämt* vid en given punkt i flödet — bolagsdata efter
 * lösenordet, wizardens svar när de finns — till ett bundet objekt som reser
 * med `window.__SITEMASKIN_CONTEXT` och renderas i `[KAMPANJ-UNDERLAG]`.
 *
 * Två gränser gäller:
 *
 * 1. **Allowlist, snävare än profilen.** Org.nr, postnummer, gatuadress och
 *    registreringsdatum hör inte i ett samtal och tas inte med. Profilens egen
 *    allowlist (`company-profile.ts`) är alltså inte tillräcklig här.
 * 2. **Wizarden vinner varje överlapp.** Företaget har sett och kunnat rätta
 *    wizardens värden; registerdatan är bara ett förslag. Underlaget får aldrig
 *    påstå något annat än vad kunden senast bekräftade.
 *
 * Underlaget är kontext för samtalet, inte sajtinnehåll. Prompten till buildern
 * byggs fortfarande enbart av `buildPromptFromWizardData` (ägarbeslut
 * 2026-09-15), och renderingen skriver ut den gränsen för modellen.
 */
import {
  resolveWizardIndustryHint,
  wizardIndustryLabel,
  wizardPurposeLabel,
  wizardVibeLabel,
} from "@/lib/builder/wizard-taxonomy";
import type { KostnadsfriCompanyData, MiniWizardData } from "./index";

/** Var i kampanjflödet kunden står. Styr hur Sajtagenten får inleda. */
export type KostnadsfriAgentStage = "gate" | "wizard" | "handoff";

export interface KostnadsfriAgentBrief {
  stage: KostnadsfriAgentStage;
  companyName: string;
  /** Endast förnamn, för tilltal. Får inte hamna i sajtens innehåll. */
  contactFirstName?: string;
  city?: string;
  /** Bara när branschen är ett verkligt fack — okänd fritext utelämnas. */
  industryLabel?: string;
  /** Verksamhetstexten ur registret, eller kundens rättade version. */
  businessDescription?: string;
  /** Styr hur Sajtagenten får använda texten — registret är prosa, wizarden är bekräftad. */
  businessDescriptionSource?: "register" | "wizard";
  website?: string;
  purposeLabels?: string[];
  targetAudience?: string;
  usp?: string;
  vibeLabel?: string;
  paletteName?: string;
}

const MAX = {
  companyName: 160,
  firstName: 40,
  city: 80,
  businessDescription: 600,
  website: 200,
  targetAudience: 300,
  usp: 300,
  purposes: 8,
} as const;

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * Tilltalsnamnet är första ordet. `contact_name` bär ibland hela namnet, och ett
 * efternamn tillför inget i en hälsning men gör läckaget värre om underlaget
 * någon gång skulle citeras vidare.
 */
function firstName(value: unknown): string | undefined {
  const full = text(value, 200);
  if (!full) return undefined;
  return text(full.split(" ")[0], MAX.firstName);
}

/**
 * `industry` från utskicksverktyget är fritext och matchar sällan ett fack.
 * Wizardens val är däremot redan ett id. Båda går genom samma resolver så ett
 * gissat fack aldrig kan smyga in via kolumnen.
 */
function industryLabelFrom(value: string | null | undefined): string | undefined {
  const id = resolveWizardIndustryHint(value);
  if (!id) return undefined;
  return wizardIndustryLabel(id);
}

export function buildKostnadsfriAgentBrief(input: {
  stage: KostnadsfriAgentStage;
  /** Null innan lösenordet är verifierat. */
  companyData: KostnadsfriCompanyData | null;
  /** Slug-härlett namn, används när DB-raden saknas. */
  fallbackCompanyName: string;
  /** Null tills mini-wizarden är klar. */
  wizardData?: MiniWizardData | null;
}): KostnadsfriAgentBrief {
  const { stage, companyData, fallbackCompanyName, wizardData = null } = input;
  const profile = companyData?.profile ?? null;

  const brief: KostnadsfriAgentBrief = {
    stage,
    companyName:
      text(wizardData?.companyName, MAX.companyName) ??
      text(companyData?.companyName, MAX.companyName) ??
      text(fallbackCompanyName, MAX.companyName) ??
      "",
  };

  const contact = firstName(companyData?.contactName);
  if (contact) brief.contactFirstName = contact;

  // Ort: kundens rättade värde först, sedan postort, sist registrerat säte.
  const city =
    text(wizardData?.location, MAX.city) ??
    text(profile?.city, MAX.city) ??
    text(profile?.registeredOffice, MAX.city);
  if (city) brief.city = city;

  const industry =
    industryLabelFrom(wizardData?.industry) ?? industryLabelFrom(companyData?.industry);
  if (industry) brief.industryLabel = industry;

  const wizardDescription = text(wizardData?.description, MAX.businessDescription);
  const description =
    wizardDescription ?? text(profile?.businessDescription, MAX.businessDescription);
  if (description) {
    brief.businessDescription = description;
    brief.businessDescriptionSource = wizardDescription ? "wizard" : "register";
  }

  const website =
    text(wizardData?.website, MAX.website) ?? text(companyData?.website, MAX.website);
  if (website) brief.website = website;

  if (wizardData) {
    const purposeLabels = wizardData.purposes
      .slice(0, MAX.purposes)
      .map((purpose) => wizardPurposeLabel(purpose))
      .filter((label): label is string => Boolean(label));
    if (purposeLabels.length > 0) brief.purposeLabels = purposeLabels;

    const targetAudience = text(wizardData.targetAudience, MAX.targetAudience);
    if (targetAudience) brief.targetAudience = targetAudience;

    const usp = text(wizardData.usp, MAX.usp);
    if (usp) brief.usp = usp;

    const vibe = text(wizardData.designVibe, 40);
    if (vibe) brief.vibeLabel = wizardVibeLabel(vibe);

    const paletteName = text(wizardData.paletteName, 80);
    if (paletteName) brief.paletteName = paletteName;
  }

  return brief;
}

const STAGES: readonly KostnadsfriAgentStage[] = ["gate", "wizard", "handoff"];

function stringList(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => text(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

/**
 * Re-normaliserar ett underlag som kommit från browsern.
 *
 * `window.__SITEMASKIN_CONTEXT` är klientstyrt, så objektet som når chattrouten
 * bär ingen auktoritet — samma hållning som `prepared-prompt.ts`. Caps och
 * fältlista appliceras därför om på servern i stället för att lita på att
 * klienten körde `buildKostnadsfriAgentBrief`. Utan företagsnamn finns inget
 * underlag att tala om, så då blir svaret null.
 */
export function normalizeKostnadsfriAgentBrief(value: unknown): KostnadsfriAgentBrief | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const companyName = text(raw.companyName, MAX.companyName);
  if (!companyName) return null;

  const stage = STAGES.find((candidate) => candidate === raw.stage) ?? "gate";
  const brief: KostnadsfriAgentBrief = { stage, companyName };

  const contactFirstName = firstName(raw.contactFirstName);
  if (contactFirstName) brief.contactFirstName = contactFirstName;

  const city = text(raw.city, MAX.city);
  if (city) brief.city = city;

  // Fritext från klienten får inte bli ett fack den inte är: samma resolver som
  // på skrivsidan, så en påhittad label faller bort i stället för att visas.
  const industryLabel = industryLabelFrom(text(raw.industryLabel, 80));
  if (industryLabel) brief.industryLabel = industryLabel;

  const businessDescription = text(raw.businessDescription, MAX.businessDescription);
  if (businessDescription) {
    brief.businessDescription = businessDescription;
    if (raw.businessDescriptionSource === "register" || raw.businessDescriptionSource === "wizard") {
      brief.businessDescriptionSource = raw.businessDescriptionSource;
    }
  }

  const website = text(raw.website, MAX.website);
  if (website) brief.website = website;

  const purposeLabels = stringList(raw.purposeLabels, MAX.purposes, 80);
  if (purposeLabels) brief.purposeLabels = purposeLabels;

  const targetAudience = text(raw.targetAudience, MAX.targetAudience);
  if (targetAudience) brief.targetAudience = targetAudience;

  const usp = text(raw.usp, MAX.usp);
  if (usp) brief.usp = usp;

  const vibeLabel = text(raw.vibeLabel, 40);
  if (vibeLabel) brief.vibeLabel = vibeLabel;

  const paletteName = text(raw.paletteName, 80);
  if (paletteName) brief.paletteName = paletteName;

  return brief;
}

const STAGE_LABELS: Record<KostnadsfriAgentStage, string> = {
  gate: "lösenordssteget",
  wizard: "mini-wizarden pågår",
  handoff: "wizardsvaren klara, bygget startar",
};

/**
 * Rader till `[KAMPANJ-UNDERLAG]` i OpenClaws kontextblock. Tom lista när inget
 * underlag finns, så anroparen kan utelämna hela sektionen.
 *
 * Två instruktionsrader följer med medvetet: tilltalsnamnet är en person och
 * hör inte i publicerad copy, och verksamhetstextens källa styr om den är
 * registerprosa (omformulera) eller kundens bekräftade beskrivning.
 */
export function kostnadsfriAgentBriefLines(brief: KostnadsfriAgentBrief | null): string[] {
  if (!brief) return [];
  const lines = ["[KAMPANJ-UNDERLAG]", `Steg: ${STAGE_LABELS[brief.stage]}`];
  lines.push(`Företag: ${brief.companyName}`);
  if (brief.contactFirstName) {
    lines.push(
      `Tilltalsnamn: ${brief.contactFirstName} (använd i hälsningen, aldrig i sajtens innehåll)`,
    );
  }
  if (brief.city) lines.push(`Ort: ${brief.city}`);
  if (brief.industryLabel) lines.push(`Bransch: ${brief.industryLabel}`);
  if (brief.website) lines.push(`Nuvarande webbplats: ${brief.website}`);
  if (brief.businessDescription) {
    const descriptionLine =
      brief.businessDescriptionSource === "wizard"
        ? `Verksamhet (kundens bekräftade beskrivning — utgå från den): ${brief.businessDescription}`
        : `Verksamhet enligt registret (torr registerprosa — omformulera, citera inte): ${brief.businessDescription}`;
    lines.push(descriptionLine);
  }
  if (brief.purposeLabels?.length) lines.push(`Mål med sajten: ${brief.purposeLabels.join(", ")}`);
  if (brief.targetAudience) lines.push(`Målgrupp: ${brief.targetAudience}`);
  if (brief.usp) lines.push(`USP: ${brief.usp}`);
  if (brief.vibeLabel) lines.push(`Stil: ${brief.vibeLabel}`);
  if (brief.paletteName) lines.push(`Palett: ${brief.paletteName}`);
  lines.push("[/KAMPANJ-UNDERLAG]");
  return lines;
}
