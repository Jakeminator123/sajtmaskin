import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { extractV0TemplateReferenceFiles } from "./local-v0-template-source";

describe("extractV0TemplateReferenceFiles", () => {
  it("reads only bounded frontend candidates from a template archive", async () => {
    const zip = new JSZip();
    zip.file(
      "template/app/page.tsx",
      'import { Hero } from "../components/hero";\nexport default function Page() { return <Hero />; }',
    );
    zip.file("template/components/hero.tsx", "export function Hero() { return <main>Hej</main>; }");
    zip.file("template/app/globals.css", ":root { --brand: blue; }");
    zip.file("template/app/api/private/route.ts", "export async function POST() {}");
    zip.file("template/package-lock.json", "x".repeat(2 * 1024 * 1024));
    zip.file("template/components/oversized.tsx", "x".repeat(1024 * 1024 + 1));
    zip.file("template/public/hero.png", Buffer.from([0, 1, 2, 3]));

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const files = await extractV0TemplateReferenceFiles(archive);

    expect(files.map((file) => file.path)).toEqual([
      "app/page.tsx",
      "app/globals.css",
      "components/hero.tsx",
    ]);
    expect(files.every((file) => file.language !== "binary")).toBe(true);
  });
});
