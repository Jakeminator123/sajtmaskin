/**
 * Audit cloned template repos (e.g. shadcn-io-mirror/repos) against Sajtmaskin TCH.
 *
 * Usage (from repo root):
 *   node scripts/audit/audit-shadcn-mirror-repos.mjs
 *   node scripts/audit/audit-shadcn-mirror-repos.mjs --root "C:/path/to/shadcn-io-mirror/repos"
 *   SHADCN_MIRROR_REPOS=C:/path node scripts/audit/audit-shadcn-mirror-repos.mjs
 *   node scripts/audit/audit-shadcn-mirror-repos.mjs --json > report.json
 *   node scripts/audit/audit-shadcn-mirror-repos.mjs --strict   # exit 1 if any repo is red
 *   node scripts/audit/audit-shadcn-mirror-repos.mjs --verbose # full per-repo table (~200 lines)
 *
 * Default (no --verbose): short summary only — use --json or --verbose when you need detail.
 *
 * Policy: config/shadcn-mirror-audit-policy.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

function loadPolicy() {
  const p = path.join(root, "config", "shadcn-mirror-audit-policy.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return raw.sajtmaskinTarget;
}

function parseArgs(argv) {
  const out = { json: false, strict: false, verbose: false, root: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--strict") out.strict = true;
    else if (a === "--verbose" || a === "-v") out.verbose = true;
    else if (a === "--root" && argv[i + 1]) {
      out.root = argv[++i];
    }
  }
  return out;
}

function resolveReposRoot(cliRoot) {
  if (cliRoot) return path.resolve(cliRoot);
  const env = process.env.SHADCN_MIRROR_REPOS?.trim();
  if (env) return path.resolve(env);
  const rel = path.join(root, "..", "_template_refs", "shadcn-io-mirror", "repos");
  return path.resolve(rel);
}

/** @returns {{ raw: string, major: number | null, label: string }} */
function parseDepVersion(spec) {
  if (spec == null || typeof spec !== "string") return { raw: "", major: null, label: "—" };
  const s = spec.trim();
  if (!s || s === "workspace:*" || s === "*") return { raw: s, major: null, label: s || "—" };
  const m = s.match(/(\d+)/);
  const major = m ? parseInt(m[1], 10) : null;
  return { raw: s, major: Number.isFinite(major) ? major : null, label: s };
}

/** Rough engines.node → list of allowed majors or null */
function parseEnginesNode(engines) {
  if (!engines || typeof engines.node !== "string") return { text: null, majors: null };
  const text = engines.node.trim();
  const majors = new Set();
  for (const part of text.split(/\s*\|\|\s*/)) {
    const range = part.trim();
    const m = range.match(/^>=?\s*(\d+)/);
    if (m) {
      const lo = parseInt(m[1], 10);
      if (range.includes("<")) {
        const hi = range.match(/<\s*(\d+)/);
        if (hi) {
          const hiM = parseInt(hi[1], 10);
          for (let x = lo; x < hiM; x++) majors.add(x);
        }
      } else {
        majors.add(lo);
      }
    }
    const exact = range.match(/^(\d+)\./);
    if (exact) majors.add(parseInt(exact[1], 10));
  }
  return { text, majors: majors.size ? [...majors].sort((a, b) => a - b) : null };
}

