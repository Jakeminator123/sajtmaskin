import { describe, expect, it } from "vitest";

import {
  buildInspectPointsPrompt,
  FOCUS_POINT_MARKER,
  stripFocusPointAppendix,
} from "./focus-point-prompt";

describe("focus-point-prompt", () => {
  it("stripFocusPointAppendix keeps free-form text only", () => {
    const message = [
      'Skapa en ny sida som ska heta "Bilder".',
      "",
      FOCUS_POINT_MARKER,
      "- Punkt 1: x=1%, y=2%",
      "  - Träff-text: PORTFOLIO",
    ].join("\n");
    expect(stripFocusPointAppendix(message)).toBe('Skapa en ny sida som ska heta "Bilder".');
  });

  it("buildInspectPointsPrompt includes Källfil when sourcePath is known", () => {
    const prompt = buildInspectPointsPrompt([
      {
        demoUrl: "https://preview.example/",
        xPercent: 10,
        yPercent: 20,
        viewportWidth: 1000,
        viewportHeight: 800,
        element: {
          tag: "a",
          id: null,
          className: null,
          text: "PORTFOLIO",
          ariaLabel: null,
          role: null,
          href: "#portfolio",
          selector: "a",
          nearestHeading: null,
          sourcePath: "components/header.tsx",
          sourceLine: 12,
        },
      },
    ]);
    expect(prompt.startsWith(FOCUS_POINT_MARKER)).toBe(true);
    expect(prompt).toContain("Källfil: components/header.tsx:12");
    expect(prompt).toContain("href: #portfolio");
  });
});
