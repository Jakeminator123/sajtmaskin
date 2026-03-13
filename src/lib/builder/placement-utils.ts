import { placementToInstruction, type DetectedSection } from "@/lib/builder/sectionAnalyzer";

export type PlacementOption = string;

export function getPlacementInstruction(
  placement: PlacementOption,
  detectedSections?: DetectedSection[],
): string {
  if (detectedSections && detectedSections.length > 0) {
    return placementToInstruction(placement, detectedSections);
  }

  switch (placement) {
    case "top":
      return "Add it as a NEW SECTION at the VERY TOP of the homepage (`app/page.tsx`), BEFORE all existing content including the hero section.";
    case "after-hero":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) IMMEDIATELY AFTER the hero section. Look for the hero section (usually the first major section with a headline and CTA) and place this component directly after it.";
    case "after-features":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) AFTER the features/benefits section. If there is no features section, place it after the second major section on the page.";
    case "before-footer":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) at the BOTTOM of the page content, just BEFORE the footer. This should be the last content section before any footer component.";
    case "bottom":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) at the very END of the page, after all other content including the footer.";
    case "replace-section":
      return "REPLACE an existing section on the homepage (`app/page.tsx`) with this component. Identify the most similar existing section and replace it entirely.";
    default:
      if (placement.startsWith("after-")) {
        const sectionType = placement.replace("after-", "");
        return `Add it as a NEW SECTION on the homepage IMMEDIATELY AFTER the ${sectionType} section.`;
      }
      return "Add it as a new section on the homepage (`app/page.tsx`) below existing content.";
  }
}

export function getPlacementLabel(placement?: PlacementOption): string {
  switch (placement) {
    case "top":
      return "Längst upp";
    case "after-hero":
      return "Efter Hero";
    case "after-features":
      return "Efter Features";
    case "before-footer":
      return "Före Footer";
    case "replace-section":
      return "Ersätt sektion";
    case "bottom":
    case undefined:
      return "Längst ner";
    default:
      if (placement.startsWith("after-")) {
        const label = placement.replace("after-", "");
        return `Efter ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
      }
      return "Längst ner";
  }
}
