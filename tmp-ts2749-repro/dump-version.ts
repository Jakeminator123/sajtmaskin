import { getVersionFiles } from "@/lib/gen/version-manager";

const VERSION_ID = "43969e97-c5a2-4c3b-a7f4-1913f7c27b19";
const TARGETS = new Set([
  "components/game-page.tsx",
  "components/home-page.tsx",
  "app/om/page.tsx",
  "app/page.tsx",
]);

(async () => {
  const files = await getVersionFiles(VERSION_ID);
  if (!files) {
    console.error("no files for version", VERSION_ID);
    process.exit(1);
  }
  for (const f of files) {
    if (!TARGETS.has(f.path)) continue;
    console.log("=========================================");
    console.log("FILE:", f.path, "lines:", f.content.split("\n").length);
    console.log("=========================================");
    console.log(f.content);
  }
  process.exit(0);
})();