function readPkg(dir) {
  const fp = path.join(dir, "package.json");
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function classify(policy, nextM, reactM, tailwindM, enginesMajors) {
  let tier = "gray";
  const notes = [];

  if (nextM == null) {
    return { tier: "gray", notes: ["no Next.js in root package.json"] };
  }

  if (nextM >= policy.nextMajorGreen) {
    tier = "green";
    notes.push(`Next ${nextM}+ (green vs target ${policy.nextMajorGreen})`);
  } else if (nextM >= policy.nextMajorAmberMin) {
    tier = "amber";
    notes.push(`Next ${nextM} (amber; upgrade to ${policy.nextMajorGreen} for TCH)`);
  } else {
    tier = "red";
    notes.push(`Next ${nextM} (red; below amber min ${policy.nextMajorAmberMin})`);
  }

  if (reactM != null) {
    if (reactM >= policy.reactMajorGreen) notes.push(`React ${reactM} OK`);
    else if (reactM >= policy.reactMajorAmberMin) {
      notes.push(`React ${reactM} amber`);
      if (tier === "green") tier = "amber";
    } else {
      notes.push(`React ${reactM} old`);
      tier = "red";
    }
  }

  if (tailwindM != null) {
    if (tailwindM >= policy.tailwindMajorGreen) notes.push(`Tailwind ${tailwindM} OK`);
    else if (tailwindM === policy.tailwindMajorAmber) {
      notes.push("Tailwind 3 (amber vs TCH 4)");
      if (tier === "green") tier = "amber";
    } else {
      notes.push(`Tailwind major ${tailwindM}`);
      if (tier === "green") tier = "amber";
    }
  }

  if (enginesMajors?.length && policy.nodeMajorAllowed?.length) {
    const allowed = new Set(policy.nodeMajorAllowed);
    const ok = enginesMajors.some((m) => allowed.has(m));
    if (!ok) {
      notes.push(`engines.node majors [${enginesMajors.join(",")}] vs allowed [${policy.nodeMajorAllowed.join(",")}]`);
      if (tier === "green") tier = "amber";
    }
  }

  return { tier, notes };
}

function main() {
  const args = parseArgs(process.argv);
  const policy = loadPolicy();
  const reposRoot = resolveReposRoot(args.root);

  if (!fs.existsSync(reposRoot)) {
    console.error(`[audit-shadcn-mirror] Repos root not found: ${reposRoot}`);
    console.error("Set --root or SHADCN_MIRROR_REPOS to your shadcn-io-mirror/repos path.");
    process.exit(2);
  }

  const entries = fs
    .readdirSync(reposRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const rows = [];
  const counts = { green: 0, amber: 0, red: 0, gray: 0 };

  for (const name of entries) {
    const dir = path.join(reposRoot, name);
    const pkg = readPkg(dir);
    if (!pkg) {
      rows.push({
        folder: name,
        tier: "gray",
        next: null,
        react: null,
        tailwind: null,
        enginesNode: null,
        notes: ["no package.json"],
      });
      counts.gray++;
      continue;
    }

    const next = parseDepVersion(pkg.dependencies?.next ?? pkg.devDependencies?.next);
    const react = parseDepVersion(pkg.dependencies?.react ?? pkg.devDependencies?.react);
    const tailwind = parseDepVersion(
      pkg.dependencies?.tailwindcss ?? pkg.devDependencies?.tailwindcss,
    );
    const { text: enginesText, majors: enginesMajors } = parseEnginesNode(pkg.engines);

    const { tier, notes } = classify(
      policy,
      next.major,
      react.major,
      tailwind.major,
      enginesMajors,
    );
    counts[tier]++;

    rows.push({
      folder: name,
      tier,
      next: next.label,
      react: react.label,
      tailwind: tailwind.label,
      enginesNode: enginesText,
      notes,
    });
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          reposRoot,
          policy,
          summary: counts,
          repos: rows,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Sajtmaskin TCH audit — ${reposRoot}`);
    console.log(
      `Policy: Next ≥${policy.nextMajorGreen} green, Next ${policy.nextMajorAmberMin}+ amber; React ≥${policy.reactMajorGreen}; Tailwind ${policy.tailwindMajorGreen}; Node majors ${policy.nodeMajorAllowed?.join(",")}`,
    );
    console.log(`Summary: green=${counts.green} amber=${counts.amber} red=${counts.red} gray=${counts.gray} (total=${rows.length})`);
    if (!args.verbose) {
      const greens = rows.filter((r) => r.tier === "green").map((r) => r.folder);
      const cap = 12;
      if (greens.length > 0) {
        const shown = greens.slice(0, cap);
        const rest = greens.length - shown.length;
        console.log(
          `\nGreen repos (sample): ${shown.join(", ")}${rest > 0 ? ` … +${rest} more` : ""}`,
        );
      }
      console.log(
        "\nTip: full per-repo table → npm run mirror:audit:verbose (or --verbose). Machine-readable → --json > report.json",
      );
    } else {
      console.log("");
      const w = { folder: 42, tier: 8, next: 14, react: 14, tailwind: 10 };
      console.log(
        `${"folder".padEnd(w.folder)} ${"tier".padEnd(w.tier)} ${"next".padEnd(w.next)} ${"react".padEnd(w.react)} ${"tailwind".padEnd(w.tailwind)} notes`,
      );
      for (const r of rows) {
        const note = r.notes.join("; ");
        console.log(
          `${r.folder.padEnd(w.folder)} ${r.tier.padEnd(w.tier)} ${String(r.next ?? "—").padEnd(w.next)} ${String(r.react ?? "—").padEnd(w.react)} ${String(r.tailwind ?? "—").padEnd(w.tailwind)} ${note}`,
        );
      }
    }
  }

  if (args.strict && counts.red > 0) {
    process.exit(1);
  }
}

main();
