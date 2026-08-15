import { describe, expect, it } from "vitest";
import { parseCodeProject } from "@/lib/gen/parser";
import { prepareVerifierPackageJson } from "./merge-package-json-for-verifier";

function fencedJson(path: string, body: string): string {
  return `\`\`\`json file="${path}"\n${body}\n\`\`\``;
}

function fencedTsx(path: string, body: string): string {
  return `\`\`\`tsx file="${path}"\n${body}\n\`\`\``;
}

const THIN_PACKAGE_JSON = JSON.stringify({ name: "model-draft", version: "0.0.1" });
const PAGE = `export default function Page() { return <main>Hi</main>; }`;

describe("prepareVerifierPackageJson", () => {
  it("shows the verifier a baseline-merged package.json for a thin model draft", () => {
    const content = `${fencedJson("package.json", THIN_PACKAGE_JSON)}\n\n${fencedTsx("app/page.tsx", PAGE)}`;
    const prepared = prepareVerifierPackageJson(content);
    const pkg = JSON.parse(
      parseCodeProject(prepared.verifierContent).files.find((file) => file.path === "package.json")!
        .content,
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.devDependencies.tailwindcss).toBeDefined();
    expect(pkg.dependencies.tailwindcss).toBeUndefined();
    const checkPkg = JSON.parse(
      prepared.filesForDependencyCheck.find((file) => file.path === "package.json")!.content,
    ) as { devDependencies: Record<string, string> };
    expect(checkPkg.devDependencies.tailwindcss).toBeDefined();
  });

  it("does not overlay the Sajtmaskin baseline in imported-repo mode", () => {
    const imported = JSON.stringify({
      name: "imported-template",
      version: "1.0.0",
      dependencies: { next: "14.2.0" },
    });
    const content = fencedJson("package.json", imported);
    const prepared = prepareVerifierPackageJson(content, { skipBaselineMerge: true });
    const pkg = JSON.parse(
      parseCodeProject(prepared.verifierContent).files.find((file) => file.path === "package.json")!
        .content,
    ) as { dependencies: Record<string, string>; name: string };
    expect(pkg.name).toBe("imported-template");
    expect(pkg.dependencies.next).toBe("14.2.0");
    expect(pkg.dependencies.react).toBeUndefined();
  });
});
