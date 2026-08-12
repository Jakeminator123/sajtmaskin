const OPENAI_COSTS_URL = "https://api.openai.com/v1/organization/costs";

type OpenAiCostResult = {
  amount?: { value?: number | string; currency?: string } | null;
  line_item?: string | null;
  project_id?: string | null;
  api_key_id?: string | null;
};

type OpenAiCostBucket = {
  start_time?: number;
  end_time?: number;
  results?: OpenAiCostResult[];
};

type OpenAiCostsPage = {
  data?: OpenAiCostBucket[];
  has_more?: boolean;
  next_page?: string | null;
};

export type OpenAiCostReconciliation = {
  status: "ok" | "unconfigured" | "error";
  scope: "organization";
  attribution: "daily_org_project_api_key_line_item_only";
  windowStart: string;
  windowEnd: string;
  totalCostMicroUsd: number;
  currency: "usd";
  buckets: Array<{
    startTime: string;
    endTime: string;
    costMicroUsd: number;
  }>;
  lineItems: Array<{
    lineItem: string;
    projectId: string | null;
    apiKeyId: string | null;
    costMicroUsd: number;
  }>;
  fetchedAt: string | null;
  error: string | null;
};

function normalizeDays(days: number): number {
  return Math.min(Math.max(Math.trunc(days), 1), 365);
}

function reconciliationWindow(days: number, now: Date) {
  const safeDays = normalizeDays(days);
  const end = new Date(now);
  const start = new Date(end.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { start, end, safeDays };
}

function baseResult(days: number, now: Date): OpenAiCostReconciliation {
  const { start, end } = reconciliationWindow(days, now);
  return {
    status: "unconfigured",
    scope: "organization",
    attribution: "daily_org_project_api_key_line_item_only",
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    totalCostMicroUsd: 0,
    currency: "usd",
    buckets: [],
    lineItems: [],
    fetchedAt: null,
    error: null,
  };
}

function amountToMicroUsd(result: OpenAiCostResult): number {
  if (result.amount?.currency && result.amount.currency.toLowerCase() !== "usd") return 0;
  const value = Number(result.amount?.value ?? 0);
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
}

/**
 * Fetches daily organization costs for operator reconciliation.
 *
 * The Costs API cannot attribute a charge to a Sajtmaskin user or version.
 * Those dimensions come only from our per-response `llm_usage` ledger; this
 * response is deliberately labelled as organization/project/API-key/day-level data.
 */
export async function fetchOpenAiOrganizationCosts(options: {
  days: number;
  now?: Date;
  adminKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<OpenAiCostReconciliation> {
  const now = options.now ?? new Date();
  const result = baseResult(options.days, now);
  const adminKey = (options.adminKey ?? process.env.OPENAI_ADMIN_KEY ?? "").trim();
  if (!adminKey) return result;

  const { start, end, safeDays } = reconciliationWindow(options.days, now);
  const fetchImpl = options.fetchImpl ?? fetch;
  const buckets = new Map<string, { start: number; end: number; costMicroUsd: number }>();
  const lineItems = new Map<
    string,
    {
      lineItem: string;
      projectId: string | null;
      apiKeyId: string | null;
      costMicroUsd: number;
    }
  >();
  let page: string | null = null;
  let pageCount = 0;

  try {
    do {
      const url = new URL(OPENAI_COSTS_URL);
      url.searchParams.set("start_time", String(Math.floor(start.getTime() / 1000)));
      url.searchParams.set("end_time", String(Math.floor(end.getTime() / 1000)));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.set("limit", String(Math.min(safeDays, 180)));
      url.searchParams.append("group_by", "project_id");
      url.searchParams.append("group_by", "api_key_id");
      url.searchParams.append("group_by", "line_item");
      if (page) url.searchParams.set("page", page);

      const response = await fetchImpl(url, {
        headers: {
          authorization: `Bearer ${adminKey}`,
          accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return {
          ...result,
          status: "error",
          fetchedAt: new Date().toISOString(),
          error: `OpenAI Costs API svarade HTTP ${response.status}.`,
        };
      }

      const payload = (await response.json()) as OpenAiCostsPage;
      for (const bucket of Array.isArray(payload.data) ? payload.data : []) {
        const startTime = Number(bucket.start_time);
        const endTime = Number(bucket.end_time);
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
        const bucketKey = `${startTime}:${endTime}`;
        const aggregate = buckets.get(bucketKey) ?? {
          start: startTime,
          end: endTime,
          costMicroUsd: 0,
        };
        for (const item of Array.isArray(bucket.results) ? bucket.results : []) {
          const costMicroUsd = amountToMicroUsd(item);
          aggregate.costMicroUsd += costMicroUsd;
          const lineItem = item.line_item?.trim() || "Ej specificerad";
          const projectId = item.project_id?.trim() || null;
          const apiKeyId = item.api_key_id?.trim() || null;
          const itemKey = `${projectId ?? "organization"}:${apiKeyId ?? "all-keys"}:${lineItem}`;
          const itemAggregate = lineItems.get(itemKey) ?? {
            lineItem,
            projectId,
            apiKeyId,
            costMicroUsd: 0,
          };
          itemAggregate.costMicroUsd += costMicroUsd;
          lineItems.set(itemKey, itemAggregate);
        }
        buckets.set(bucketKey, aggregate);
      }

      page = payload.has_more && payload.next_page ? payload.next_page : null;
      pageCount += 1;
    } while (page && pageCount < 10);

    const normalizedBuckets = [...buckets.values()]
      .sort((a, b) => a.start - b.start)
      .map((bucket) => ({
        startTime: new Date(bucket.start * 1000).toISOString(),
        endTime: new Date(bucket.end * 1000).toISOString(),
        costMicroUsd: bucket.costMicroUsd,
      }));
    return {
      ...result,
      status: "ok",
      totalCostMicroUsd: normalizedBuckets.reduce((sum, bucket) => sum + bucket.costMicroUsd, 0),
      buckets: normalizedBuckets,
      lineItems: [...lineItems.values()].sort((a, b) => b.costMicroUsd - a.costMicroUsd),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...result,
      status: "error",
      fetchedAt: new Date().toISOString(),
      error:
        error instanceof Error
          ? `OpenAI Costs API kunde inte nås (${error.name}).`
          : "OpenAI Costs API kunde inte nås.",
    };
  }
}
