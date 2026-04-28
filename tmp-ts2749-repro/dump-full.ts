import { getVersionFiles } from "@/lib/gen/version-manager";
import * as fs from "node:fs";
import * as path from "node:path";

const VERSION_ID = "43969e97-c5a2-4c3b-a7f4-1913f7c27b19";
const OUT = "tmp-ts2749-repro/runtime-app";

(async () => {
  const files = await getVersionFiles(VERSION_ID);
  if (!files) process.exit(1);
  for (const f of files) {
    if (f.path === "package.json" || f.path === "tsconfig.json" || f.path.startsWith(".env")) continue;
    if (!f.path.match(/\.(ts|tsx|js|jsx|mjs|cjs|json|css)$/)) continue;
    const dst = path.join(OUT, f.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, f.content);
  }
  console.log("dumped");
  process.exit(0);
})();
