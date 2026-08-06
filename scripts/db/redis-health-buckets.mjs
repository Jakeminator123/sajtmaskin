// Redis-health inventory. Keep env-scoped suffixes aligned with the active
// producers in src/lib/data/redis.ts, src/lib/api/ai/brief-cache.ts and the
// preview session store.
const ENV_BUCKETS = [
  { label: "cache", suffix: "cache:*" },
  { label: "audit", suffix: "audit:*" },
  { label: "audit_list", suffix: "audit_list:*" },
  { label: "preview-session:session", suffix: "preview-session:session:*" },
  { label: "sandbox-preview:session (legacy)", suffix: "sandbox-preview:session:*" },
  { label: "prompt_handoff", suffix: "prompt_handoff:*" },
  { label: "brief:v1", suffix: "brief:v1:*" },
  { label: "health:probe", suffix: "health:probe:*" },
];

export function buildTrackedRedisHealthBuckets(keyPrefix) {
  return [
    ...ENV_BUCKETS.map(({ label, suffix }) => ({
      scope: "env",
      label,
      pattern: `${keyPrefix}${suffix}`,
    })),
    {
      // Rate-limit has its own environment-coded key namespace.
      scope: "global",
      label: "ratelimit (sajtmaskin, denna miljö)",
      pattern: `sajtmaskin:${keyPrefix.replace(/:$/, "")}:ratelimit:*`,
    },
  ];
}
