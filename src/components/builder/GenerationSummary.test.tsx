import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationSummary } from "./GenerationSummary";

const CODE_MARKER = "const SECRET_MARKER_FROM_CODE = 1;";

function completeBlock(path: string): string {
  return ["```tsx file=\"" + path + "\"", "export default function Page() {", "  return null;", "}", "```"].join(
    "\n",
  );
}

describe("GenerationSummary — fence-balans (F9)", () => {
  it("renderar ingen kodvägg när ett oavslutat block följer på kompletta block", () => {
    const content = [
      "Här kommer sidorna du bad om.",
      completeBlock("app/page.tsx"),
      completeBlock("app/om/page.tsx"),
      '```tsx file="app/kontakt/page.tsx"',
      CODE_MARKER,
      "export default function Kontakt() {",
    ].join("\n\n");

    render(<GenerationSummary content={content} />);

    const prose = screen.getByTestId("generation-summary-prose");
    expect(prose.textContent).toContain("Här kommer sidorna du bad om.");
    expect(prose.textContent).not.toContain(CODE_MARKER);
  });

  it("undertalar inte filräknaren vid oavslutad fence", () => {
    const content = [
      "Tre filer.",
      completeBlock("app/page.tsx"),
      completeBlock("app/om/page.tsx"),
      '```tsx file="app/kontakt/page.tsx"',
      CODE_MARKER,
    ].join("\n\n");

    render(<GenerationSummary content={content} />);

    expect(screen.getByText("3 filer")).toBeTruthy();
  });

  it("behandlar en oavslutad fence utan komplett block som kod", () => {
    const content = ["Nu bygger jag.", '```tsx file="app/page.tsx"', CODE_MARKER].join("\n\n");

    render(<GenerationSummary content={content} />);

    const prose = screen.getByTestId("generation-summary-prose");
    expect(prose.textContent).toContain("Nu bygger jag.");
    expect(prose.textContent).not.toContain(CODE_MARKER);
    expect(screen.getByText("1 fil")).toBeTruthy();
  });

  it("behandlar en oavslutad kodström utan backticks som kod", () => {
    const content = ["Nu bygger jag.", 'tsx file="app/page.tsx"', CODE_MARKER].join("\n");

    render(<GenerationSummary content={content} />);

    const prose = screen.getByTestId("generation-summary-prose");
    expect(prose.textContent).toContain("Nu bygger jag.");
    expect(prose.textContent).not.toContain(CODE_MARKER);
  });

  it("renderar ren prosa som nämner file=\"…\" mitt i en mening som text", () => {
    const content = 'Jag la logiken i file="app/page.tsx" så att den körs på servern.';

    render(<GenerationSummary content={content} />);

    const prose = screen.getByTestId("generation-summary-prose");
    expect(prose.textContent).toBe(content);
    expect(screen.queryByText(/Genererat/)).toBeNull();
  });

  it("klipper vid den tidigaste markören när en kvarglömd fence ligger efter ofenced kod", () => {
    // Prod-formen 2026-07-27: ojämnt antal fences gör att parningen hamnar ur
    // fas. Efter att de kompletta blocken plockats bort börjar resten med en
    // ofenced `tsx file="…"`-rad, medan en kvarglömd fence ligger tusentals
    // tecken längre ner. Klipps det vid fencen blir allt däremellan en kodvägg.
    const unfencedMarker = "const UNFENCED_TAIL_MARKER = 1;";
    const strayFenceMarker = "const STRAY_FENCE_MARKER = 2;";
    const content = [
      "Här kommer sidorna du bad om.",
      completeBlock("app/page.tsx"),
      completeBlock("app/om/page.tsx"),
      ['tsx file="app/layout.tsx"', unfencedMarker, "export default function Layout() {"].join("\n"),
      ['```ts file="app/api/contact/route.ts"', strayFenceMarker].join("\n"),
    ].join("\n\n");

    render(<GenerationSummary content={content} />);

    const prose = screen.getByTestId("generation-summary-prose");
    expect(prose.textContent).toBe("Här kommer sidorna du bad om.");
    expect(prose.textContent).not.toContain(unfencedMarker);
    expect(prose.textContent).not.toContain(strayFenceMarker);
    // Båda svansfilerna räknas, inte bara den första.
    expect(screen.getByText("4 filer")).toBeTruthy();
  });

  it("renderar ingen prosabubbla alls när innehållet bara är kod", () => {
    // Prod-formen hade ingen prosa före koden: `content` inleddes direkt med
    // ett fence-block, så efter avklippningen finns ingenting att visa.
    const marker = "const ONLY_CODE_MARKER = 3;";
    const content = [
      completeBlock("app/page.tsx"),
      ['tsx file="app/layout.tsx"', marker].join("\n"),
    ].join("\n\n");

    render(<GenerationSummary content={content} />);

    expect(screen.queryByTestId("generation-summary-prose")).toBeNull();
    expect(screen.getByText("2 filer")).toBeTruthy();
  });

  it("klipper vid stream-headern även när en tom fence ligger före den", () => {
    // En fence utan kropp efter sig fick tidigare hela sökningen att returnera
    // null, så stream-headern aldrig prövades.
    const content = ["Klart.", 'tsx file="app/page.tsx"', CODE_MARKER, "```"].join("\n");

    render(<GenerationSummary content={content} />);

    const prose = screen.getByTestId("generation-summary-prose");
    expect(prose.textContent).toBe("Klart.");
    expect(prose.textContent).not.toContain(CODE_MARKER);
  });

  it("räknar kompletta block oförändrat", () => {
    const content = ["Klart.", completeBlock("app/page.tsx"), completeBlock("app/om/page.tsx")].join("\n\n");

    render(<GenerationSummary content={content} />);

    expect(screen.getByText("2 filer")).toBeTruthy();
    expect(screen.getByTestId("generation-summary-prose").textContent).toBe("Klart.");
  });
});
