import { describe, expect, it } from "vitest";

import { groupAgentLogItems, parseAgentLogFact } from "./agent-log-groups";

describe("parseAgentLogFact", () => {
  it.each([
    ["Byggprofil: Låg", { key: "Byggprofil", value: "Låg" }],
    ["Körmodell: gpt-6.1-sol", { key: "Körmodell", value: "gpt-6.1-sol" }],
    ["Deep Brief-provider: OpenAI", { key: "Deep Brief-provider", value: "OpenAI" }],
    ["Faser: wait 2.0s, reasoning 11s, output 63s", { key: "Faser", value: "wait 2.0s, reasoning 11s, output 63s" }],
    [
      "Längd: 32 tecken (mjuk orkestreringsgräns ~75000 innan ev. sammandragning)",
      { key: "Längd", value: "32 tecken (mjuk orkestreringsgräns ~75000 innan ev. sammandragning)" },
    ],
  ])("reads «%s» as a key and a value", (label, expected) => {
    expect(parseAgentLogFact({ label })).toEqual(expected);
  });

  it.each([
    "Startar own-engine-strömmen",
    "Generering klar (75s) — startar efterkontroller och slutsteg",
    "Expanderar kortade URL:er till fulla adresser",
    "Väntar på första kod- eller textoutput från modellen",
    "Klar 12:30",
    "Verifiering: läser av projektet efter syntax (ingen kodändring i detta steg)",
    "Modellen svarade. Nästa steg: verifiering",
    ": utan nyckel",
    "Utan värde: ",
  ])("keeps «%s» as a step", (label) => {
    expect(parseAgentLogFact({ label })).toBeNull();
  });

  it("keeps a failed row and a row with details as steps, so nothing is hidden in a table", () => {
    expect(parseAgentLogFact({ label: "Verifiering: misslyckades", failed: true })).toBeNull();
    expect(parseAgentLogFact({ label: "Deep Brief: klar", detail: "Hela briefen …" })).toBeNull();
  });

  it("keeps long prose values in the timeline", () => {
    expect(parseAgentLogFact({ label: `Orsak: ${"ord ".repeat(40)}` })).toBeNull();
  });
});

describe("groupAgentLogItems", () => {
  it("groups runs of facts and keeps the steps in order between them", () => {
    const groups = groupAgentLogItems([
      { label: "Byggprofil: Låg" },
      { label: "Körmodell: gpt-6.1-sol" },
      { label: "Deep Brief (resonemang)", detail: "underlag" },
      { label: "Scaffold: Landing Page" },
      { label: "Startar own-engine-strömmen" },
      { label: "Generering klar (75s) — startar efterkontroller och slutsteg" },
      { label: "Faser: wait 2.0s, reasoning 11s, output 63s" },
    ]);

    expect(groups.map((group) => group.kind)).toEqual(["facts", "step", "facts", "step", "step", "facts"]);
    expect(groups[0]).toEqual({
      kind: "facts",
      facts: [
        { key: "Byggprofil", value: "Låg" },
        { key: "Körmodell", value: "gpt-6.1-sol" },
      ],
    });
    expect(groups[1]).toEqual({ kind: "step", item: { label: "Deep Brief (resonemang)", detail: "underlag" } });
  });

  it("returns nothing for an empty log", () => {
    expect(groupAgentLogItems([])).toEqual([]);
  });
});
