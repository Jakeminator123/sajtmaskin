import { describe, expect, it } from "vitest";
import {
  CARD_BAR_RESERVE,
  CARD_GROW,
  CARD_LIMITS,
  CARD_SHRINK,
  CUBE_BEVEL,
  CUBE_DOCK,
  CUBE_HEAD,
  CUBE_LIMITS,
  DEFAULT_FOLDED_CARDS,
  STAGE_MARGIN,
  cascadeCardRects,
  clampPoint,
  cubeFrame,
  defaultCardRects,
  dragBounds,
  fitRect,
  raise,
  resizeCube,
  resizeFrom,
  scaleCard,
} from "./card-layout";
import { CUBE_FACE_IDS } from "./cube-model";

const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1024, height: 640 };

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("defaultCardRects", () => {
  it.each([DESKTOP, LAPTOP])("places all six cards inside the stage, above the bar (%o)", (stage) => {
    const rects = defaultCardRects(stage);
    for (const face of CUBE_FACE_IDS) {
      const r = rects[face];
      expect(r.x).toBeGreaterThanOrEqual(STAGE_MARGIN);
      expect(r.y).toBeGreaterThanOrEqual(STAGE_MARGIN);
      expect(r.x + r.width).toBeLessThanOrEqual(stage.width - STAGE_MARGIN);
      expect(r.y + r.height).toBeLessThanOrEqual(stage.height - STAGE_MARGIN - CARD_BAR_RESERVE);
      expect(r.width).toBeGreaterThanOrEqual(CARD_LIMITS.min.width);
      expect(r.height).toBeGreaterThanOrEqual(CARD_LIMITS.min.height);
    }
  });

  it.each([DESKTOP, LAPTOP])("keeps the open cards apart and the middle of the stage free (%o)", (stage) => {
    const rects = defaultCardRects(stage);
    const open = CUBE_FACE_IDS.filter((face) => !DEFAULT_FOLDED_CARDS.includes(face));
    expect([...open].sort()).toEqual(["answers", "avatar", "buildlog", "chat"]);
    for (const a of open) {
      for (const b of open) {
        if (a !== b) expect(overlaps(rects[a], rects[b])).toBe(false);
      }
    }
    // Svaren över chatten till vänster, som i chattpanelen.
    expect(rects.answers.x).toBe(rects.chat.x);
    expect(rects.answers.y + rects.answers.height).toBeLessThan(rects.chat.y);
    // Mellan kolumnerna syns sajten.
    const free = rects.avatar.x - (rects.chat.x + rects.chat.width);
    expect(free).toBeGreaterThanOrEqual(stage.width * 0.3);
  });

  it("opens the two folded cards in the middle, at the top", () => {
    const rects = defaultCardRects(DESKTOP);
    for (const face of DEFAULT_FOLDED_CARDS) {
      expect(rects[face].x).toBeGreaterThan(rects.chat.x + rects.chat.width);
      expect(rects[face].x + rects[face].width).toBeLessThan(rects.avatar.x);
      expect(rects[face].y).toBe(STAGE_MARGIN);
    }
    expect(overlaps(rects.tools, rects.sitemap)).toBe(false);
  });

  it("falls back to the cascade on a stage too small for two columns", () => {
    const small = { width: 560, height: 400 };
    expect(defaultCardRects(small)).toEqual(cascadeCardRects(small));
  });
});

describe("cascadeCardRects", () => {
  it("places all six cards inside the stage, cascading per column", () => {
    const rects = cascadeCardRects(DESKTOP);
    for (const face of CUBE_FACE_IDS) {
      const r = rects[face];
      expect(r.x).toBeGreaterThanOrEqual(STAGE_MARGIN);
      expect(r.y).toBeGreaterThanOrEqual(STAGE_MARGIN);
      expect(r.x + r.width).toBeLessThanOrEqual(DESKTOP.width - STAGE_MARGIN);
      expect(r.y + r.height).toBeLessThanOrEqual(DESKTOP.height - STAGE_MARGIN - CARD_BAR_RESERVE);
    }
    // Inte två kort på exakt samma origo.
    const origins = new Set(CUBE_FACE_IDS.map((f) => `${rects[f].x},${rects[f].y}`));
    expect(origins.size).toBe(6);
  });

  it("uses fewer columns on a narrow stage", () => {
    const rects = cascadeCardRects({ width: 700, height: 800 });
    const xs = new Set(CUBE_FACE_IDS.map((f) => rects[f].x));
    expect(xs.size).toBeGreaterThanOrEqual(2); // en kolumn, kaskad i x
    for (const f of CUBE_FACE_IDS) expect(rects[f].x + rects[f].width).toBeLessThanOrEqual(700 - STAGE_MARGIN);
  });
});

describe("drag bounds and clamping", () => {
  it("keeps an object fully inside with a margin", () => {
    const b = dragBounds(DESKTOP, { width: 400, height: 300 });
    expect(b).toEqual({ minX: 12, minY: 12, maxX: 1440 - 400 - 12, maxY: 900 - 300 - 12 });
    expect(clampPoint({ x: -50, y: 5000 }, DESKTOP, { width: 400, height: 300 })).toEqual({ x: 12, y: 588 });
  });

  it("pins to the top-left when the object is larger than the stage", () => {
    expect(clampPoint({ x: 100, y: 100 }, { width: 200, height: 200 }, { width: 400, height: 400 })).toEqual({ x: 12, y: 12 });
  });
});

