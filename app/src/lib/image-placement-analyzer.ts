/**
 * Analyzes code to find potential image placement locations
 * Returns dynamic suggestions based on actual code structure
 */

export interface ImagePlacementSuggestion {
  id: string;
  label: string;
  description: string;
  prompt: string;
  priority: number; // Higher = more relevant
}

export function analyzeImagePlacements(
  code: string | null,
  imageUrl: string
): ImagePlacementSuggestion[] {
  if (!code || code.length === 0) {
    // Fallback to generic options if no code
    return getGenericPlacements(imageUrl);
  }

  const suggestions: ImagePlacementSuggestion[] = [];
  const codeLower = code.toLowerCase();

  // 1. Check for hero sections
  if (
    codeLower.includes("hero") ||
    codeLower.includes("banner") ||
    codeLower.includes("header")
  ) {
    // Check if there's already a background image
    const hasBackground =
      codeLower.includes("backgroundimage") ||
      codeLower.includes("bg-image") ||
      codeLower.includes("background-image");

    if (!hasBackground) {
      suggestions.push({
        id: "hero-background",
        label: "Hero bakgrund",
        description: "Använd som bakgrund i hero-sektionen",
        prompt: `Hero bakgrund: ${imageUrl}`,
        priority: 10,
      });
    }

    suggestions.push({
      id: "hero-image",
      label: "Hero-bild",
      description: "Stor bild i hero med text ovanpå",
      prompt: `Hero-bild: ${imageUrl}`,
      priority: 9,
    });
  }

  // 2. Check for image galleries/grids
  const galleryMatches = code.match(
    /(gallery|grid|images?|photos?|placeholders?|items?)\s*(?:\[|\(|\{|\s*=\s*\[)/gi
  );
  if (galleryMatches) {
    // Count existing images/placeholders
    const imageCount = (code.match(/src\s*=\s*["']/gi) || []).length;
    const placeholderMatches = code.match(/placeholder|dummy|empty/gi) || [];
    const totalPlaceholders = placeholderMatches.length + imageCount;

    if (totalPlaceholders > 0) {
      // Suggest adding to specific position
      const position = totalPlaceholders + 1;
      suggestions.push({
        id: `gallery-${position}`,
        label: `Bild ${position} i galleri`,
        description: `Lägg till som ${position}:e bilden i galleriet`,
        prompt: `Bild ${position} i galleri: ${imageUrl}`,
        priority: 8,
      });
    } else {
      suggestions.push({
        id: "gallery-new",
        label: "Nytt bildgalleri",
        description: "Skapa ett galleri med denna bild",
        prompt: `Nytt galleri: ${imageUrl}`,
        priority: 7,
      });
    }
  }

  // 3. Check for product sections
  if (
    codeLower.includes("product") ||
    codeLower.includes("shop") ||
    codeLower.includes("item")
  ) {
    suggestions.push({
      id: "product-image",
      label: "Produktbild",
      description: "Använd som produktbild",
      prompt: `Produktbild: ${imageUrl}`,
      priority: 7,
    });
  }

  // 4. Check for logo/header
  if (
    codeLower.includes("logo") ||
    (codeLower.includes("header") && !codeLower.includes("hero"))
  ) {
    suggestions.push({
      id: "logo",
      label: "Logo",
      description: "Använd som logo i header",
      prompt: `Logo: ${imageUrl}`,
      priority: 6,
    });
  }

  // 5. Check for sections that could use images
  const sectionMatches = code.match(/section|div.*className.*section/gi) || [];
  if (sectionMatches.length > 0) {
    suggestions.push({
      id: "section-image",
      label: "Sektionsbild",
      description: "Lägg till i en sektion",
      prompt: `Sektionsbild: ${imageUrl}`,
      priority: 5,
    });
  }

  // 6. Always add generic options as fallback (lower priority)
  const genericOptions = getGenericPlacements(imageUrl);
  suggestions.push(
    ...genericOptions.map((opt) => ({ ...opt, priority: opt.priority - 5 }))
  );

  // Sort by priority (highest first) and remove duplicates
  const unique = new Map<string, ImagePlacementSuggestion>();
  suggestions
    .sort((a, b) => b.priority - a.priority)
    .forEach((s) => {
      if (!unique.has(s.id)) {
        unique.set(s.id, s);
      }
    });

  return Array.from(unique.values()).slice(0, 6); // Max 6 options
}

function getGenericPlacements(imageUrl: string): ImagePlacementSuggestion[] {
  return [
    {
      id: "background",
      label: "Bakgrund",
      description: "Använd som bakgrund",
      prompt: `Bakgrund: ${imageUrl}`,
      priority: 4,
    },
    {
      id: "hero",
      label: "Hero-bild",
      description: "Stor bild i hero",
      prompt: `Hero-bild: ${imageUrl}`,
      priority: 3,
    },
    {
      id: "gallery",
      label: "Bildgalleri",
      description: "Lägg till i galleri",
      prompt: `Galleribild: ${imageUrl}`,
      priority: 2,
    },
    {
      id: "section",
      label: "Sektionsbild",
      description: "Lägg till i sektion",
      prompt: `Sektionsbild: ${imageUrl}`,
      priority: 1,
    },
  ];
}
