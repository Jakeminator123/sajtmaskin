import { describe, expect, it } from "vitest";
import { runProjectSanityChecks } from "./project-sanity";

describe("runProjectSanityChecks", () => {
  it("flags files that look like partial repair snippets", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: {
            next: "16.2.1",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
          devDependencies: {
            typescript: "5.8.3",
          },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "components/trailer-dialog.tsx",
        language: "tsx",
        content: `import {
import { Button } from "@/components/ui/button"
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";`,
      },
    ]);

    expect(result.valid).toBe(false);
    const issue = result.issues.find((entry) => entry.file === "components/trailer-dialog.tsx");
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/partial repair snippet|overlapping import statements|nested import/i);
  });
});
