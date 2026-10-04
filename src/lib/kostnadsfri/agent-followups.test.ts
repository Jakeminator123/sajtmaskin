import { describe, expect, it } from "vitest";
import {
  applyFollowupAnswer,
  applyFollowupAnswersToWizard,
  applySilentFollowupTimeout,
  buildFollowupAddendum,
  continueFollowups,
  createFollowupSession,
  isHoldingCompanyProse,
  KOSTNADSFRI_FOLLOWUP_ADDENDUM_MAX,
  KOSTNADSFRI_FOLLOWUP_LIMIT,
  KOSTNADSFRI_FOLLOWUP_PROMPT_HEADING,
  kostnadsfriFollowupDirectiveLines,
  recordFollowupAnswer,
  selectKostnadsfriFollowups,
  skipAllFollowups,
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

describe("KostnadsfriFollowupAnswers", () => {
  const wizard = {
    companyName: "Zax",
    industry: "creative",
    website: "",
    location: "Kista",
    description: "Äga och förvalta aktier",
    purposes: ["leads"],
    targetAudience: "",
    usp: "",
    designVibe: "modern",
    paletteName: null,
    colorPrimary: null,
    colorSecondary: null,
    colorAccent: null,
  };

  it("mappar allowlistade fält per fråge-ID", () => {
    let answers = applyFollowupAnswer({}, "usp", "Drop-in på kvällar");
    answers = applyFollowupAnswer(answers, "targetAudience", "Boende i Kista");
    answers = applyFollowupAnswer(answers, "holding", "Vi klipper och färgar hår");

    expect(answers).toEqual({
      usp: "Drop-in på kvällar",
      targetAudience: "Boende i Kista",
      description: "Vi klipper och färgar hår",
    });

    const enriched = applyFollowupAnswersToWizard(wizard, answers);
    expect(enriched.usp).toBe("Drop-in på kvällar");
    expect(enriched.targetAudience).toBe("Boende i Kista");
    expect(enriched.description).toBe("Vi klipper och färgar hår");
  });

  it("sätter industry-id bara vid säker allowlist-träff", () => {
    expect(applyFollowupAnswer({}, "industry", "health").industryId).toBe("health");
    expect(applyFollowupAnswer({}, "industry", "Hälsa/Wellness").industryId).toBe("health");
    expect(applyFollowupAnswer({}, "industry", "frisörverksamhet")).toEqual({
      industryLabel: "frisörverksamhet",
    });
    expect(applyFollowupAnswersToWizard(wizard, { industryLabel: "frisörverksamhet" }).industry).toBe(
      "creative",
    );
    expect(applyFollowupAnswersToWizard(wizard, { industryId: "health" }).industry).toBe("health");
  });

  it("vägrar följdsvar som gör restaurang av en lotteri-/spelbeskrivning", () => {
    expect(() =>
      applyFollowupAnswersToWizard(
        { ...wizard, description: "Lotteri och spelplattformar" },
        { industryId: "restaurant" },
      ),
    ).toThrow(/Branschen stämmer inte/);
  });

  it("lägger booking och pris i addendum, inte som wizard-industry", () => {
    const answers = applyFollowupAnswer(
      applyFollowupAnswer({}, "booking", "Ring 08-123, öppet 10-18"),
      "sell",
      "Klippning från 420 kr",
    );
    expect(answers.bookingHours).toBe("Ring 08-123, öppet 10-18");
    expect(answers.price).toBe("Klippning från 420 kr");

    const addendum = buildFollowupAddendum(answers);
    expect(addendum).toContain(KOSTNADSFRI_FOLLOWUP_PROMPT_HEADING);
    expect(addendum).toContain("Ring 08-123, öppet 10-18");
    expect(addendum).toContain("Klippning från 420 kr");
    expect(applyFollowupAnswersToWizard(wizard, answers).industry).toBe("creative");
  });

  it("kapar addendumet och släpper inte transkript eller registerdata", () => {
    const long = "x".repeat(2000);
    const addendum = buildFollowupAddendum({
      bookingHours: long,
      price: long,
    });
    expect(addendum.length).toBeLessThanOrEqual(KOSTNADSFRI_FOLLOWUP_ADDENDUM_MAX);
    expect(addendum).not.toContain("559599-5639");
    expect(addendum).not.toContain("user: hej\nassistant: hej");
  });

  it("väntar på skip eller svar — tyst timeout och tomt svar stänger inte fasen", () => {
    const session = createFollowupSession(["usp", "targetAudience"]);
    expect(recordFollowupAnswer(session, "   ").completed).toBe(false);
    expect(applySilentFollowupTimeout(session).completed).toBe(false);
    expect(skipAllFollowups(session)).toMatchObject({ completed: true, completeReason: "skipped" });
    expect(continueFollowups(session)).toMatchObject({ completed: true, completeReason: "continued" });

    const answered = recordFollowupAnswer(session, "SM-F1-CONFIRM-PHRASE-7f3a");
    expect(answered.answers.usp).toBe("SM-F1-CONFIRM-PHRASE-7f3a");
    expect(answered.completed).toBe(false);
    expect(recordFollowupAnswer(answered, "Kistabor").completed).toBe(true);
  });
});
