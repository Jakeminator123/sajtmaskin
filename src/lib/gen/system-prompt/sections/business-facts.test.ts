import { describe, expect, it } from "vitest";
import { BUSINESS_FACTS_MODULE_PATH } from "@/lib/projects/business-facts-module";
import {
  BUSINESS_FACTS_DEFAULTS,
  type BusinessFactsPersisted,
} from "@/lib/projects/business-facts-schema";
import { buildDynamicContext } from "../build-dynamic-context";
import { BUSINESS_FACTS_BLOCK_TITLE, renderBusinessFactsBlock } from "./business-facts";

const FACTS: BusinessFactsPersisted = {
  hours: { mode: "always_open", week: null },
  contact: {
    phone: "070-111 22 33",
    email: "hej@plockepinn.se",
    orgNumber: "556677-8899",
    address: null,
  },
  lastSetAt: "2026-10-22T08:00:00.000Z",
};

describe("renderBusinessFactsBlock", () => {
  it("renders nothing when the owner stated no facts", () => {
    expect(renderBusinessFactsBlock(null)).toEqual([]);
    expect(renderBusinessFactsBlock(BUSINESS_FACTS_DEFAULTS)).toEqual([]);
  });

  it("lists the facts, the import contract and the verbatim module for a new site", () => {
    const text = renderBusinessFactsBlock(FACTS).join("\n");
    expect(text).toContain(`## ${BUSINESS_FACTS_BLOCK_TITLE}`);
    expect(text).toContain("**Opening hours:** Öppet dygnet runt");
    expect(text).toContain("**Phone:** 070-111 22 33");
    expect(text).toContain("**E-mail:** hej@plockepinn.se");
    expect(text).toContain("**Org.nr:** 556677-8899");
    expect(text).not.toContain("**Address:**");
    expect(text).toContain("@/lib/business-facts");
    expect(text).toContain(`Emit \`${BUSINESS_FACTS_MODULE_PATH}\` with EXACTLY this content`);
    expect(text).toContain("export const businessFacts: BusinessFacts =");
  });

  it("tells a follow-up to keep the existing module instead of re-emitting it", () => {
    const text = renderBusinessFactsBlock(FACTS, {
      previousFilePaths: ["app/page.tsx", BUSINESS_FACTS_MODULE_PATH],
    }).join("\n");
    expect(text).toContain("already exists in this project. Keep it unchanged");
    expect(text).not.toContain("EXACTLY this content");
  });

  it("says explicitly when hours must not be rendered", () => {
    const text = renderBusinessFactsBlock({
      ...FACTS,
      hours: { mode: "unspecified", week: null },
    }).join("\n");
    expect(text).toContain("do not render an opening-hours section");
  });
});

describe("buildDynamicContext with businessFacts", () => {
  it("renders the block as a required budget block", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en sajt för en webbutik som säljer plockepinn",
      generationMode: "init",
      businessFacts: FACTS,
    });
    expect(result.context).toContain(`## ${BUSINESS_FACTS_BLOCK_TITLE}`);
    const block = result.blocks.find((candidate) => candidate.title === BUSINESS_FACTS_BLOCK_TITLE);
    expect(block).toMatchObject({ required: true });
  });

  it("renders no block for a verbatim imported repo, whose layout and alias are its own", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Uppdatera öppettiderna",
      generationMode: "followUp",
      importedRepoMode: true,
      businessFacts: FACTS,
    });
    expect(result.context).not.toContain(BUSINESS_FACTS_BLOCK_TITLE);
  });

  it("renders no block without facts", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en sajt",
      generationMode: "init",
    });
    expect(result.context).not.toContain(BUSINESS_FACTS_BLOCK_TITLE);
  });
});
