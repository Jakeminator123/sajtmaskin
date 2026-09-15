import { resolveWizardIndustryHint, type WizardIndustryId } from "@/lib/builder/wizard-taxonomy";
import type { KostnadsfriCompanyProfile } from "./company-profile";

/**
 * Mini-wizardens förifyllda fält från kampanjrad + allowlistad profil.
 *
 * Profilen matar bara wizarden. `buildPromptFromWizardData` läser aldrig
 * `profile` — prompten byggs av det användaren ser och kan rätta.
 *
 * `streetAddress` förifylls medvetet inte som besöksadress (ofta c/o).
 */

export type MiniWizardPrefillSource = {
  companyName: string;
  industry: string | null;
  website: string | null;
  profile: KostnadsfriCompanyProfile | null;
};

export type MiniWizardPrefill = {
  companyName: string;
  industry: WizardIndustryId | "";
  website: string;
  location: string;
  description: string;
};

export function prefillMiniWizardFromCompanyData(
  companyData: MiniWizardPrefillSource,
): MiniWizardPrefill {
  const profile = companyData.profile;
  return {
    companyName: companyData.companyName,
    website: companyData.website?.trim() || "",
    industry: resolveWizardIndustryHint(companyData.industry),
    location: profile?.city?.trim() || profile?.registeredOffice?.trim() || "",
    description: profile?.businessDescription?.trim() || "",
  };
}
