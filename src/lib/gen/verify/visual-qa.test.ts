import { describe, expect, it } from "vitest";
import { analyzeVisualQuality, type VisualQACheckResult } from "./visual-qa";

const file = (path: string, content: string) => ({ path, content });

const LAYOUT = `export const metadata = {
  title: "Sköldpaddsöarna",
  description: "Guidade turer bland havssköldpaddor.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
`;

const GLOBALS_CSS = `:root {
  --background: oklch(0.98 0.02 80);
  --foreground: oklch(0.22 0.04 40);
  --primary: oklch(0.45 0.12 160);
  --accent: oklch(0.7 0.14 70);
}
`;

const THIN_PAGE = `import TurtleLanding from "@/components/turtle-landing";

export default function Page() {
  return <TurtleLanding />;
}
`;

const THIN_EMPTY_PAGE = `import EmptyLanding from "@/components/empty-landing";

export default function Page() {
  return <EmptyLanding />;
}
`;

const EMPTY_LANDING = `export default function EmptyLanding() {
  return <main />;
}
`;

/** Rich landing body that would score 100 on hero / images / sections. */
const TURTLE_LANDING = `import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function TurtleLanding() {
  return (
    <main>
      <section className="py-24">
        <h1 className="text-5xl font-bold">Sköldpaddsöarna</h1>
        <p>
          Välkommen till en kust där havssköldpaddor häckar varje sommar.
          Guidade turer startar i gryningen, och vi visar både rev och
          skyddade stränder. Boka en plats i små grupper så att djuren
          får arbetsro och besökarna ser mer än en snabb förbifart.
          Kvällspromenaden längs klipporna är inkluderad, liksom ett
          enkelt mål med lokala råvaror efter landstigning.
        </p>
        <Button>Boka tur</Button>
        <Image src="/hero-turtle.jpg" alt="Havssköldpadda nära ytan" width={1600} height={900} />
      </section>
      <section className="bg-muted py-16">
        <h2 className="text-3xl">Rev och lagun</h2>
        <img src="/reef.jpg" alt="Grunt rev" />
      </section>
      <section className="bg-card py-16">
        <h2 className="text-3xl">Boende vid stranden</h2>
        <img src="/cabin.jpg" alt="Trästuga" />
      </section>
    </main>
  );
}
`;

const chrome = (
  page: { path: string; content: string },
  extras: Array<{ path: string; content: string }> = [],
) => [
  page,
  file("app/layout.tsx", LAYOUT),
  file("app/globals.css", GLOBALS_CSS),
  ...extras,
];

function check(result: ReturnType<typeof analyzeVisualQuality>, name: string): VisualQACheckResult {
  const found = result.checks.find((c) => c.check === name);
  if (!found) throw new Error(`missing check ${name}`);
  return found;
}

describe("analyzeVisualQuality", () => {
  it("flags leftover bracket placeholders across the file set", () => {
    const result = analyzeVisualQuality(
      chrome(file("app/page.tsx", `export default function Page() { return <h1>[Butiksnamn]</h1>; }`)),
    );
    const brackets = check(result, "no-bracket-placeholders");
    expect(brackets.passed).toBe(false);
    expect(brackets.score).toBeLessThan(100);
    expect(brackets.detail).toMatch(/1 bracket placeholder/);
  });

  it("scores an inline-rich home page without delegation", () => {
    const result = analyzeVisualQuality(
      chrome(file("app/page.tsx", TURTLE_LANDING.replace("TurtleLanding", "Page"))),
    );
    expect(check(result, "hero-quality").score).toBe(100);
    expect(check(result, "image-usage").score).toBe(100);
    expect(check(result, "section-variety").score).toBe(100);
    expect(check(result, "metadata").score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(100);
  });

  it("reproduces the thin-page-only prod miss at 57 when the landing file is absent", () => {
    const result = analyzeVisualQuality(chrome(file("app/page.tsx", THIN_PAGE)));
    expect(check(result, "hero-quality").score).toBe(0);
    expect(check(result, "image-usage").score).toBe(0);
    expect(check(result, "section-variety").score).toBe(0);
    expect(check(result, "metadata").score).toBe(100);
    expect(check(result, "color-adaptation").score).toBe(100);
    expect(result.overallScore).toBe(57);
    expect(result.passed).toBe(false);
  });

  it("scores a thin page that renders a rich local landing as a pass, not 57", () => {
    const result = analyzeVisualQuality(
      chrome(file("app/page.tsx", THIN_PAGE), [
        file("components/turtle-landing.tsx", TURTLE_LANDING),
      ]),
    );
    expect(check(result, "hero-quality").score).toBe(100);
    expect(check(result, "image-usage").score).toBe(100);
    expect(check(result, "section-variety").score).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.passed).toBe(true);
  });

  it("keeps a genuinely empty delegated page at a failing score", () => {
    const result = analyzeVisualQuality(
      chrome(file("app/page.tsx", THIN_EMPTY_PAGE), [
        file("components/empty-landing.tsx", EMPTY_LANDING),
      ]),
    );
    expect(check(result, "hero-quality").score).toBe(0);
    expect(check(result, "image-usage").score).toBe(0);
    expect(check(result, "section-variety").score).toBe(0);
    expect(result.overallScore).toBe(57);
    expect(result.passed).toBe(false);
  });

  it("does not let a large unrendered module lift the score", () => {
    const importedButNotRendered = `import EmptyLanding from "@/components/empty-landing";
import UnusedGallery from "@/components/unused-gallery";

export default function Page() {
  return <EmptyLanding />;
}
`;
    const presentOnly = analyzeVisualQuality(
      chrome(file("app/page.tsx", THIN_EMPTY_PAGE), [
        file("components/empty-landing.tsx", EMPTY_LANDING),
        file("components/unused-gallery.tsx", TURTLE_LANDING),
      ]),
    );
    const importedUnused = analyzeVisualQuality(
      chrome(file("app/page.tsx", importedButNotRendered), [
        file("components/empty-landing.tsx", EMPTY_LANDING),
        file("components/unused-gallery.tsx", TURTLE_LANDING),
      ]),
    );

    for (const result of [presentOnly, importedUnused]) {
      expect(check(result, "hero-quality").score).toBe(0);
      expect(check(result, "image-usage").score).toBe(0);
      expect(check(result, "section-variety").score).toBe(0);
      expect(result.overallScore).toBe(57);
      expect(result.passed).toBe(false);
    }
  });

  it("follows a relative import from src/app/page.tsx one hop", () => {
    const result = analyzeVisualQuality([
      file(
        "src/app/page.tsx",
        `import TurtleLanding from "../components/turtle-landing";
export default function Page() { return <TurtleLanding />; }
`,
      ),
      file("src/app/layout.tsx", LAYOUT),
      file("src/app/globals.css", GLOBALS_CSS),
      file("src/components/turtle-landing.tsx", TURTLE_LANDING),
    ]);
    expect(result.overallScore).toBe(100);
    expect(result.passed).toBe(true);
  });
});
