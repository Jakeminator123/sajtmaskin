// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearCampaignScriptStorageForTests,
  emptyCampaignScript,
  persistBoundCampaignProjectId,
  writeCampaignScript,
} from "@/lib/kostnadsfri/agent-campaign-script";
import { collectOpenClawClientContext } from "./client-context";

describe("collectOpenClawClientContext — F6", () => {
  afterEach(() => {
    clearCampaignScriptStorageForTests();
    delete window.__SITEMASKIN_CONTEXT;
  });

  it("läcker inte kampanj A till /konto eller projekt B", () => {
    const script = persistBoundCampaignProjectId("proj-a", {
      slug: "slug-a",
    });
    writeCampaignScript(script ?? { ...emptyCampaignScript("slug-a"), projectId: "proj-a" });

    window.__SITEMASKIN_CONTEXT = { page: "account" };
    window.history.replaceState({}, "", "/konto");
    expect(collectOpenClawClientContext()?.kostnadsfriCampaign).toBeUndefined();

    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      buildMethod: "kostnadsfri",
      projectId: "proj-b",
    };
    window.history.replaceState({}, "", "/builder?project=proj-b");
    expect(collectOpenClawClientContext()?.kostnadsfriCampaign).toBeUndefined();

    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      buildMethod: "kostnadsfri",
      projectId: "proj-a",
    };
    window.history.replaceState({}, "", "/builder?project=proj-a");
    expect(collectOpenClawClientContext()?.kostnadsfriCampaign).toMatchObject({
      projectId: "proj-a",
    });
  });
});
