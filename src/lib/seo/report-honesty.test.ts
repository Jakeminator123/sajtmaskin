/**
 * The report may not claim a fix the owner can see is not there.
 *
 * Two separate ways it used to: an improvement counted as "fixed" because the
 * file changed even when its finding survived, and a page whose heading lives
 * in a component was reported as heading-less. Both produce a report that
 * argues with the site in front of the reader, which costs more trust than the
 * feature earns.
 */

import { describe, expect, it } from "vitest";

import { auditProjectSeo } from "./audit";
import { dropUnresolvedImprovements, runSeoPublishPass } from "./index";
import type { SeoFindingId, SeoImprovement } from "./types";

function improvement(findingId: SeoFindingId, file: string): SeoImprovement {
  return { findingId, file, change: `Skrev om ${findingId}.`, by: "llm" };
}

describe("dropUnresolvedImprovements", () => {
  it("stryker en förbättring vars brist finns kvar på samma fil", () => {
    const kept = dropUnresolvedImprovements(
      [improvement("title-too-long", "app/layout.tsx")],
      [{ id: "title-too-long", file: "app/layout.tsx" }],
    );
    expect(kept).toEqual([]);
  });

  it("behåller en förbättring vars brist försvann", () => {
    const kept = dropUnresolvedImprovements(
      [improvement("title-too-short", "app/layout.tsx")],
      [{ id: "missing-structured-data", file: "project" }],
    );
    expect(kept).toHaveLength(1);
  });

  it("räknar ett byte av brist som en fix, inte som ett misslyckande", () => {
    // En omskrivning som löser "för kort" men landar i "för lång" HAR åtgärdat
    // det den skulle. Den nya bristen rapporteras separat under Kvar att göra.
    const kept = dropUnresolvedImprovements(
      [improvement("title-too-short", "app/layout.tsx")],
      [{ id: "title-too-long", file: "app/layout.tsx" }],
    );
    expect(kept).toHaveLength(1);
  });

  it("skiljer på samma brist i olika filer", () => {
    const kept = dropUnresolvedImprovements(
      [improvement("missing-h1", "app/om/page.tsx")],
      [{ id: "missing-h1", file: "app/kontakt/page.tsx" }],
    );
    expect(kept).toHaveLength(1);
  });
});

describe("h1 genom komponenter", () => {
  const LAYOUT = `export const metadata = { title: "T", description: "D" };`;

  function findingsFor(files: Array<{ path: string; content: string }>) {
    return auditProjectSeo(files).findings.filter((f) => f.id === "missing-h1");
  }

  it("hittar rubriken i en komponent som sidan renderar", () => {
    const findings = findingsFor([
      { path: "app/layout.tsx", content: LAYOUT },
      {
        path: "app/page.tsx",
        content: 'import HomePage from "@/components/HomePage";\nexport default function Page() { return <HomePage />; }',
      },
      {
        path: "src/components/HomePage.tsx",
        content: "export default function HomePage() { return <h1>Klippoteket</h1>; }",
      },
    ]);
    expect(findings).toEqual([]);
  });

  it("följer en relativ import två hopp bort", () => {
    const findings = findingsFor([
      { path: "app/layout.tsx", content: LAYOUT },
      {
        path: "app/page.tsx",
        content: 'import { Shell } from "./shell";\nexport default function Page() { return <Shell />; }',
      },
      {
        path: "app/shell.tsx",
        content: 'import { Hero } from "./hero";\nexport function Shell() { return <Hero />; }',
      },
      { path: "app/hero.tsx", content: "export function Hero() { return <h1>Hej</h1>; }" },
    ]);
    expect(findings).toEqual([]);
  });

  it("rapporterar fortfarande en sida där ingen rubrik finns någonstans", () => {
    const findings = findingsFor([
      { path: "app/layout.tsx", content: LAYOUT },
      {
        path: "app/page.tsx",
        content: 'import HomePage from "@/components/HomePage";\nexport default function Page() { return <HomePage />; }',
      },
      {
        path: "src/components/HomePage.tsx",
        content: "export default function HomePage() { return <p>Ingen rubrik.</p>; }",
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("app/page.tsx");
  });
});

describe("src/app-projekt får inte dubbla metadata-rutter", () => {
  it("injicerar ingen andra robots när projektet redan har en under src/app", async () => {
    // Injektorn avgör "finns redan?" på nyckeln `app/robots.ts` och ser därför
    // inte `src/app/robots.ts`. Utan spärren hamnade båda i deploy-nyttolasten
    // med samma namn, och ingenting nedströms deduplicerar.
    const files = [
      {
        name: "src/app/layout.tsx",
        content:
          'export const metadata = { title: "En tillräckligt lång sidtitel här", description: "En beskrivning som är lagom lång för att passera granskningens minimikrav på tecken." };\nexport default function L() { return <html><body /></html>; }',
      },
      { name: "src/app/page.tsx", content: "<h1>Hej</h1>" },
      {
        name: "src/app/robots.ts",
        content:
          'const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";\nexport default function robots() { return { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl}/sitemap.xml` }; }',
      },
    ];

    const { files: shipped } = await runSeoPublishPass(files, {
      siteUrl: "https://klippoteket.se",
    });

    const names = shipped.map((f) => f.name);
    expect(names.filter((n) => n.endsWith("robots.ts"))).toEqual(["src/app/robots.ts"]);
    expect(names).not.toContain("app/robots.ts");
    expect(new Set(names).size).toBe(names.length);
    // Och den kvarvarande filen är den omskrivna, inte platshållaren.
    const robots = shipped.find((f) => f.name === "src/app/robots.ts")!;
    expect(robots.content).not.toContain("https://example.com");
  });
});

describe("dynamisk metadata", () => {
  it("rapporterar inte en beräknad titel som saknad", () => {
    // `title: getTitle()` är giltig metadata som vi inte kan mäta. Att kalla
    // den saknad ger ägaren en brist hen inte kan åtgärda.
    const findings = auditProjectSeo([
      {
        path: "app/layout.tsx",
        content:
          'export async function generateMetadata() {\n  return { title: getTitle(), description: "En beskrivning som är lagom lång för att passera granskningens minimikrav på tecken." };\n}',
      },
      { path: "app/page.tsx", content: "<h1>Hej</h1>" },
    ]).findings;
    expect(findings.map((f) => f.id)).not.toContain("missing-title");
    expect(findings.map((f) => f.id)).not.toContain("title-too-short");
  });

  it("läser inte openGraph-titeln som sidtitel", () => {
    const findings = auditProjectSeo([
      {
        path: "app/layout.tsx",
        content:
          'export const metadata = {\n  openGraph: { title: "Kort" },\n  title: "En tillräckligt lång sidtitel för granskningen",\n  description: "En beskrivning som är lagom lång för att passera granskningens minimikrav på tecken.",\n};',
      },
      { path: "app/page.tsx", content: "<h1>Hej</h1>" },
    ]).findings;
    expect(findings.map((f) => f.id)).not.toContain("title-too-short");
  });
});
