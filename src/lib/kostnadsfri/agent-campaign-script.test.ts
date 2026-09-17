import { describe, expect, it } from "vitest";
import {
  bindCampaignScriptProjectId,
  buildKostnadsfriHandoffIntro,
  campaignContextForClient,
  campaignCopyBundleForTests,
  consumeAdviceRound,
  decideKostnadsfriBuildStartedAnnounce,
  decideKostnadsfriHandoffOpen,
  emptyCampaignScript,
  formatAdviceRemaining,
  KOSTNADSFRI_ADVICE_ROUND_LIMIT,
  kostnadsfriCampaignManuscriptLines,
  markHandoffOpened,
  persistBoundCampaignProjectId,
  reusableBoundCampaignProjectId,
  shouldActivateCampaignScriptChrome,
  shouldAttachCampaignContext,
  shouldEnforceCampaignAdviceQuota,
  shouldRecordCampaignFollowupInScope,
  shouldRetainCampaignScriptInScope,
  writeCampaignScript,
  type CampaignScriptStorage,
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
    script.projectId = "proj-a";
    expect(
      shouldEnforceCampaignAdviceQuota(
        { page: "builder", buildMethod: "kostnadsfri", projectId: "proj-a" },
        script,
      ),
    ).toBe(true);
    expect(
      shouldEnforceCampaignAdviceQuota(
        { page: "builder", buildMethod: "kostnadsfri", projectId: "proj-b" },
        script,
      ),
    ).toBe(false);
    expect(shouldEnforceCampaignAdviceQuota({ page: "landing" }, script)).toBe(false);
    expect(shouldEnforceCampaignAdviceQuota({ page: "kostnadsfri" }, null)).toBe(false);
  });

  it("visar inte skip/kvot på lösenordssteget eller i wizarden", () => {
    expect(
      shouldActivateCampaignScriptChrome({
        pathname: "/kostnadsfri/zax-2-0-ab",
        context: { page: "kostnadsfri", kostnadsfriBrief: { stage: "gate", companyName: "Zax" } },
      }),
    ).toBe(false);
    expect(
      shouldActivateCampaignScriptChrome({
        pathname: "/kostnadsfri/zax-2-0-ab",
        context: { page: "kostnadsfri", kostnadsfriBrief: { stage: "wizard", companyName: "Zax" } },
      }),
    ).toBe(false);
    expect(
      shouldActivateCampaignScriptChrome({
        pathname: "/kostnadsfri/zax-2-0-ab",
        context: handoffContext,
      }),
    ).toBe(true);
    expect(
      shouldActivateCampaignScriptChrome({
        pathname: "/kostnadsfri/zax-2-0-ab",
        context: { page: "kostnadsfri", kostnadsfriBrief: { stage: "gate", companyName: "Zax" } },
        script: markHandoffOpened(emptyCampaignScript("zax-2-0-ab")),
      }),
    ).toBe(true);
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
    const script = bindCampaignScriptProjectId(
      markHandoffOpened(emptyCampaignScript("zax-2-0-ab")),
      "proj-a",
    );
    const first = decideKostnadsfriBuildStartedAnnounce({
      pathname: "/builder",
      context: { buildMethod: "kostnadsfri", isStreaming: true, projectId: "proj-a" },
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
      campaign: {
        followupsSkipped: false,
        followupsCompleted: false,
        remaining: 5,
        buildStarted: false,
        projectId: null,
      },
    });
    const block = lines.join("\n");
    expect(lines[0]).toBe("[KAMPANJ-MANUS]");
    expect(block).toContain("Uppföljningsdirektiv");
    expect(block).toContain("Rådgivningskvot");
    expect(block.toLowerCase()).not.toMatch(/generering|ombyggnad/);
  });
});

function memoryStorage(): CampaignScriptStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("F6 projectId-bindning", () => {
  it("kampanj A → projekt A → /konto → projekt B utan A → tillbaka till A", () => {
    const storage = memoryStorage();
    let script = emptyCampaignScript("slug-a");
    writeCampaignScript(script, storage);
    script = persistBoundCampaignProjectId("proj-a", { slug: "slug-a", storage })!;
    expect(script.projectId).toBe("proj-a");

    expect(
      shouldAttachCampaignContext({
        pathname: "/builder",
        page: "builder",
        buildMethod: "kostnadsfri",
        currentProjectId: "proj-a",
        script,
      }),
    ).toBe(true);

    expect(
      shouldAttachCampaignContext({
        pathname: "/konto",
        page: "account",
        currentProjectId: null,
        script,
      }),
    ).toBe(false);
    expect(
      campaignContextForClient(storage, {
        pathname: "/konto",
        page: "account",
        currentProjectId: null,
      }),
    ).toBeNull();

    expect(
      shouldAttachCampaignContext({
        pathname: "/builder",
        page: "builder",
        buildMethod: "kostnadsfri",
        currentProjectId: "proj-b",
        script,
      }),
    ).toBe(false);

    expect(
      shouldAttachCampaignContext({
        pathname: "/builder",
        page: "builder",
        buildMethod: "kostnadsfri",
        currentProjectId: "proj-a",
        script,
      }),
    ).toBe(true);
  });
});

describe("slugbunden projectId-återanvändning", () => {
  it("återanvänder persistat projectId för samma slug, inte för en annan", () => {
    const storage = memoryStorage();
    writeCampaignScript({ ...emptyCampaignScript("slug-a"), projectId: "proj-a" }, storage);

    expect(
      reusableBoundCampaignProjectId("slug-a", emptyCampaignScript("slug-a"), storage),
    ).toBe("proj-a");
    expect(
      reusableBoundCampaignProjectId(
        "slug-a",
        { ...emptyCampaignScript("slug-a"), projectId: "proj-live" },
        storage,
      ),
    ).toBe("proj-live");
    expect(
      reusableBoundCampaignProjectId(
        "slug-b",
        { ...emptyCampaignScript("slug-a"), projectId: "proj-a" },
        storage,
      ),
    ).toBeNull();
  });

  it("behåller script i minnet för samma slug och builder, inte /konto", () => {
    const script = { ...emptyCampaignScript("zax-2-0-ab"), projectId: "proj-a" };
    expect(
      shouldRetainCampaignScriptInScope(script, "/kostnadsfri/zax-2-0-ab::kostnadsfri"),
    ).toBe(true);
    expect(shouldRetainCampaignScriptInScope(script, "/builder::builder::chat_1")).toBe(true);
    expect(shouldRetainCampaignScriptInScope(script, "/konto::account")).toBe(false);
    expect(
      shouldRetainCampaignScriptInScope(script, "/kostnadsfri/other-campaign::kostnadsfri"),
    ).toBe(false);
  });

  it("gatar follow-up-reply till kampanjscopet", () => {
    const script = emptyCampaignScript("zax-2-0-ab");
    expect(
      shouldRecordCampaignFollowupInScope(script, "/kostnadsfri/zax-2-0-ab::kostnadsfri"),
    ).toBe(true);
    expect(shouldRecordCampaignFollowupInScope(script, "global")).toBe(true);
    expect(shouldRecordCampaignFollowupInScope(script, "/konto::account")).toBe(false);
    expect(shouldRecordCampaignFollowupInScope(script, "/builder::builder::chat_1")).toBe(false);
    expect(
      shouldRecordCampaignFollowupInScope(script, "/kostnadsfri/other-campaign::kostnadsfri"),
    ).toBe(false);
  });
});
