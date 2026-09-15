import { describe, expect, it } from "vitest";
import {
  buildKostnadsfriHandoffIntro,
  campaignCopyBundleForTests,
  consumeAdviceRound,
  decideKostnadsfriBuildStartedAnnounce,
  decideKostnadsfriHandoffOpen,
  emptyCampaignScript,
  formatAdviceRemaining,
  KOSTNADSFRI_ADVICE_ROUND_LIMIT,
  kostnadsfriCampaignManuscriptLines,
  markHandoffOpened,
  shouldEnforceCampaignAdviceQuota,
} from "./agent-campaign-script";

const handoffContext = {
  page: "kostnadsfri",
  kostnadsfriBrief: { stage: "handoff" as const, companyName: "Zax Frisör", contactFirstName: "Jan" },
};

describe("decideKostnadsfriHandoffOpen", () => {
  it("fyrar exakt en gång per slug", () => {
    const first = decideKostnadsfriHandoffOpen({
      pathname: "/kostnadsfri/zax-2-0-ab",
      context: handoffContext,
      script: emptyCampaignScript("zax-2-0-ab"),
    });
    expect(first).toMatchObject({ open: true, slug: "zax-2-0-ab" });
    if (!first.open) throw new Error("expected open");

    const again = decideKostnadsfriHandoffOpen({
      pathname: "/kostnadsfri/zax-2-0-ab",
      context: handoffContext,
      script: markHandoffOpened(first.open ? emptyCampaignScript(first.slug) : emptyCampaignScript("x")),
    });
    expect(again.open).toBe(false);
  });

  it("öppnar inte före handoff, på annan route eller efter att bygget startat", () => {
    expect(
      decideKostnadsfriHandoffOpen({
        pathname: "/kostnadsfri/zax-2-0-ab",
        context: { kostnadsfriBrief: { stage: "wizard", companyName: "Zax" } },
        script: emptyCampaignScript("zax-2-0-ab"),
      }).open,
    ).toBe(false);

    expect(
      decideKostnadsfriHandoffOpen({
        pathname: "/builder",
        context: handoffContext,
        script: emptyCampaignScript("zax-2-0-ab"),
      }).open,
    ).toBe(false);

    const afterBuild = emptyCampaignScript("zax-2-0-ab");
    afterBuild.buildStartedAnnounced = true;
    expect(
      decideKostnadsfriHandoffOpen({
        pathname: "/kostnadsfri/zax-2-0-ab",
        context: handoffContext,
        script: afterBuild,
      }).open,
    ).toBe(false);
  });
});

describe("rådgivningskvot", () => {
  it("räknar ned och stannar på noll", () => {
    let state = emptyCampaignScript("zax-2-0-ab");
    expect(state.remaining).toBe(KOSTNADSFRI_ADVICE_ROUND_LIMIT);

    for (let i = 0; i < KOSTNADSFRI_ADVICE_ROUND_LIMIT; i += 1) {
      const step = consumeAdviceRound(state);
      expect(step.result).toBe("ok");
      state = step.state;
    }

    expect(state.remaining).toBe(0);
    const blocked = consumeAdviceRound(state);
    expect(blocked.result).toBe("exhausted");
    expect(blocked.state.remaining).toBe(0);
  });

  it("gäller bara kampanjytan", () => {
    const script = emptyCampaignScript("zax-2-0-ab");
    expect(shouldEnforceCampaignAdviceQuota({ page: "kostnadsfri" }, script)).toBe(true);
    expect(
      shouldEnforceCampaignAdviceQuota({ page: "builder", buildMethod: "kostnadsfri" }, script),
    ).toBe(true);
    expect(shouldEnforceCampaignAdviceQuota({ page: "landing" }, script)).toBe(false);
    expect(shouldEnforceCampaignAdviceQuota({ page: "kostnadsfri" }, null)).toBe(false);
  });
});

describe("kampanjcopy", () => {
  it("anpassar inledningen efter tilltalsnamn", () => {
    expect(buildKostnadsfriHandoffIntro({ companyName: "Zax Frisör", contactFirstName: "Jan" })).toContain(
      "Välkommen Jan och Zax Frisör.",
    );
    expect(buildKostnadsfriHandoffIntro({ companyName: "Zax Frisör" })).toContain("Välkommen Zax Frisör.");
    expect(buildKostnadsfriHandoffIntro({ companyName: "Zax Frisör" })).not.toContain(" och ");
  });

  it("säger rådgivning/hjälp och aldrig generering eller ombyggnad", () => {
    const bundle = campaignCopyBundleForTests().toLowerCase();
    expect(bundle).toContain("rådgivning");
    expect(bundle).toContain("hjälp");
    expect(bundle).not.toMatch(/generering/);
    expect(bundle).not.toMatch(/ombyggnad/);
    expect(formatAdviceRemaining(3)).toBe("3 rådgivningar kvar");
  });
});

describe("decideKostnadsfriBuildStartedAnnounce", () => {
  it("säger till när kampanjbygget startat, en gång", () => {
    const script = markHandoffOpened(emptyCampaignScript("zax-2-0-ab"));
    const first = decideKostnadsfriBuildStartedAnnounce({
      pathname: "/builder",
      context: { buildMethod: "kostnadsfri", isStreaming: true },
      script,
    });
    expect(first).toEqual({ announce: true, slug: "zax-2-0-ab" });

    script.buildStartedAnnounced = true;
    expect(
      decideKostnadsfriBuildStartedAnnounce({
        pathname: "/builder",
        context: { buildMethod: "kostnadsfri", isStreaming: true },
        script,
      }).announce,
    ).toBe(false);
  });
});

describe("kostnadsfriCampaignManuscriptLines", () => {
  it("lägger följdfrågor i systemkanalen", () => {
    const lines = kostnadsfriCampaignManuscriptLines({
      brief: { stage: "handoff", companyName: "Zax" },
      campaign: { followupsSkipped: false, remaining: 5, buildStarted: false },
    });
    const block = lines.join("\n");
    expect(lines[0]).toBe("[KAMPANJ-MANUS]");
    expect(block).toContain("Uppföljningsdirektiv");
    expect(block).toContain("Rådgivningskvot");
    expect(block.toLowerCase()).not.toMatch(/generering|ombyggnad/);
  });
});
