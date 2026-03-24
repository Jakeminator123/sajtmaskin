import { describe, expect, it } from "vitest";
import { buildContractClarificationQuestion } from "./contract-clarification";
import type { PreGenerationContractContext } from "./pre-generation-contracts";

describe("buildContractClarificationQuestion", () => {
  it("returns env clarification when only env decisions are unresolved", () => {
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "none",
        integrations: [],
        envVars: [{ key: "OPENAI_API_KEY", reason: "Listed integration" }],
      },
      unresolvedDecisions: [{ kind: "env", reason: "Saknade API-nycklar" }],
      confirmedAnswers: [],
    };

    const q = buildContractClarificationQuestion({
      buildIntent: "website",
      context,
    });

    expect(q).not.toBeNull();
    expect(q?.kind).toBe("env");
    expect(q?.question).toContain("miljövariabler");
  });
});
