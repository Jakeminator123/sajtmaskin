/**
 * `## Business Facts` — the owner's verified opening hours and contact details.
 *
 * Source: `project_data.meta.business` (portal → preferences route). The block
 * does two things: gives the model the only numbers it may use for hours,
 * phone, e-mail and address, and hands it the exact `lib/business-facts.ts`
 * module the deploy route will keep rewriting. Rendering through that module is
 * what lets the customer change hours in the portal without a new generation.
 *
 * Nothing renders when the owner has stated no facts — an empty block would
 * only invite the model to invent hours.
 */
import {
  formatAddressLine,
  formatOpeningHoursLines,
  hasBusinessFacts,
  type BusinessFactsPersisted,
} from "@/lib/projects/business-facts-schema";
import {
  BUSINESS_FACTS_IMPORT_SPECIFIER,
  BUSINESS_FACTS_MODULE_PATH,
  isBusinessFactsModulePath,
  renderBusinessFactsModule,
} from "@/lib/projects/business-facts-module";

export const BUSINESS_FACTS_BLOCK_TITLE = "Business Facts (verified by the site owner)";

export function renderBusinessFactsBlock(
  facts: BusinessFactsPersisted | null | undefined,
  options: { previousFilePaths?: readonly string[] | null } = {},
): string[] {
  if (!facts || !hasBusinessFacts(facts)) return [];

  const hourLines = formatOpeningHoursLines(facts.hours);
  const { phone, email, orgNumber, address } = facts.contact;
  const addressLine = formatAddressLine(address);
  const moduleExists = (options.previousFilePaths ?? []).some(isBusinessFactsModulePath);

  const parts: string[] = [
    `## ${BUSINESS_FACTS_BLOCK_TITLE}`,
    "",
    "These are the ONLY opening hours and contact details allowed on the site. Never invent, round or \"improve\" them. Anything not listed here is unknown and must not be shown.",
    "",
  ];

  if (facts.hours.mode === "unspecified") {
    parts.push("- **Opening hours:** not provided — do not render an opening-hours section.");
  } else {
    parts.push(`- **Opening hours:** ${hourLines.join("; ")}`);
  }
  if (phone) parts.push(`- **Phone:** ${phone}`);
  if (email) parts.push(`- **E-mail:** ${email}`);
  if (addressLine) parts.push(`- **Address:** ${addressLine}`);
  if (orgNumber) parts.push(`- **Org.nr:** ${orgNumber}`);

  parts.push(
    "",
    "**Rendering contract:**",
    `- Import from \`${BUSINESS_FACTS_IMPORT_SPECIFIER}\` wherever hours or contact details appear (footer, contact section, header). Render \`openingHoursLines\` for hours and \`businessFacts.contact\` for contact — never hardcode times, phone numbers or addresses in JSX or copy.`,
    `- Sajtmaskin rewrites \`${BUSINESS_FACTS_MODULE_PATH}\` on every publish from the owner's settings, so hand edits to that file are lost.`,
    "- Use `isOpenNow()` only in client components; it depends on the clock.",
    "- Use `openingHoursSpecification()` in LocalBusiness JSON-LD when the site has structured data.",
  );

  if (moduleExists) {
    parts.push(
      `- \`${BUSINESS_FACTS_MODULE_PATH}\` already exists in this project. Keep it unchanged and keep importing from it.`,
      "",
    );
    return parts;
  }

  parts.push(
    `- Emit \`${BUSINESS_FACTS_MODULE_PATH}\` with EXACTLY this content:`,
    "",
    "```ts",
    renderBusinessFactsModule(facts).trimEnd(),
    "```",
    "",
  );
  return parts;
}
