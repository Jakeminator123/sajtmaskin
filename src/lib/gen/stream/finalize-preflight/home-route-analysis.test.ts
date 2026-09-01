import { describe, expect, it } from "vitest";
import {
  buildMissingHomeRouteIssue,
  findHomePageFile,
} from "./home-route-analysis";

function trivialHomeIssue(
  files: Array<{ path: string; content: string }>,
) {
  return buildMissingHomeRouteIssue(findHomePageFile(files), files);
}

const THIN_DEFAULT_IMPORT_PAGE = [
  'import TurtleLanding from "@/components/turtle-landing";',
  "",
  "export default function Page() {",
  "  return <TurtleLanding />;",
  "}",
].join("\n");

describe("buildMissingHomeRouteIssue — composed measure", () => {
  it("does not block when a resolved default-import has rich body but no default export (prod 57027ae6)", () => {
    // Prod chat 57027ae6 (2026-09-01): thin app/page.tsx rendered
    // <TurtleLanding /> imported as default. The component file had a real
    // landing body but no default export yet (jsx-checker added it later).
    // Export lookup returned null and the gate treated that as 0 chars.
    const richUnexported = [
      "function TurtleLanding() {",
      "  return (",
      "    <main>",
      "      <section>",
      "        <h1>Futuristiska sköldpaddor</h1>",
      "        <p>",
      "          Neonbelysta rev, holografiska skal och tidvatten av data.",
      "          En landing om kolonier, kartor och nattliga vandringar",
      "          längs den syntetiska kusten — inte ett tomt skelett.",
      "        </p>",
      "        <button>Starta resan</button>",
      "      </section>",
      "    </main>",
      "  );",
      "}",
    ].join("\n");

    const issue = trivialHomeIssue([
      { path: "app/page.tsx", content: THIN_DEFAULT_IMPORT_PAGE },
      { path: "components/turtle-landing.tsx", content: richUnexported },
    ]);

    expect(issue).toBeNull();
  });

  it("passes by MEASURING a resolved rich export, not by waiving it", () => {
    // Skiljer de två gröna vägarna åt: här finns exporten, så kroppen mäts och
    // räknas. Utan det här testet kunde hela sviten vara grön enbart tack vare
    // `not-found`-friskrivningen, och en trasig mätning hade sett rätt ut.
    const richExported = [
      "export default function TurtleLanding() {",
      "  return (",
      "    <main>",
      "      <section>",
      "        <h1>Futuristiska sköldpaddor</h1>",
      "        <p>",
      "          Neonbelysta rev, holografiska skal och tidvatten av data.",
      "          En landing om kolonier, kartor och nattliga vandringar",
      "          längs den syntetiska kusten — inte ett tomt skelett.",
      "        </p>",
      "        <button>Starta resan</button>",
      "      </section>",
      "    </main>",
      "  );",
      "}",
    ].join("\n");

    const issue = trivialHomeIssue([
      { path: "app/page.tsx", content: THIN_DEFAULT_IMPORT_PAGE },
      { path: "components/turtle-landing.tsx", content: richExported },
    ]);

    expect(issue).toBeNull();
  });

  it("still blocks a genuinely empty delegated default export", () => {
    const emptyDefault = [
      "export default function TurtleLanding() {",
      "  return <main />;",
      "}",
    ].join("\n");

    const issue = trivialHomeIssue([
      { path: "app/page.tsx", content: THIN_DEFAULT_IMPORT_PAGE },
      { path: "components/turtle-landing.tsx", content: emptyDefault },
    ]);

    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toMatch(/trivial content/i);
  });

  it("still blocks an empty export even when the module ships a large unused data array", () => {
    const bigData = Array.from(
      { length: 40 },
      (_, i) =>
        `  { id: ${i}, label: "Item number ${i} with descriptive padding text for length" },`,
    ).join("\n");
    const emptyWithData = [
      "export const DATA = [",
      bigData,
      "];",
      "",
      "export default function TurtleLanding() {",
      "  return <main />;",
      "}",
    ].join("\n");

    const issue = trivialHomeIssue([
      { path: "app/page.tsx", content: THIN_DEFAULT_IMPORT_PAGE },
      { path: "components/turtle-landing.tsx", content: emptyWithData },
    ]);

    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/trivial content/i);
  });
});
