import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { buildFollowUpFileContextDecision } from "./follow-up-file-context";

const previousFiles: CodeFile[] = [
  { path: "app/page.tsx", language: "tsx", content: "export default function Page(){return <main><Hero/><Menu/><Contact/></main>}" },
  { path: "app/layout.tsx", language: "tsx", content: "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}" },
  { path: "app/globals.css", language: "css", content: "@import 'tailwindcss';\n@theme inline { --color-background: oklch(1 0 0); }" },
  { path: "components/hero.tsx", language: "tsx", content: "export function Hero(){return <section><h1>Kaffekoppen</h1></section>}" },
  { path: "components/menu.tsx", language: "tsx", content: "export function Menu(){return <section>Meny</section>}" },
  { path: "components/contact.tsx", language: "tsx", content: "export function Contact(){return <section>Kontakt</section>}" },
  { path: "components/footer.tsx", language: "tsx", content: "export function Footer(){return <footer/>}" },
];

describe("buildFollowUpFileContextDecision", () => {
  it("uses light context for short copy edits", () => {
    const decision = buildFollowUpFileContextDecision({
      message: "Byt rubriken i hero till Kaffe med hjärta.",
      previousFiles,
      followUpIntent: "clear-refine",
    });

    expect(decision.contextPolicy).toBe("light");
    expect(decision.maxChars).toBe(32_000);
    expect(decision.fileContext.summary.length).toBeLessThan(32_000);
  });

  it("pins layout and globals for visual follow-ups", () => {
    const decision = buildFollowUpFileContextDecision({
      message: "Gör bakgrunden mörkare och ändra färgerna.",
      previousFiles,
      followUpIntent: "clear-refine",
    });

    expect(decision.pinnedFiles).toEqual(["app/globals.css", "app/layout.tsx"]);
    expect(decision.fileContext.summary).toContain("### app/globals.css");
    expect(decision.fileContext.summary).toContain("### app/layout.tsx");
  });
});
