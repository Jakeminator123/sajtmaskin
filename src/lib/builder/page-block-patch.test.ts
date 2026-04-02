import { describe, expect, it } from "vitest";
import {
  resolveHomePageFilePath,
  tryInsertPageBlockIntoHomePage,
} from "./page-block-patch";

const PAGE = `export default function Page() {
  return (
    <main>
      <h1>Hi</h1>
    </main>
  );
}
`;

describe("resolveHomePageFilePath", () => {
  it("prefers app/page.tsx when present", () => {
    expect(
      resolveHomePageFilePath([{ name: "src/app/page.tsx" }, { name: "app/page.tsx" }]),
    ).toBe("app/page.tsx");
  });

  it("falls back to src/app/page.tsx", () => {
    expect(resolveHomePageFilePath([{ name: "src/app/page.tsx" }])).toBe("src/app/page.tsx");
  });

  it("returns null when no candidate exists", () => {
    expect(resolveHomePageFilePath([{ name: "app/layout.tsx" }])).toBeNull();
  });
});

describe("tryInsertPageBlockIntoHomePage", () => {
  const snippet = "<section>new</section>";

  it("inserts at top inside main", () => {
    const r = tryInsertPageBlockIntoHomePage(PAGE, snippet, "top");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("<main>");
      expect(r.content.indexOf(snippet)).toBeLessThan(r.content.indexOf("<h1>"));
    }
  });

  it("inserts at bottom inside main", () => {
    const r = tryInsertPageBlockIntoHomePage(PAGE, snippet, "bottom");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.indexOf(snippet)).toBeGreaterThan(r.content.indexOf("</h1>"));
    }
  });

  it("rejects after-hero for MVP", () => {
    const r = tryInsertPageBlockIntoHomePage(PAGE, snippet, "after-hero");
    expect(r.ok).toBe(false);
  });

  it("rejects when main is missing", () => {
    const r = tryInsertPageBlockIntoHomePage("<div>nope</div>", snippet, "top");
    expect(r.ok).toBe(false);
  });
});
