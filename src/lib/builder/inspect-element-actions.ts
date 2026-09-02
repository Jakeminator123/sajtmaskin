import type { QuickEditClientOp } from "@/lib/builder/engine-files-patch";

/**
 * Klassificering av ett element som användaren pekat ut i previewen.
 *
 * Inspektorbron ger elementets DOM-fakta (tagg, egen text, `src`) och
 * JSX-registret ger fil + rad. Den här modulen sätter ihop de två och svarar på
 * EN fråga: vilka direkta åtgärder går faktiskt att utföra på elementet?
 *
 * Svaret måste komma före menyn — annars erbjuder menyn åtgärder som tystnar.
 * Allt här är läs-only och rent: inga nätverksanrop, ingen DOM, inget React.
 */

/** DOM-fakta som det injicerade bron-scriptet skickar upp för ett element. */
export type InspectedElement = {
  tag: string;
  /** Elementets EGNA textnoder (inte barnens) — `null` när det saknas. */
  ownText: string | null;
  /** Hela den synliga texten inklusive barn. */
  text: string | null;
  /** `src` som den ser ut i webbläsaren (kan vara omskriven av bildoptimering). */
  src: string | null;
  childElementCount: number;
};

/** Träffen i koden: fil och rad där elementets starttagg står. */
export type InspectCodeLocation = {
  filePath: string;
  lineNumber: number;
};

export type TextEditTarget = {
  filePath: string;
  lineNumber: number;
  /** Exakt sträng i filen som byts ut. */
  find: string;
  /** 1-baserad förekomst i filen (krävs när strängen inte är unik). */
  occurrence: number;
  /** Nuvarande text, för förifyllning av rutan. */
  current: string;
};

export type ImageEditTarget = {
  filePath: string;
  lineNumber: number;
  /** Hela attributet som det står skrivet, t.ex. `src="/hero.png"`. */
  find: string;
  occurrence: number;
  currentSrc: string;
  quote: string;
};

export type DeleteElementTarget = {
  filePath: string;
  lineNumber: number;
  tagName: string;
};

export type InspectAction<T> =
  | { available: true; target: T }
  | { available: false; reason: string };

export type InspectElementActions = {
  editText: InspectAction<TextEditTarget>;
  replaceImage: InspectAction<ImageEditTarget>;
  deleteElement: InspectAction<DeleteElementTarget>;
};

/** Filändelser där en JSX-nod kan bo (samma dialektregel som borttagningen). */
const JSX_CAPABLE_EXT_RE = /\.(?:[mc]?jsx?|tsx)$/i;

const NO_CODE_MATCH = "Vi hittade inte elementet i sidans kod.";
const FILE_NOT_LOADED = "Sidans kod är inte inläst ännu.";
const TAG_NOT_ON_LINE = "Vi hittade inte elementet i sidans kod.";

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&quot;/g, '"'],
  [/&#0*39;|&apos;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
];

function normalizeVisibleText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of ENTITIES) {
    out = out.replace(pattern, replacement);
  }
  // Non-breaking space i källan renderas som vanligt mellanslag.
  return out.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineStartIndex(content: string, lineNumber: number): number {
  let index = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const next = content.indexOf("\n", index);
    if (next === -1) return -1;
    index = next + 1;
  }
  return index <= content.length ? index : -1;
}

type OpeningTag = {
  /** Index för `<`. */
  start: number;
  /** Index för `>`. */
  end: number;
  attributes: string;
  selfClosing: boolean;
};

/**
 * Hittar starttaggens exakta span. Skannern hoppar över citerade värden och
 * `{…}`-uttryck så ett `>` inuti ett attribut inte avslutar taggen för tidigt.
 */
function scanOpeningTag(content: string, tagStart: number, tag: string): OpeningTag | null {
  let index = tagStart + 1 + tag.length;
  let quote: string | null = null;
  let braceDepth = 0;
  while (index < content.length) {
    const char = content[index];
    if (quote) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }
    if (braceDepth === 0 && char === ">") {
      const selfClosing = content[index - 1] === "/";
      const attributesEnd = selfClosing ? index - 1 : index;
      return {
        start: tagStart,
        end: index,
        attributes: content.slice(tagStart + 1 + tag.length, attributesEnd),
        selfClosing,
      };
    }
    index += 1;
  }
  return null;
}

