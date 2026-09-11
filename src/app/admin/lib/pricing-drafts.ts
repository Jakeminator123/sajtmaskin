/**
 * Behåll osparade utkast när servern skickar en ny effektiv prislista.
 *
 * `reload()` ger ett nytt dataobjekt efter varje sparning. Utan den här
 * jämförelsen skulle alla fält skrivas om från `effective` och sudda ut
 * text som operatören redan hunnit skriva i ett annat fält.
 *
 * Ett fält synkas bara om det saknas, eller om utkastet fortfarande är
 * lika med det förra effektiva värdet (alltså orört).
 */
export function keepUnsavedDrafts(
  drafts: Record<string, string>,
  previousEffective: Record<string, string> | null,
  nextEffective: Record<string, string>,
): Record<string, string> {
  if (!previousEffective) return { ...nextEffective };
  const next = { ...drafts };
  for (const [key, value] of Object.entries(nextEffective)) {
    const current = drafts[key];
    if (current === undefined || current === previousEffective[key]) {
      next[key] = value;
    }
  }
  return next;
}

export function keepUnsavedDraft(
  current: string,
  previousEffective: string | null,
  nextEffective: string,
): string {
  if (previousEffective === null || current === previousEffective) {
    return nextEffective;
  }
  return current;
}
