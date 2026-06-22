import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * Grandmaster S3 — statusresolver-invariant (single-writer-vakt).
 *
 * Källa: docs/plans/avklarat/grandmaster/aktiviteter/S3-statusresolver-invariant.md
 *        docs/plans/avklarat/grandmaster/02-stabilitetstester.md  (N#6: "Central
 *        builder-yta läser inte legacy resolveEngineVersionDisplayStatus").
 *        Delivery-bias: varje stabilitetstest pekar på sin källa.
 *
 * Bakgrund: event-bus-status-cut-over (Område 6: 6-1 #159, 6-2 #160, 6-3 punkt 1
 * #162) är klar. Den parallella DB-helpern resolveEngineVersionDisplayStatus i
 * src/lib/db/engine-version-lifecycle.ts hade noll app-konsumenter kvar och är
 * BORTTAGEN (6-3 punkt 2, denna PR). S3 författades tidigare warn/xfail tills
 * Område 6 landat — nu flippas den till en HÅRD import-/anrops-invariant.
 *
 * Invariant som låses: ingen kod under src/** importerar eller anropar den
 * borttagna helpern. En ren grep-vakt (ingen runtime, ingen DB, ingen builder)
 * mot att en framtida ändring smyger tillbaka den döda dubbla statusvägen.
 * ROBUST mot prosa: matchar BARA (a) import-satser och (b) faktiska anrop med
 * parentes — en backtick-omsluten symbol i en kommentar triggar aldrig.
 *
 * Positiv sanity (single-writer-tillståndet dokumenteras, inte bara frånvaron):
 * de centrala builder-ytorna läser bus-vägen — BuilderShellContent via
 * useVersionStatus, VersionHistory via server-enrichat busStatus
 * (selectVersionStatus-projektionen från event-bus-projection.ts).
 */

const FORBIDDEN_SYMBOL = "resolveEngineVersionDisplayStatus";
const repoRoot = process.cwd();
const SRC_ROOT = join(repoRoot, "src");

// Invarianten skannar sig själv bort: denna fil bär regex-källan + prosa som
// annars vore en falsk träff.
const SELF_BASENAME = "status-resolver-single-writer.stability.test.ts";

// (a) Import-sats — testas mot HELA filinnehållet så att [^;]* spänner över
//     radbrytningar i en multi-line import fram till satsens semikolon.
const IMPORT_RE = new RegExp(`import\\b[^;]*${FORBIDDEN_SYMBOL}`);
// (b) Faktiskt anrop `symbol(` — testas per rad (ett anrop ligger på en rad) så
//     att en symbol i slutet av en prosa-rad aldrig kan brygga till ett `(` på
//     nästa rad.
const CALL_RE = new RegExp(`${FORBIDDEN_SYMBOL}\\s*\\(`);

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    // Hoppa över node_modules och alla dot-kataloger (täcker .next, .eslintcache m.fl.).
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkTsFiles(p, acc);
    } else if (st.isFile() && /\.tsx?$/.test(name) && name !== SELF_BASENAME) {
      acc.push(p);
    }
  }
  return acc;
}

describe("S3 statusresolver-invariant (single-writer)", () => {
  it("ingen kod under src/** importerar eller anropar den borttagna resolveEngineVersionDisplayStatus", () => {
    expect(
      existsSync(SRC_ROOT),
      `Förväntade att ${SRC_ROOT} finns (cwd=${repoRoot}). Kör Vitest från repo-roten.`,
    ).toBe(true);

    const violations: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf8");
      const rel = relative(repoRoot, file);
      if (IMPORT_RE.test(content)) {
        violations.push(`${rel} — import av borttagen helper`);
      }
      content.split("\n").forEach((line, i) => {
        if (CALL_RE.test(line)) {
          violations.push(`${rel}:${i + 1} — anrop av borttagen helper`);
        }
      });
    }

    expect(violations.sort(), violations.join("\n")).toEqual([]);
  });

  it("central builder-yta läser bus-vägen (single-writer dokumenterad, ej bara frånvaro)", () => {
    const shell = join(SRC_ROOT, "app", "builder", "BuilderShellContent.tsx");
    const history = join(SRC_ROOT, "components", "builder", "VersionHistory.tsx");

    expect(existsSync(shell), `Saknar ${shell}`).toBe(true);
    expect(existsSync(history), `Saknar ${history}`).toBe(true);

    // BuilderShellContent härleder aktiv versions-status via event-bus-hooken.
    expect(readFileSync(shell, "utf8")).toContain("useVersionStatus");
    // VersionHistory läser serverns event-bus-projektion per rad (busStatus).
    expect(readFileSync(history, "utf8")).toContain("busStatus");
  });
});
