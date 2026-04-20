/**
 * Tunn klient mot npmjs-registry för att slå upp giltiga paket-versioner.
 *
 * Bakgrund: vi har historiskt litat på en hårdkodad `KNOWN_PACKAGES`-tabell i
 * `dep-completer.ts` för att pinna paket-versioner. Den tabellen blir snabbt
 * stale och kan innehålla felaktiga majors (t.ex. `lucide-react: "^1"` som
 * aldrig publicerats). Den här filen ger autofix-pipelinen ett dynamiskt
 * sätt att verifiera och uppgradera versioner mot npm-registret.
 *
 * Egenskaper:
 * - Fil-baserad cache i `os.tmpdir()/sajtmaskin-npm-cache/` med 24h TTL.
 *   Skrivs bästa-möjligen — om disken är full eller read-only swallowas felet.
 * - Begäran-timeout 1.5s. Vid timeout/network-fel returneras `null` så
 *   kallaren kan fall-back:a till statiska defaults eller lämna orört.
 * - Concurrency-cap 8 parallella begäranden för batch-uppslagningar.
 * - Headers: `application/vnd.npm.install-v1+json` ger en MYCKET mindre
 *   payload än standard-svaret (bara dist-tags + versions, inget readme).
 *
 * Säkerhet: gör ENDAST GET mot `https://registry.npmjs.org` och cache:ar
 * paket-namn lokalt. Ingen autentisering, inga side effects på npm.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REGISTRY_URL = "https://registry.npmjs.org";
const CACHE_DIR = join(tmpdir(), "sajtmaskin-npm-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 1500;
const MAX_CONCURRENT = 8;

interface CachedEntry {
  /** Latest version enligt `dist-tags.latest`, eller null om paketet inte finns. */
  version: string | null;
  /** Alla publicerade versioner (utan pre-releases filtreras). Tom om okänt. */
  versions: string[];
  fetchedAt: number;
}

function cacheFileFor(pkg: string): string {
  return join(CACHE_DIR, `${encodeURIComponent(pkg)}.json`);
}

async function readCache(pkg: string): Promise<CachedEntry | null> {
  try {
    const raw = await fs.readFile(cacheFileFor(pkg), "utf8");
    const parsed = JSON.parse(raw) as CachedEntry;
    if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) return parsed;
  } catch {
    // Cache miss or corrupt entry — fetch fresh.
  }
  return null;
}

async function writeCache(pkg: string, entry: CachedEntry): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFileFor(pkg), JSON.stringify(entry));
  } catch {
    // Best-effort; do not fail the pipeline because cache could not write.
  }
}

async function fetchPackageMeta(pkg: string): Promise<CachedEntry> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${REGISTRY_URL}/${pkg.replace(/\//g, "%2F")}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) {
      return { version: null, versions: [], fetchedAt: Date.now() };
    }
    const meta = (await res.json()) as {
      "dist-tags"?: { latest?: string };
      versions?: Record<string, unknown>;
    };
    const latest = meta["dist-tags"]?.latest ?? null;
    const versions = meta.versions ? Object.keys(meta.versions) : [];
    return { version: latest, versions, fetchedAt: Date.now() };
  } catch {
    return { version: null, versions: [], fetchedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

async function getEntry(pkg: string): Promise<CachedEntry> {
  const cached = await readCache(pkg);
  if (cached) return cached;
  const fresh = await fetchPackageMeta(pkg);
  await writeCache(pkg, fresh);
  return fresh;
}

/** Returnerar latest stable version som caret-spec (`^X.Y.Z`), eller null. */
export async function resolveLatestVersion(pkg: string): Promise<string | null> {
  const entry = await getEntry(pkg);
  return entry.version ? `^${entry.version}` : null;
}

/**
 * Validerar att en versionsspec är publicerad på npm.
 *
 * - `true` om vi inte kan verifiera (offline / cache miss / oklart paket) —
 *   "innocent until proven guilty" så vi inte felaktigt skriver över LLM:ens
 *   val när registret är otillgängligt.
 * - `false` ENDAST när vi har en lista med publicerade versioner och
 *   ingen av dem matchar specens leading major.
 *
 * Hanterade prefix: `^`, `~`, `>=`, `>`, `=`. Exakta versioner stöds också.
 */
export async function isVersionSpecValid(pkg: string, spec: string): Promise<boolean> {
  const clean = spec.replace(/^[\^~=<>]+/, "").trim();
  if (!clean) return true;

  const entry = await getEntry(pkg);
  if (entry.versions.length === 0) {
    // Network / cache miss / paketet finns inte i registret — kan inte avgöra.
    return true;
  }

  const major = clean.match(/^(\d+)/)?.[1];
  if (!major) return true;

  return entry.versions.some((v) => v.startsWith(`${major}.`));
}

/**
 * Batch-uppslagning med concurrency-cap. Returnerar map från paket → spec
 * (`^X.Y.Z` eller null om paketet inte hittades).
 */
export async function resolveLatestVersions(
  pkgs: readonly string[],
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  let cursor = 0;
  const workerCount = Math.min(MAX_CONCURRENT, Math.max(pkgs.length, 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < pkgs.length) {
        const idx = cursor++;
        const pkg = pkgs[idx];
        result[pkg] = await resolveLatestVersion(pkg);
      }
    }),
  );
  return result;
}