function findOpeningTagOnLine(
  content: string,
  lineNumber: number,
  tag: string,
): OpeningTag | null {
  const start = lineStartIndex(content, lineNumber);
  if (start < 0) return null;
  const lineEndRaw = content.indexOf("\n", start);
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw;
  const line = content.slice(start, lineEnd);
  const pattern = new RegExp(`<${escapeRegExp(tag)}(?=[\\s/>])`, "gi");
  let match = pattern.exec(line);
  while (match) {
    const scanned = scanOpeningTag(content, start + match.index, tag);
    if (scanned) return scanned;
    match = pattern.exec(line);
  }
  return null;
}

/** 1-baserad förekomst av `needle` i `content` med start på `index`. */
function occurrenceAt(content: string, needle: string, index: number): number {
  let count = 0;
  let from = 0;
  while (from <= index) {
    const found = content.indexOf(needle, from);
    if (found === -1 || found > index) break;
    count += 1;
    if (found === index) return count;
    from = found + needle.length;
  }
  return count > 0 ? count : 1;
}

type SourceAttribute = {
  /** Attributet som det står skrivet, t.ex. `src="/hero.png"`. */
  raw: string;
  value: string;
  quote: string;
};

/**
 * Attributet måste stå för sig självt — `(?:^|\s)` i stället för `\b` så att
 * `data-src="…"` inte plockas upp som elementets `src`.
 */
function readLiteralAttribute(attributes: string, name: string): SourceAttribute | null {
  const literal = new RegExp(
    `(?:^|\\s)(${name}\\s*=\\s*(["'])((?:(?!\\2)[^\\\\])*)\\2)`,
    "i",
  );
  const match = attributes.match(literal);
  if (match?.[1] && typeof match[3] === "string") {
    return { raw: match[1], value: match[3], quote: match[2] };
  }
  return null;
}

