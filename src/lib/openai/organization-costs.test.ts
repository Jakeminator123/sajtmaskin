import { describe, expect, it, vi } from "vitest";
import { fetchOpenAiOrganizationCosts } from "./organization-costs";

describe("fetchOpenAiOrganizationCosts", () => {
  it("returns an explicit unconfigured state without making a request", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchOpenAiOrganizationCosts({
      days: 7,
      now: new Date("2026-08-12T12:00:00.000Z"),
      adminKey: "",
      fetchImpl: fetchImpl as never,
    });

    expect(result.status).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("aggregates paginated daily organization costs without user attribution", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                start_time: 1786406400,
                end_time: 1786492800,
                results: [
                  {
                    amount: { value: 1.25, currency: "usd" },
                    project_id: "proj_1",
                    api_key_id: "key_1",
                    line_item: "Responses API",
                  },
                ],
              },
            ],
            has_more: true,
            next_page: "next_1",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                start_time: 1786492800,
                end_time: 1786579200,
                results: [
                  {
                    amount: { value: "0.75", currency: "usd" },
                    project_id: "proj_1",
                    api_key_id: "key_1",
                    line_item: "Responses API",
                  },
                ],
              },
            ],
            has_more: false,
            next_page: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const result = await fetchOpenAiOrganizationCosts({
      days: 7,
      now: new Date("2026-08-12T12:00:00.000Z"),
      adminKey: "admin-test-key",
      fetchImpl: fetchImpl as never,
    });

    expect(result.status).toBe("ok");
    expect(result.totalCostMicroUsd).toBe(2_000_000);
    expect(result.lineItems).toEqual([
      {
        lineItem: "Responses API",
        projectId: "proj_1",
        apiKeyId: "key_1",
        costMicroUsd: 2_000_000,
      },
    ]);
    expect(result.attribution).toBe("daily_org_project_api_key_line_item_only");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("page=next_1");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("group_by=api_key_id");
  });

  it("never includes the provider response body in an HTTP error", async () => {
    const result = await fetchOpenAiOrganizationCosts({
      days: 1,
      adminKey: "admin-test-key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(new Response("secret diagnostic body", { status: 401 })) as never,
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("OpenAI Costs API svarade HTTP 401.");
    expect(result.error).not.toContain("secret diagnostic");
  });
});
