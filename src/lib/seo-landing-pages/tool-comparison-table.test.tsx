// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TOOL_COMPARISON_COLUMNS, TOOL_COMPARISON_ROWS } from "./tool-comparison";
import { ToolComparisonTable } from "./tool-comparison-table";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("ToolComparisonTable", () => {
  it("renders a comparison table and points prices at /priser", () => {
    render(<ToolComparisonTable heading="Sajtmaskin mot WordPress, Wix och Squarespace" />);

    expect(
      screen.getByRole("heading", { name: "Sajtmaskin mot WordPress, Wix och Squarespace" }),
    ).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    for (const column of TOOL_COMPARISON_COLUMNS) {
      expect(screen.getByRole("columnheader", { name: column })).toBeTruthy();
    }
    expect(screen.getByRole("rowheader", { name: TOOL_COMPARISON_ROWS[0]?.criterion })).toBeTruthy();
    expect(screen.getByRole("link", { name: "prissidan" }).getAttribute("href")).toBe("/priser");
    expect(document.body.textContent).not.toMatch(/\d+\s*kr\b/i);
  });
});
