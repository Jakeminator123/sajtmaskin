/**
 * Single source of truth for the route `maxDuration` ↔ manifest field mapping.
 *
 * `config/ai_models/manifest.json` `routeTimeouts` owns the per-route server
 * stream ceilings. Next.js requires `maxDuration` to be a statically-analyzable
 * literal in each route segment (you cannot `export const maxDuration = X.engine`),
 * so the literals are generated into the route files deterministically.
 *
 * Consumed by:
 *   - scripts/ai-models/sync-route-timeouts.mjs        (writes / checks the literals)
 *   - src/app/api/route-timeout-manifest-parity.test.ts (CI parity gate)
 *
 * Keep this the ONLY place the route list lives so codegen and the parity test
 * can never drift apart. `manifestField` points at
 * `config/ai_models/manifest.json` → `routeTimeouts[manifestField].default`.
 *
 * (A read-only mirror exists in backoffice/shared.py `ROUTE_TIMEOUT_DISPLAY` for
 * the drift-status panel only — it never writes, so a stale mirror just
 * mis-renders a read-only table; this module + the parity test stay the gate.)
 */
export const ROUTE_TIMEOUT_TARGETS = [
  {
    rel: "src/app/api/engine/chats/stream/route.ts",
    manifestField: "engineRouteMaxDurationSeconds",
  },
  {
    rel: "src/app/api/engine/chats/[chatId]/stream/route.ts",
    manifestField: "engineRouteMaxDurationSeconds",
  },
  {
    rel: "src/app/api/ai/chat/route.ts",
    manifestField: "assistRouteMaxDurationSeconds",
  },
  {
    rel: "src/app/api/ai/brief/route.ts",
    manifestField: "assistRouteMaxDurationSeconds",
  },
  {
    rel: "src/app/api/engine/chats/[chatId]/repair/route.ts",
    manifestField: "verifyRepairRouteMaxDurationSeconds",
  },
  {
    rel: "src/app/api/engine/chats/[chatId]/quality-gate/route.ts",
    manifestField: "verifyRepairRouteMaxDurationSeconds",
  },
];
