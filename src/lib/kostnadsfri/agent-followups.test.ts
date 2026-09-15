import { describe, expect, it } from "vitest";
import {
  isHoldingCompanyProse,
  KOSTNADSFRI_FOLLOWUP_LIMIT,
  kostnadsfriFollowupDirectiveLines,
  selectKostnadsfriFollowups,
} from "./agent-followups";
import type { KostnadsfriAgentBrief } from "./agent-brief";

const fullBrief: KostnadsfriAgentBrief = {
  stage: "handoff",
  companyName: "Zax Frisör",
  industryLabel: "Hälsa/Wellness",
  businessDescription: "Vi klipper och färgar hår i Kista.",
  purposeLabels: ["Leads"],
  targetAudience: "Boende i Kista",
  usp: "Drop-in på kvällar",
};

describe("selectKostnadsfriFollowups", () => {
  it("ger högst tre frågor även när alla luckor finns", () => {
    const followups = selectKostnadsfriFollowups({
      purposeLabels: ["Bokningar", "Sälja"],
      businessDescription: "Bolaget ska äga och förvalta aktier i andra bolag.",
    });

    expect(followups).toHaveLength(KOSTNADSFRI_FOLLOWUP_LIMIT);
    expect(followups.map((item) => item.id)).toEqual(["usp", "targetAudience", "industry"]);
  });

  it("följer underlagets luckor och prioritetsordningen", () => {
    expect(selectKostnadsfriFollowups({ ...fullBrief, usp: undefined }).map((item) => item.id)).toEqual([
      "usp",
    ]);
    expect(
      selectKostnadsfriFollowups({ ...fullBrief, targetAudience: undefined }).map((item) => item.id),
    ).toEqual(["targetAudience"]);
    expect(
      selectKostnadsfriFollowups({ ...fullBrief, industryLabel: undefined }).map((item) => item.id),
    ).toEqual(["industry"]);

    const twoGaps = selectKostnadsfriFollowups({
      ...fullBrief,
      usp: undefined,
      targetAudience: undefined,
    });
    expect(twoGaps.map((item) => item.id)).toEqual(["usp", "targetAudience"]);
  });

  it("ställer holdingfrågan när verksamhetstexten är förvaltningsprosa", () => {
    expect(isHoldingCompanyProse("Bolaget ska äga och förvalta aktier.")).toBe(true);
    expect(isHoldingCompanyProse("Inriktning: Kapitalförvaltning i Stockholm")).toBe(true);
    expect(isHoldingCompanyProse("Verksamhet som holdingbolag")).toBe(true);
    expect(isHoldingCompanyProse("Vi klipper hår i Kista")).toBe(false);
    expect(isHoldingCompanyProse(undefined)).toBe(false);

    const followups = selectKostnadsfriFollowups({
      ...fullBrief,
      businessDescription: "Äga och förvalta aktier samt därmed förenlig verksamhet.",
    });
    expect(followups.map((item) => item.id)).toEqual(["holding"]);
  });

  it("faller tillbaka på Bokningar eller Sälja när luckorna är fyllda", () => {
    expect(
      selectKostnadsfriFollowups({
        ...fullBrief,
        purposeLabels: ["Bokningar"],
      }).map((item) => item.id),
    ).toEqual(["booking"]);

    expect(
      selectKostnadsfriFollowups({
        ...fullBrief,
        purposeLabels: ["Sälja"],
      }).map((item) => item.id),
    ).toEqual(["sell"]);

    expect(
      selectKostnadsfriFollowups({
        ...fullBrief,
        purposeLabels: ["Bokningar", "Sälja"],
      }).map((item) => item.id),
    ).toEqual(["booking", "sell"]);
  });
});

describe("kostnadsfriFollowupDirectiveLines", () => {
  it("skickar direktiv, inte färdiga chatrepliker, och respekterar hoppa-över", () => {
    const lines = kostnadsfriFollowupDirectiveLines({
      stage: "handoff",
      companyName: "Zax",
    });
    expect(lines[0]).toMatch(/Uppföljningsdirektiv/);
    expect(lines.join("\n")).toContain("Fråga vad som skiljer dem från konkurrenterna.");

    expect(
      kostnadsfriFollowupDirectiveLines(
        { stage: "handoff", companyName: "Zax" },
        { skipped: true },
      ).join("\n"),
    ).toMatch(/hoppade över/);

    expect(kostnadsfriFollowupDirectiveLines({ stage: "wizard", companyName: "Zax" })).toEqual([]);
  });
});
