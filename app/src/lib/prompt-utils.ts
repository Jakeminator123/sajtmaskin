// Shared prompt utilities for v0 interactions

export interface MediaLibraryItem {
  url: string;
  filename: string;
  description?: string;
}

/**
 * Enhance a prompt for v0 by resolving media library references.
 * Adds a catalog of available images so v0 can use exact URLs.
 */
export function enhancePromptForV0(
  prompt: string,
  mediaLibrary?: MediaLibraryItem[]
): string {
  if (!mediaLibrary || mediaLibrary.length === 0) {
    return prompt;
  }

  let enhanced = prompt;

  const mediaReferences = [
    "mediabibliotek",
    "min bild",
    "mina bilder",
    "uppladdade",
    "den som ser ut som",
    "bilden med",
    "logon",
    "logotypen",
  ];

  const hasMediaReference = mediaReferences.some((ref) =>
    prompt.toLowerCase().includes(ref)
  );

  if (hasMediaReference) {
    const mediaCatalog = mediaLibrary
      .map(
        (item, i) =>
          `[Bild ${i + 1}]: ${item.url} - "${
            item.description || item.filename
          }"`
      )
      .join("\n");

    enhanced = `${prompt}

═══════════════════════════════════════════════════════════════════════
TILLGÄNGLIGA BILDER FRÅN MEDIABIBLIOTEKET:
═══════════════════════════════════════════════════════════════════════
${mediaCatalog}

INSTRUKTION: Använd EXAKTA URLs från listan ovan i <img src="..."> taggar.
Matcha användarens beskrivning med rätt bild baserat på filnamn/beskrivning.
═══════════════════════════════════════════════════════════════════════`;
  }

  return enhanced;
}

