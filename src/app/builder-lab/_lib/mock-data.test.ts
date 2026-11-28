import { describe, expect, it } from "vitest";
import { applyFollowUp, createInitialVersion, visibleSections } from "./mock-data";

describe("builder-lab mock-data", () => {
  it("väljer typ, namn och stad ur första prompten", () => {
    const version = createInitialVersion(
      "En stilren sajt för min frisörsalong i Malmö som heter Studio Lugn.",
      "auto",
    );
    expect(version.content.kind).toBe("salon");
    expect(version.content.brand).toBe("Studio Lugn");
    expect(version.content.city).toBe("Malmö");
    expect(version.theme).toBe("slate");
  });

  it("läser inte «eko» inuti andra ord som en grön palett", () => {
    const version = createInitialVersion(
      "Ett kafé som heter Kaffekoppen. Varm och mysig känsla.",
      "auto",
    );
    expect(version.theme).toBe("amber");
  });

  it("lägger till bokning som en ny version med rätt ändrade sektioner", () => {
    const v1 = createInitialVersion("Ett kafé i Göteborg som heter Kaffekoppen", "auto");
    const v2 = applyFollowUp(v1, "Lägg till bokning", null);
    expect(v2.number).toBe(2);
    expect(v2.content.booking).toBe(true);
    expect(v2.changed).toEqual(["booking"]);
    expect(visibleSections(v2.content)).toContain("booking");
    expect(v1.content.booking).toBe(false);
  });

  it("riktad ändring utan nyckelord rör bara den valda sektionen", () => {
    const v1 = createInitialVersion("Ett kafé", "auto");
    const v2 = applyFollowUp(v1, "Gör den lite bättre", "about");
    expect(v2.changed).toEqual(["about"]);
    expect(v2.content.about.text).not.toBe(v1.content.about.text);
  });
});
