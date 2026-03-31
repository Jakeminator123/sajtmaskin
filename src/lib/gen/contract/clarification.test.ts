import { describe, expect, it } from "vitest";
import { buildContractClarificationQuestion } from "./clarification";
import type { PreGenerationContractContext } from "./pre-generation-contracts";

describe("buildContractClarificationQuestion", () => {
  it("does not block on env-only unresolved decisions", () => {
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
      previewFirst: false,
    });

    expect(q).toBeNull();
  });

  it("returns null by default (previewFirst=true) even with unresolved auth", () => {
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "persisted",
        integrations: [],
        envVars: [],
      },
      unresolvedDecisions: [{ kind: "auth", reason: "unset" }],
      confirmedAnswers: [],
    };

    expect(
      buildContractClarificationQuestion({ buildIntent: "website", context }),
    ).toBeNull();
  });

  it("blocks on auth when previewFirst is explicitly false", () => {
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "persisted",
        integrations: [],
        envVars: [],
      },
      unresolvedDecisions: [{ kind: "auth", reason: "unset" }],
      confirmedAnswers: [],
    };

    const q = buildContractClarificationQuestion({
      buildIntent: "website",
      context,
      previewFirst: false,
    });

    expect(q).not.toBeNull();
    expect(q!.kind).toBe("auth");
    expect(q!.blocking).toBe(true);
  });
});