function hasAttribute(attributes: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}\\s*=`, "i").test(attributes);
}

function unavailable<T>(reason: string): InspectAction<T> {
  return { available: false, reason };
}

/**
 * Vilka direkta åtgärder som går att utföra på det utpekade elementet.
 * Otillgängliga åtgärder får en kort orsak i klarspråk — menyn visar dem
 * gråade i stället för att dölja dem.
 */
export function classifyInspectedElement(params: {
  element: InspectedElement;
  location: InspectCodeLocation | null;
  fileContent: string | null;
}): InspectElementActions {
  const { element, location, fileContent } = params;

  if (!location) {
    return {
      editText: unavailable(NO_CODE_MATCH),
      replaceImage: unavailable(NO_CODE_MATCH),
      deleteElement: unavailable(NO_CODE_MATCH),
    };
  }

  const jsxCapable = JSX_CAPABLE_EXT_RE.test(location.filePath);
  const deleteElement: InspectAction<DeleteElementTarget> = jsxCapable
    ? {
        available: true,
        target: {
          filePath: location.filePath,
          lineNumber: location.lineNumber,
          tagName: element.tag,
        },
      }
    : unavailable("Elementet ligger i en fil där det inte går att ta bort delar.");

  if (!fileContent) {
    return {
      editText: unavailable(FILE_NOT_LOADED),
      replaceImage: unavailable(FILE_NOT_LOADED),
      deleteElement,
    };
  }

  const opening = findOpeningTagOnLine(fileContent, location.lineNumber, element.tag);
  if (!opening) {
    return {
      editText: unavailable(TAG_NOT_ON_LINE),
      replaceImage: unavailable(TAG_NOT_ON_LINE),
      deleteElement,
    };
  }

  return {
    editText: classifyText(element, location, fileContent, opening),
    replaceImage: classifyImage(element, location, fileContent, opening),
    deleteElement,
  };
}

function classifyText(
  element: InspectedElement,
  location: InspectCodeLocation,
  content: string,
  opening: OpeningTag,
): InspectAction<TextEditTarget> {
  if (opening.selfClosing) {
    return unavailable("Det här elementet har ingen text.");
  }
  if (element.childElementCount > 0) {
    return unavailable("Elementet innehåller andra element i stället för egen text.");
  }

  const bodyStart = opening.end + 1;
  const nextTag = content.indexOf("<", bodyStart);
  const rawBody = content.slice(bodyStart, nextTag === -1 ? content.length : nextTag);
  if (rawBody.includes("{")) {
    return unavailable("Texten hämtas från en annan del av koden.");
  }

  const literal = rawBody.trim();
  if (!literal) {
    return unavailable("Det här elementet har ingen text.");
  }

  const visible = element.ownText ?? element.text ?? "";
  if (normalizeVisibleText(literal) !== normalizeVisibleText(visible)) {
    return unavailable("Texten på skärmen ser inte likadan ut som i koden.");
  }

  const literalIndex = bodyStart + rawBody.indexOf(literal);
  return {
    available: true,
    target: {
      filePath: location.filePath,
      lineNumber: location.lineNumber,
      find: literal,
      occurrence: occurrenceAt(content, literal, literalIndex),
      current: literal,
    },
  };
}

function classifyImage(
  element: InspectedElement,
  location: InspectCodeLocation,
  content: string,
  opening: OpeningTag,
): InspectAction<ImageEditTarget> {
  if (element.tag !== "img") {
    return unavailable("Det här elementet är ingen bild.");
  }
  const attribute = readLiteralAttribute(opening.attributes, "src");
  if (!attribute) {
    if (hasAttribute(opening.attributes, "src")) {
      return unavailable("Bildens adress hämtas från en annan del av koden.");
    }
    return unavailable("Bilden saknar en adress som går att byta här.");
  }

  const attributeIndex = content.indexOf(attribute.raw, opening.start);
  return {
    available: true,
    target: {
      filePath: location.filePath,
      lineNumber: location.lineNumber,
      find: attribute.raw,
      occurrence: occurrenceAt(content, attribute.raw, attributeIndex),
      currentSrc: attribute.value,
      quote: attribute.quote,
    },
  };
}

/** Tecken som skulle göra JSX-texten osyntaktisk om de skrevs rakt in. */
const FORBIDDEN_TEXT_CHARS = /[<>{}]/;

/** `null` = texten går att spara. Annars en orsak i klarspråk. */
export function validateInspectTextInput(next: string): string | null {
  if (FORBIDDEN_TEXT_CHARS.test(next)) {
    return "Tecknen < > { } går inte att använda här.";
  }
  return null;
}

export function buildTextEditOps(
  target: TextEditTarget,
  nextText: string,
): QuickEditClientOp[] {
  const trimmed = nextText.trim();
  if (trimmed === target.find) return [];
  return [
    {
      kind: "replace_text",
      path: target.filePath,
      find: target.find,
      replace: trimmed,
      occurrence: target.occurrence,
    },
  ];
}

/** `null` = adressen går att spara. Annars en orsak i klarspråk. */
export function validateInspectImageInput(next: string, quote: string): string | null {
  const trimmed = next.trim();
  if (!trimmed) return "Bildadressen kan inte vara tom.";
  if (trimmed.includes(quote) || FORBIDDEN_TEXT_CHARS.test(trimmed)) {
    return "Bildadressen innehåller tecken som inte fungerar här.";
  }
  return null;
}

export function buildImageEditOps(
  target: ImageEditTarget,
  nextSrc: string,
): QuickEditClientOp[] {
  const trimmed = nextSrc.trim();
  if (!trimmed || trimmed === target.currentSrc) return [];
  return [
    {
      kind: "replace_text",
      path: target.filePath,
      find: target.find,
      replace: `src=${target.quote}${trimmed}${target.quote}`,
      occurrence: target.occurrence,
    },
  ];
}

export function buildDeleteElementOps(target: DeleteElementTarget): QuickEditClientOp[] {
  return [
    {
      kind: "delete_jsx_node",
      path: target.filePath,
      lineNumber: target.lineNumber,
      tagName: target.tagName,
    },
  ];
}

/**
 * Serverns avslagskoder översatta till klarspråk. `jsx_delete_unsafe` är den
 * viktiga: borttagningen utfördes INTE, så texten får inte antyda att något
 * gick sönder på riktigt.
 */
export function describeInspectQuickEditError(result: {
  error?: string;
  reason?: string;
}): string {
  const reason = result.reason || result.error;
  switch (reason) {
    case "jsx_delete_unsupported":
      return "Det här elementet går inte att ta bort härifrån.";
    case "jsx_delete_unsafe":
      return "Borttagningen hade gjort sidan trasig, så den utfördes inte.";
    case "no_match":
      return "Vi hittade inte texten i koden längre. Ladda om previewen och försök igen.";
    case "ambiguous_match":
      return "Samma text finns på flera ställen i filen — ändra den i kodvyn i stället.";
    case "no_change":
      return "Ingenting ändrades.";
    case "protected_path":
    case "unsafe_path":
      return "Den här filen går inte att ändra härifrån.";
    case "base_busy":
      return "Versionen kontrolleras just nu. Vänta en stund och försök igen.";
    case "lease_unavailable":
      return "Versionlåset kunde inte bevisas just nu. Vänta en stund och försök igen.";
    case "stale_base_version":
      return "En nyare version finns redan. Ladda om för att fortsätta från den senaste.";
    case "integrations_base":
      return "Den här versionen är byggd med integrationer och ändras via chatten i stället.";
    default:
      return result.error || "Ändringen kunde inte sparas.";
  }
}
