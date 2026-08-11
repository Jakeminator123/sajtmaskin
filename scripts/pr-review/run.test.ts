import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOpenAIReviewer } from "./run.mjs";

describe("OpenAI PR reviewer model policy", () => {
  it("reads canonical manifest models and keeps follow-up output finding-specific", async () => {
    const manifest = JSON.parse(readFileSync("config/ai_models/manifest.json", "utf8"));
    const workload = manifest.workloads.find(
      (item: { id: string }) => item.id === "github_pr_reviewer",
    );
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      responses: {
        async create(params: Record<string, unknown>) {
          calls.push(params);
          const isFollowUp = params.model === workload.followUpModel;
          return {
            output_text: isFollowUp
              ? JSON.stringify({
                  statuses: [{ findingId: "F-existing", status: "fixed", reason: "Guard added." }],
                })
              : JSON.stringify({ summary: "Clean.", findings: [] }),
          };
        },
      },
    };
    const reviewer = createOpenAIReviewer({
      apiKey: "test-only",
      exhaustiveModel: workload.defaultModel,
      followUpModel: workload.followUpModel,
      client,
    });

    await reviewer.exhaustive("diff");
    await reviewer.followUp("context", ["F-existing"]);

    expect(calls[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "high" },
      store: false,
    });
    expect(calls[1]).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning: { effort: "low" },
      store: false,
    });
    expect(JSON.stringify(calls[1])).not.toContain('"findings"');
  });
});
