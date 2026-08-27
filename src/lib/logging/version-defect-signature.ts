import { createHash } from "node:crypto";

/**
 * Defektsignatur för rader i `engine_version_error_logs`.
 *
 * Liggaren har länge samlat fel från många producenter, men två rader som
 * beskriver *samma* fel i två olika chattar har sett helt olika ut: chat-id,
 * versions-id, portar och radnummer sitter mitt i meddelandetexten. Det gick
 * därför inte att svara på den enda fråga som gör historiken värd något —
 * "hur ofta händer det här, och blev det bättre?".
 *
 * Signaturen är svaret: en stabil nyckel per felKLASS, inte per felhändelse.
 * `kind` grovsorterar, `signature` grupperar exakt. Båda skrivs i `meta.defect`
 * på den kanoniska skrivvägen (`createEngineVersionErrorLogs`), så varje
 * producent får dem utan att ändras.
 *
 * Medvetet INTE en bedömning av allvarlighet eller åtgärdbarhet. Den här
 * modulen svarar bara på "vad är det här för sorts fel, och vilka andra rader
 * är samma fel". Vad som ska blockera eller repareras bestäms av gates, inte
 * här.
 */

/** Grovsortering. `other` är en giltig utgång, inte ett misslyckande. */
export type VersionDefectKind =
  | "compile"
  | "hydration"
  | "runtime"
  | "network"
  | "product"
  | "env"
  | "other";

export type VersionDefect = {
  kind: VersionDefectKind;
  /** Stabil nyckel för felklassen. Samma fel i två chattar ⇒ samma sträng. */
  signature: string;
  file?: string;
  line?: number;
};

export type VersionDefectInput = {
  category?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};

const SIGNATURE_LENGTH = 12;
const NORMALIZED_MAX = 300;
/**
 * Taket klipps INNAN regexarbetet, inte efter.
 *
 * Mönstren nedan har en nästlad kvantifierare (`(?:[\w.-]+\/)*?`) som backtrackar
 * kvadratiskt på en lång sträng utan snedstreck. Ett byggfel kan vara tiotals
 * kilobyte, och klassificeraren kör på varje skrivning till felliggaren — utan
 * taket vore en lång rad nog för att sänka skrivvägen. Signaturen använder ändå
 * bara de första `NORMALIZED_MAX` tecknen.
 */
const NORMALIZE_INPUT_MAX = 1_000;

/** Källrötter vars sökvägsprefix är miljöberoende brus. */
const SOURCE_ROOT_GROUP = "(?:node_modules|src|app|components)";

/**
 * Absolut sökvägsprefix fram till första källroten.
 *
 * Två detaljer bär hela beteendet:
 *  - **Negativ lookbehind på `.` och `\w`** gör mönstret blint för RELATIVA
 *    sökvägar. Utan den matchar `./components/Hero` och blir `.components/hero`,
 *    vilket slår ihop alla saknade moduler till en enda signatur.
 *  - **Lat kvantifierare** stannar vid FÖRSTA källroten. Girigt skulle
 *    `/x/y/src/app/p.tsx` ätas fram till `app/` och bli omöjlig att skilja
 *    från `/x/y/app/p.tsx`.
 *
 * Noll segment tillåts med flit, så att ett kort `/src/app/page.tsx` kortas
 * till samma form som ett långt `/home/runner/work/src/app/page.tsx`.
 */
const ABSOLUTE_PATH_PREFIX_RE = new RegExp(
  `(?<![.\\w])\\/(?:[\\w.-]+\\/)*?(?=${SOURCE_ROOT_GROUP}\\/)`,
  "g",
);

/**
 * Samma sökvägsform oavsett hur anroparen råkade skriva den.
 *
 * Filen ingår i signaturen, så `/src/a.tsx` och `src/a.tsx` skulle annars bli
 * två defekter trots att de är en — precis den uppdelning signaturen finns för
 * att undvika.
 */
