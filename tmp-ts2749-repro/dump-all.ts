import { getVersionFiles } from "@/lib/gen/version-manager";

const VERSION_ID = "43969e97-c5a2-4c3b-a7f4-1913f7c27b19";

(async () => {
  const files = await getVersionFiles(VERSION_ID);
  if (!files) {
    console.error("no files");
    process.exit(1);
  }
  for (const f of files) {
    if (!f.content.includes("LucideIcon")) continue;
    console.log("===", f.path, "(LucideIcon refs)");
    const lines = f.content.split("\n");
    lines.forEach((l, i) => {
      if (l.includes("LucideIcon")) console.log(`  ${i + 1}: ${l}`);
    });
  }
  console.log("\n--- file inventory ---");
  for (const f of files) {
    console.log(f.path, f.content.split("\n").length, "lines");
  }
  process.exit(0);
})();
