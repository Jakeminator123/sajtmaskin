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

  it("räknar kompletta block oförändrat", () => {
    const content = ["Klart.", completeBlock("app/page.tsx"), completeBlock("app/om/page.tsx")].join("\n\n");

    render(<GenerationSummary content={content} />);

    expect(screen.getByText("2 filer")).toBeTruthy();
    expect(screen.getByTestId("generation-summary-prose").textContent).toBe("Klart.");
  });
});
