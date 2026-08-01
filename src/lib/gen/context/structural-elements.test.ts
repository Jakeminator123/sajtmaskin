import { describe, expect, it } from "vitest";
import {
  extractStructuralElements,
  detectDroppedElements,
  buildFileStructuralInventory,
  renderStructuralInventoryForPrompt,
} from "./structural-elements";
import type { CodeFile } from "../parser";

function makeFile(path: string, body: string): CodeFile {
  return { path, content: body, language: "tsx" };
}

describe("extractStructuralElements", () => {
  it("detects <video> element", () => {
    const content = `<div><video src="/hero.mp4" poster="/poster.jpg" /></div>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "video")).toBe(true);
  });

  it("detects <canvas> element", () => {
    const content = `<canvas width={800} height={600} />`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "canvas")).toBe(true);
  });

  it("detects <iframe> element", () => {
    const content = `<iframe src="https://maps.google.com" />`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "iframe")).toBe(true);
  });

  it("detects <audio> element", () => {
    const content = `<audio src="/track.mp3" controls />`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "audio")).toBe(true);
  });

  it("detects React Three Fiber Canvas", () => {
    const content = `<Canvas camera={{ position: [0, 0, 5] }}><mesh /></Canvas>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "r3f-canvas")).toBe(true);
  });

  it("detects Rapier Physics", () => {
    const content = `<Physics gravity={[0, -9.81, 0]}><RigidBody /></Physics>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "rapier-physics")).toBe(true);
  });

  it("detects form element", () => {
    const content = `<form onSubmit={handleSubmit}><input /><button type="submit">Send</button></form>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "form")).toBe(true);
  });

  it("detects VideoPlayer component", () => {
    const content = `<VideoPlayer src="/promo.mp4" autoPlay />`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "video-component")).toBe(true);
  });

  it("detects HeroVideo component", () => {
    const content = `<HeroVideo poster="/hero-poster.jpg" />`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "video-component")).toBe(true);
  });

  it("detects play button UI when no video element exists", () => {
    const content = `<button className="play-button"><PlayCircle size={48} /></button>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "play-button-ui")).toBe(true);
  });

  it("does not flag play button when video element already found", () => {
    const content = `<video src="/v.mp4" /><button><PlayCircle /></button>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "video")).toBe(true);
    expect(result.some((e) => e.kind === "play-button-ui")).toBe(false);
  });

  it("detects section landmarks from className", () => {
    const content = `<section className="hero-section bg-dark"><h1>Welcome</h1></section>`;
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "section-hero")).toBe(true);
  });

  it("detects multiple section landmarks", () => {
    const content = `
      <div className="hero-banner">Hero</div>
      <div className="gallery-grid">Gallery</div>
      <div className="pricing-table">Plans</div>
    `;
    const result = extractStructuralElements(content);
    const kinds = new Set(result.map((e) => e.kind));
    expect(kinds.has("section-hero")).toBe(true);
    expect(kinds.has("section-gallery")).toBe(true);
    expect(kinds.has("section-pricing")).toBe(true);
  });

  it("detects inline SVG block", () => {
    const svgContent = `<svg viewBox="0 0 100 100">${"<circle r='5' />".repeat(20)}</svg>`;
    const result = extractStructuralElements(svgContent);
    expect(result.some((e) => e.kind === "svg-block")).toBe(true);
  });

  it("returns empty for plain text component", () => {
    const content = `export default function Page() { return <div><h1>Hello</h1><p>World</p></div>; }`;
    const result = extractStructuralElements(content);
    expect(result).toEqual([]);
  });

  it("deduplicates by kind", () => {
    const content = `<video src="/a.mp4" /><video src="/b.mp4" />`;
    const result = extractStructuralElements(content);
    const videoEntries = result.filter((e) => e.kind === "video");
    expect(videoEntries).toHaveLength(1);
  });

  // `display` ends in `play`. The play-button heuristic used to anchor only the
  // trailing word boundary, so ordinary styling registered as a play control.
  it.each([
    ['inline style', `<span style={{ display: "inline-flex" }}>Hi</span>`],
    ['next/font option', `const inter = Inter({ subsets: ["latin"], display: "swap" });`],
    ['plain CSS', `.card { display: grid; }`],
  ])("does not read %s as a play button", (_label, content) => {
    const result = extractStructuralElements(content);
    expect(result.some((e) => e.kind === "play-button-ui")).toBe(false);
  });

  it("still detects a real play control", () => {
    const result = extractStructuralElements(`<button aria-label="Play"><PlayCircle /></button>`);
    expect(result.some((e) => e.kind === "play-button-ui")).toBe(true);
  });

  it("reports no elements for an autofix stub placeholder", () => {
    const stub = [
      `export function ArticleBlockView() {`,
      `  // autofix-stub:ArticleBlockView — model did not emit a real implementation.`,
      `  return <span role="status" data-autofix-stub="ArticleBlockView" style={{ display: "inline-flex" }}>Platshållare</span>;`,
      `}`,
    ].join("\n");
    expect(extractStructuralElements(stub)).toEqual([]);
  });
});

