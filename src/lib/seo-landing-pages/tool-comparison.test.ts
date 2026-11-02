import { describe, expect, it } from "vitest";
import {
  TOOL_COMPARISON_COLUMNS,
  TOOL_COMPARISON_FOOTNOTE_AFTER_PRICE,
  TOOL_COMPARISON_FOOTNOTE_BEFORE_PRICE,
  TOOL_COMPARISON_LEAD,
  TOOL_COMPARISON_ROWS,
} from "./tool-comparison";

const VOLATILE_PRICE_PATTERNS = [/\d+\s*kr\b/i, /\b(?:49|99|179)\b/];

describe("tool comparison facts", () => {
  it("compares Sajtmaskin with WordPress, Wix and Squarespace without volatile prices", () => {
    expect([...TOOL_COMPARISON_COLUMNS]).toEqual([
      "Sajtmaskin",
      "WordPress",
      "Wix",
      "Squarespace",
    ]);
    expect(TOOL_COMPARISON_ROWS.length).toBeGreaterThanOrEqual(5);
    expect(TOOL_COMPARISON_LEAD).toMatch(/inte en ranking/i);
    expect(TOOL_COMPARISON_FOOTNOTE_BEFORE_PRICE).toMatch(/går inte ut/i);
    expect(TOOL_COMPARISON_FOOTNOTE_AFTER_PRICE).toMatch(/publiceras inte här/i);

    const blob = JSON.stringify({
      TOOL_COMPARISON_LEAD,
      TOOL_COMPARISON_FOOTNOTE_BEFORE_PRICE,
      TOOL_COMPARISON_FOOTNOTE_AFTER_PRICE,
      TOOL_COMPARISON_ROWS,
    });
    for (const pattern of VOLATILE_PRICE_PATTERNS) {
      expect(blob).not.toMatch(pattern);
    }

    for (const row of TOOL_COMPARISON_ROWS) {
      for (const column of TOOL_COMPARISON_COLUMNS) {
        expect(row.cells[column].length).toBeGreaterThan(20);
      }
    }
  });

  it("states verifiable Sajtmaskin facts already in the product", () => {
    const sm = TOOL_COMPARISON_ROWS.map((row) => row.cells.Sajtmaskin).join(" ");
    expect(sm).toMatch(/Next\.js/i);
    expect(sm).toMatch(/React/i);
    expect(sm).toMatch(/engångsköp/i);
    expect(sm).toMatch(/utan kort/i);
    expect(sm).toMatch(/HTTPS|SSL|Vercel/i);
    expect(sm).toMatch(/Svenskt/i);
  });
});