describe("fitRect", () => {
  it("fits a desktop rect into a smaller stage without mutating the saved value", () => {
    const saved = Object.freeze({ x: 800, y: 100, width: 600, height: 700 });
    const fitted = fitRect(saved, LAPTOP, CARD_LIMITS, STAGE_MARGIN, CARD_BAR_RESERVE);
    expect(saved).toEqual({ x: 800, y: 100, width: 600, height: 700 });
    expect(fitted.width).toBe(600);
    expect(fitted.height).toBe(640 - 2 * STAGE_MARGIN - CARD_BAR_RESERVE);
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(LAPTOP.width - STAGE_MARGIN);
    expect(fitted.y).toBe(STAGE_MARGIN);
    // Tillbaka på stor skärm: originalet gäller igen.
    expect(fitRect(saved, DESKTOP, CARD_LIMITS)).toEqual(saved);
  });

  it("clamps sizes to limits", () => {
    expect(fitRect({ x: 0, y: 0, width: 10, height: 5000 }, DESKTOP, CUBE_LIMITS)).toMatchObject({
      width: CUBE_LIMITS.min.width,
      height: DESKTOP.height - 2 * STAGE_MARGIN,
    });
  });
});

describe("scaleCard", () => {
  it("multiplies width and height and keeps the centre", () => {
    const r = { x: 200, y: 100, width: 400, height: 500 };
    const g = scaleCard(r, CARD_GROW, DESKTOP);
    expect(g.width).toBe(Math.round(400 * CARD_GROW));
    expect(g.height).toBe(Math.round(500 * CARD_GROW));
    expect(Math.round(g.x + g.width / 2)).toBe(400);
    const s = scaleCard(r, CARD_SHRINK, DESKTOP);
    expect(s.width).toBe(Math.round(400 * CARD_SHRINK));
  });

  it("respects min/max", () => {
    const tiny = scaleCard({ x: 20, y: 20, width: CARD_LIMITS.min.width, height: CARD_LIMITS.min.height }, 0.5, DESKTOP);
    expect(tiny.width).toBe(CARD_LIMITS.min.width);
    const huge = scaleCard({ x: 20, y: 20, width: CARD_LIMITS.max.width, height: CARD_LIMITS.max.height }, 2, DESKTOP);
    expect(huge.width).toBe(CARD_LIMITS.max.width);
  });
});

describe("resize", () => {
  it("resizes from the east/south edges within the stage and limits", () => {
    const start = { x: 100, y: 100, width: 400, height: 400 };
    expect(resizeFrom(start, "se", 50, 60, DESKTOP, CARD_LIMITS)).toEqual({ x: 100, y: 100, width: 450, height: 460 });
    expect(resizeFrom(start, "e", 5000, 0, DESKTOP, CARD_LIMITS).width).toBe(CARD_LIMITS.max.width);
    expect(resizeFrom(start, "s", 0, -5000, DESKTOP, CARD_LIMITS).height).toBe(CARD_LIMITS.min.height);
  });

  it("moves the origin when resizing from west/north", () => {
    const start = { x: 300, y: 300, width: 400, height: 400 };
    const r = resizeFrom(start, "nw", -50, -20, DESKTOP, CARD_LIMITS);
    expect(r).toEqual({ x: 250, y: 280, width: 450, height: 420 });
  });

  it("resizes the cube panel and keeps chrome out of the panel size", () => {
    const frame = cubeFrame({ x: 50, y: 50 }, { width: 400, height: 560 }, DESKTOP, false);
    const next = resizeCube(frame.outer, "se", 40, 20, DESKTOP);
    expect(next.size).toEqual({ width: 440, height: 580 });
  });
});

describe("cubeFrame", () => {
  it("wraps the panel in header, bevel and dock", () => {
    const { outer, body } = cubeFrame({ x: 40, y: 30 }, { width: 400, height: 560 }, DESKTOP, false);
    expect(body).toEqual({ x: 40 + CUBE_BEVEL, y: 30 + CUBE_HEAD + CUBE_BEVEL, width: 400, height: 560 });
    expect(outer.height).toBe(560 + CUBE_HEAD + 2 * CUBE_BEVEL + CUBE_DOCK);
  });

  it("is a full-width bottom sheet on narrow stages", () => {
    const { outer, body } = cubeFrame({ x: 500, y: 500 }, { width: 400, height: 560 }, { width: 390, height: 844 }, true);
    expect(outer.x).toBe(0);
    expect(outer.width).toBe(390);
    expect(outer.y + outer.height).toBe(844);
    expect(body.width).toBe(390);
  });

  it("shrinks the panel to fit a small stage", () => {
    const { outer, body } = cubeFrame({ x: 900, y: 300 }, { width: 600, height: 800 }, LAPTOP, false);
    expect(outer.y + outer.height).toBeLessThanOrEqual(LAPTOP.height - STAGE_MARGIN);
    expect(body.height).toBeGreaterThanOrEqual(CUBE_LIMITS.min.height);
  });
});

describe("raise", () => {
  it("moves a face to the top of the z-order", () => {
    expect(raise(["chat", "answers", "tools"], "chat")).toEqual(["answers", "tools", "chat"]);
  });
});
