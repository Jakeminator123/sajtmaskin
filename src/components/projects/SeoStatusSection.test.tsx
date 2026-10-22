import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeoStatusSection, scoreTone } from "./SeoStatusSection";

const STATUS = {
  score: 82,
  scoreBefore: 55,
  checkedAt: "2026-10-22T09:00:00.000Z",
  siteUrl: "https://kund.se",
  versionId: "ver_1",
  pagesInspected: 3,
  improvementCount: 2,
  remainingCount: 2,
  remainingBlockingCount: 1,
  remaining: [
    { id: "missing-h1" as const, severity: "critical" as const, message: "Startsidan saknar H1." },
    { id: "image-missing-alt" as const, severity: "advisory" as const, message: "En bild saknar alt." },
  ],
};

describe("SeoStatusSection", () => {
  it("explains the empty state differently before and after the first publish", () => {
    const { rerender } = render(
      <SeoStatusSection status={null} projectId="proj_1" hasLiveVersion={false} />,
    );
    expect(screen.getByText(/körs när sajten publiceras/)).toBeTruthy();

    rerender(<SeoStatusSection status={null} projectId="proj_1" hasLiveVersion />);
    expect(screen.getByText(/Ingen SEO-kontroll finns för den publicerade versionen/)).toBeTruthy();
  });

  it("shows the score, what publishing fixed and the open findings by severity", () => {
    render(<SeoStatusSection status={STATUS} projectId="proj_1" hasLiveVersion />);

    expect(screen.getByLabelText("SEO-poäng 82 av 100")).toBeTruthy();
    expect(screen.getByText("Bra")).toBeTruthy();
    expect(screen.getByText("2 saker (+27 poäng)")).toBeTruthy();
    expect(screen.getByText(/2 öppna punkter, 1 viktig/)).toBeTruthy();
    expect(screen.getByText("Startsidan saknar H1.")).toBeTruthy();
    expect(screen.getByText("Kritiskt")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Åtgärda i byggaren/ }).getAttribute("href")).toBe(
      "/builder?project=proj_1",
    );
    expect(screen.getByText(/Inte Google Search Console eller Lighthouse/)).toBeTruthy();
  });

  it("celebrates a clean audit without a fix button", () => {
    render(
      <SeoStatusSection
        status={{ ...STATUS, remaining: [], remainingCount: 0, remainingBlockingCount: 0 }}
        projectId="proj_1"
        hasLiveVersion
      />,
    );
    expect(screen.getByText(/Inga öppna punkter/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Åtgärda i byggaren/ })).toBeNull();
  });

  it("grades scores in three bands", () => {
    expect(scoreTone(95).label).toBe("Bra");
    expect(scoreTone(60).label).toBe("Okej");
    expect(scoreTone(20).label).toBe("Behöver jobb");
  });
});