export function normalizeDefectFile(file: string): string {
  return String(file ?? "")
    .slice(0, NORMALIZE_INPUT_MAX)
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:\//, "/")
    .replace(ABSOLUTE_PATH_PREFIX_RE, "")
    .replace(/^\.\//, "")
    .trim();
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * `product_postcheck.<code>` bär koden i kategorin, medan
 * `preview:client-error` bär den i `meta.kind`. Båda mappas hit så att
 * hydrationsfel hamnar i samma hink oavsett vilken vakt som såg dem.
 */
function kindFromProductPostcheckCode(code: string): VersionDefectKind {
  switch (code) {
    case "hydration_mismatch":
    case "hydration_dom_loss":
      return "hydration";
    case "runtime_crash":
    case "console_error":
    case "preview_boot_page":
      return "runtime";
    case "preview_probe_unreadable":
    case "live_review":
    case "summary":
    case "skipped":
      return "other";
    case "request_failed":
    case "http_error":
    case "broken_image":
      return "network";
    default:
      // broken_anchor, cta_no_handler, fake_form, mobile_menu_failed, summary …
      return "product";
  }
}

function kindFromClientErrorMeta(meta: Record<string, unknown> | null | undefined): VersionDefectKind {
  const kind = metaString(meta, "kind");
  if (kind === "hydration") return "hydration";
  return "runtime";
}

export function classifyVersionDefectKind(input: VersionDefectInput): VersionDefectKind {
  const category = (input.category ?? "").trim().toLowerCase();
  const message = input.message ?? "";

  if (category === "preview:client-error") return kindFromClientErrorMeta(input.meta);
  if (category.startsWith("product_postcheck.")) {
    return kindFromProductPostcheckCode(category.slice("product_postcheck.".length));
  }
  if (category === "f3-readiness:missing-env") return "env";

  // Readiness-sonden rapporterar Next byggfel-överlägg under den generiska
  // `preview`-kategorin; det som skiljer den från annan preview-diagnostik är
  // källan i metan.
  if (category === "preview" && metaString(input.meta, "source") === "preview_readiness_probe") {
    return "compile";
  }

  if (
    category === "syntax" ||
    category === "code_structure_failure" ||
    category.startsWith("quality-gate:typecheck") ||
    category.startsWith("quality-gate:build") ||
    category === "preview-vm"
  ) {
    return "compile";
  }

  // Sista utvägen: texten. Bara entydiga formuleringar, annars `other` —
  // en felaktig hink är värre än ingen hink, eftersom statistiken bygger på den.
  if (/failed to compile|module not found|cannot find module/i.test(message)) return "compile";
  if (/hydrat|server[- ]rendered html did(?:n't| not) match/i.test(message)) return "hydration";

  return "other";
}

/**
 * Plocka bort allt som är unikt för EN händelse men inte för felklassen.
 *
 * Ordningen är inte godtycklig: id:n måste bort innan siffror maskeras, annars
 * har `chat_a1b2c3` redan blivit `chat_a<n>b<n>c<n>` och matchar inte
 * id-mönstret. URL:er kortas till sin sökväg eftersom värden (preview-VM:ens
 * host) varierar mellan miljöer medan sökvägen är det som beskriver felet.
 *
 * Citerade namn lämnas kvar med flit — i `Module not found: Can't resolve
 * './components/Hero'` är modulnamnet hela signalen, och maskas det bort
 * kollapsar alla saknade moduler till en enda signatur.
 */
export function normalizeDefectMessage(raw: unknown): string {
  // `String(...)` och taket före allt annat: modulen ligger på en best-effort
  // diagnostikväg och får aldrig kasta. Ett icke-strängvärde som slinker in
  // genom en otypad route ska bli en dålig signatur, inte ett 500-svar.
  let text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  text = text.slice(0, NORMALIZE_INPUT_MAX).trim();
  if (!text) return "";

  // URL → sökväg. Query och fragment beskriver anropet, inte felet.
  text = text.replace(/https?:\/\/[^\s)'"]+/gi, (match) => {
    try {
      return new URL(match).pathname || "/";
    } catch {
      return match;
    }
  });

  text = text
    // UUID
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    // chat-/version-prefixade id:n
    .replace(/\b(chat|version|ver|v0|dpl|prj)[_-][A-Za-z0-9_-]{6,}/gi, "<id>")
    // Långa hex-strängar (hashar, revisioner)
    .replace(/\b[0-9a-f]{16,}\b/gi, "<id>")
    // Absolutprefix: behåll svansen, den är den läsbara delen.
    .replace(/\b[A-Za-z]:\\[^\s:]+\\/g, "")
    .replace(ABSOLUTE_PATH_PREFIX_RE, "")
    // Radnummer/kolumner och alla övriga tal
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return text.slice(0, NORMALIZED_MAX);
}

/**
 * `at src/components/Hero.tsx:42:7` och liknande. `meta.file` vinner när den
 * finns — den är strukturerad och därmed pålitligare än en textmatchning.
 */
export function extractDefectLocation(input: VersionDefectInput): { file?: string; line?: number } {
  const metaFile = metaString(input.meta, "file") ?? metaString(input.meta, "route");
  const metaLineRaw = input.meta?.line;
  const metaLine = typeof metaLineRaw === "number" && Number.isFinite(metaLineRaw) ? metaLineRaw : undefined;
  if (metaFile) {
    const file = normalizeDefectFile(metaFile);
    return metaLine === undefined ? { file } : { file, line: metaLine };
  }

  const message = typeof input.message === "string" ? input.message.slice(0, NORMALIZE_INPUT_MAX) : "";
  const match = /([\w./-]+\.(?:tsx|ts|jsx|js|mjs|cjs|css))(?::(\d+))?/.exec(message);
  if (!match) return {};
  const file = normalizeDefectFile(match[1]);
  const line = match[2] ? Number.parseInt(match[2], 10) : undefined;
  return line === undefined || !Number.isFinite(line) ? { file } : { file, line };
}

/**
 * Signaturen hashar `kind` + normaliserad text + fil. Filen ingår för att två
 * identiska meddelanden i olika filer är två defekter, inte en.
 *
 * Radnumret ingår medvetet INTE: samma defekt vandrar några rader efter en
 * redigering utan att bli en ny defekt, och räknaren skulle då nollställas
 * precis när historiken börjar bli intressant.
 */
export function buildDefectSignature(kind: VersionDefectKind, normalized: string, file?: string): string {
  const basis = `${kind}|${normalized}|${(file ?? "").toLowerCase()}`;
  return createHash("sha1").update(basis).digest("hex").slice(0, SIGNATURE_LENGTH);
}

/**
 * Full klassificering. Returnerar `null` när raden saknar meddelande — då
 * finns inget att gruppera på, och en signatur över tomma strängen hade slagit
 * ihop orelaterade rader till en jättehink.
 */
export function classifyVersionDefect(input: VersionDefectInput): VersionDefect | null {
  const normalized = normalizeDefectMessage(input.message ?? "");
  if (!normalized) return null;

  const kind = classifyVersionDefectKind(input);
  const location = extractDefectLocation(input);
  const signature = buildDefectSignature(kind, normalized, location.file);

  return { kind, signature, ...location };
}