describe("detectDroppedElements", () => {
  it("detects when a video element is dropped from a file", () => {
    const prev = [
      makeFile("app/page.tsx", `<div><video src="/hero.mp4" poster="/p.jpg" /><h1>Title</h1></div>`),
    ];
    const next = [
      makeFile("app/page.tsx", `<div><h1>Title</h1><p>Updated text</p></div>`),
    ];
    const warnings = detectDroppedElements(prev, next);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].file).toBe("app/page.tsx");
    expect(warnings[0].droppedElements.some((e) => e.kind === "video")).toBe(true);
  });

  it("returns no warnings when elements are preserved", () => {
    const prev = [
      makeFile("app/page.tsx", `<div><video src="/hero.mp4" /><h1>Title</h1></div>`),
    ];
    const next = [
      makeFile("app/page.tsx", `<div><video src="/hero.mp4" autoPlay /><h1>New Title</h1></div>`),
    ];
    const warnings = detectDroppedElements(prev, next);
    expect(warnings).toHaveLength(0);
  });

  it("returns no warnings for files not in newFiles (kept as-is)", () => {
    const prev = [
      makeFile("app/page.tsx", `<video src="/v.mp4" />`),
      makeFile("components/hero.tsx", `<canvas />`),
    ];
    const next = [
      makeFile("app/page.tsx", `<video src="/v.mp4" />`),
    ];
    const warnings = detectDroppedElements(prev, next);
    expect(warnings).toHaveLength(0);
  });

  it("detects multiple dropped elements", () => {
    const prev = [
      makeFile("app/page.tsx", `<div><video src="/v.mp4" /><form><input /></form></div>`),
    ];
    const next = [
      makeFile("app/page.tsx", `<div><p>Replaced everything</p></div>`),
    ];
    const warnings = detectDroppedElements(prev, next);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].droppedElements.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores files without structural elements", () => {
    const prev = [makeFile("lib/utils.ts", `export function cn() {}`)];
    const next = [makeFile("lib/utils.ts", `export function cn() { return ""; }`)];
    const warnings = detectDroppedElements(prev, next);
    expect(warnings).toHaveLength(0);
  });

  // The stub is what the pipeline writes when the model forgets a component.
  // Letting it win over the model's later real implementation freezes the
  // placeholder into the finished site.
  it("lets a real implementation replace an autofix stub", () => {
    const prev = [
      makeFile(
        "components/article-block-view.tsx",
        `export function ArticleBlockView() {\n  // autofix-stub:ArticleBlockView\n  return <span data-autofix-stub="ArticleBlockView" style={{ display: "inline-flex" }}>Platshållare</span>;\n}`,
      ),
    ];
    const next = [
      makeFile(
        "components/article-block-view.tsx",
        `export function ArticleBlockView({ block }: { block: Block }) {\n  return <article className="prose">{block.text}</article>;\n}`,
      ),
    ];
    expect(detectDroppedElements(prev, next)).toHaveLength(0);
  });
});

describe("buildFileStructuralInventory", () => {
  it("builds inventory for files with elements", () => {
    const files = [
      makeFile("app/page.tsx", `<video src="/v.mp4" />`),
      makeFile("lib/utils.ts", `export const x = 1;`),
      makeFile("components/scene.tsx", `<Canvas><mesh /></Canvas>`),
    ];
    const inv = buildFileStructuralInventory(files);
    expect(inv).toHaveLength(2);
    expect(inv[0].path).toBe("app/page.tsx");
    expect(inv[1].path).toBe("components/scene.tsx");
  });

  it("skips non-code files", () => {
    const files = [
      makeFile("README.md", `# Video player project <video />`),
    ];
    const inv = buildFileStructuralInventory(files);
    expect(inv).toHaveLength(0);
  });
});

describe("renderStructuralInventoryForPrompt", () => {
  it("renders a readable inventory", () => {
    const inv = buildFileStructuralInventory([
      makeFile("app/page.tsx", `<div><video src="/v.mp4" /><form><input /></form></div>`),
    ]);
    const text = renderStructuralInventoryForPrompt(inv);
    expect(text).toContain("Structural Element Inventory");
    expect(text).toContain("app/page.tsx");
    expect(text).toContain("<video>");
    expect(text).toContain("form");
  });

  it("returns empty string for empty inventory", () => {
    const text = renderStructuralInventoryForPrompt([]);
    expect(text).toBe("");
  });
});
