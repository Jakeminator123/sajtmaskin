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

  it("rejects after-hero when no matching section exists", () => {
    const r = tryInsertPageBlockIntoHomePage(PAGE, snippet, "after-hero");
    expect(r.ok).toBe(false);
  });

  it("inserts after a matching hero section when present", () => {
    const withHero = `export default function Page() {
  return (
    <main>
      <section className="hero banner">Hi</section>
      <section className="features">More</section>
    </main>
  );
}
`;
    const r = tryInsertPageBlockIntoHomePage(withHero, snippet, "after-hero");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const heroClose = r.content.indexOf("</section>");
      const inserted = r.content.indexOf(snippet);
      const features = r.content.indexOf('className="features"');
      expect(inserted).toBeGreaterThan(heroClose);
      expect(inserted).toBeLessThan(features);
    }
  });

  it("fails closed for after-content (no deterministic marker)", () => {
    const r = tryInsertPageBlockIntoHomePage(
      `export default function Page() {
  return (
    <main>
      <section className="hero">Hi</section>
    </main>
  );
}
`,
      snippet,
      "after-content",
    );
    expect(r.ok).toBe(false);
  });

  it("fails closed when the hero is behind a conditional expression", () => {
    const page = `export default function Page() {
  return (
    <main>
      {showHero && <HeroSection title="Hi" />}
      <section className="features">More</section>
    </main>
  );
}
`;
    expect(tryInsertPageBlockIntoHomePage(page, snippet, "after-hero").ok).toBe(false);
  });

  it("ignores commented-out hero markup", () => {
    const page = `export default function Page() {
  return (
    <main>
      {/* <section className="hero">Old</section> */}
      <section className="features">More</section>
    </main>
  );
}
`;
    expect(tryInsertPageBlockIntoHomePage(page, snippet, "after-hero").ok).toBe(false);
  });

  it("prefers the section host over a nested hero-card child", () => {
    const page = `export default function Page() {
  return (
    <main>
      <section className="hero">
        <div className="hero-card" />
        <p>Hi</p>
      </section>
      <section className="features">More</section>
    </main>
  );
}
`;
    const r = tryInsertPageBlockIntoHomePage(page, snippet, "after-hero");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.indexOf(snippet)).toBeGreaterThan(r.content.indexOf("</section>"));
      expect(r.content.indexOf(snippet)).toBeLessThan(r.content.indexOf('className="features"'));
    }
  });

  it("fails closed when only a promo-banner matches after-hero", () => {
    const page = `export default function Page() {
  return (
    <main>
      <div className="promo-banner">Sale</div>
      <section className="features">More</section>
    </main>
  );
}
`;
    expect(tryInsertPageBlockIntoHomePage(page, snippet, "after-hero").ok).toBe(false);
  });

  it("inserts after a PascalCase HeroSection component", () => {
    const page = `export default function Page() {
  return (
    <main>
      <HeroSection title="Hi" />
      <section className="features">More</section>
    </main>
  );
}
`;
    const r = tryInsertPageBlockIntoHomePage(page, snippet, "after-hero");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.indexOf(snippet)).toBeGreaterThan(r.content.indexOf("<HeroSection"));
      expect(r.content.indexOf(snippet)).toBeLessThan(r.content.indexOf('className="features"'));
    }
  });

  it("rejects when main is missing", () => {
    const r = tryInsertPageBlockIntoHomePage("<div>nope</div>", snippet, "top");
    expect(r.ok).toBe(false);
  });
});
