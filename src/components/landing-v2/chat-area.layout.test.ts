import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChatArea mobile document flow", () => {
  it("keeps the scrolling viewport in block flow so expanded templates reserve height", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/chat-area.tsx"),
      "utf8",
    );
    const scrollContainer = source.match(/className="([^"]+)"\s*\n\s*data-scroll-container/);

    expect(scrollContainer).not.toBeNull();
    const classes = scrollContainer?.[1].split(/\s+/) ?? [];
    expect(classes).toContain("overflow-y-auto");
    expect(classes).not.toContain("flex");
    expect(classes).not.toContain("flex-col");
  });
});
