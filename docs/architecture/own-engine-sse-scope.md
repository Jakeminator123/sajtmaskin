# Own-engine SSE — scope (K-009, **stängd**)

**Status:** **[x] / N/A** i [`kritik-consolidated-open-items.md`](../plans/active/kritik-consolidated-open-items.md) från **2026-03-26** — ingen ytterligare SSE/stream-yta utanför W3-track planeras; ny sådan arbete ska **inte** återanvända K-009 utan ny plan/K-rad.

## Syfte (arkitekturreferens)

Avgrensa **W3-track** (builder egen motor) från hypotetiska **andra SSE-ytor** (admin, observability, m.m.) så att backlog inte blandas ihop med marknads-FAQ eller landningssidor.

| Yta | Innehåll |
|-----|----------|
| **Inom W3 (kanon)** | SSE/stream för nya chatten + follow-up på engine-routes; `own-engine-build-session`, pipeline, plan mode, contract gate; finalize med version + orchestration-snapshot; golden/kontraktstester; gräns mot `v0` i own-engine-trädet. |
| **Utanför W3 (K-009 ursprunglig fråga)** | Eventuella *nya* endpoints eller konsumenter som också skulle streama generation — **saknas i roadmap**. |
| **Uttryckligen inte K-009** | Copy/FAQ på Sajtmaskins publika marknadssajt. |

## Beslut och process

1. **Inget leveranskrav** för «SSE utanför W3» tills produkt öppnar ett konkret behov.
2. När ett behov finns: skriv kort plan (eller ny K-id), implementera, länka i `engine-status.md` — **återöppna inte** K-009; använd ny spårning.
3. W3-kontraktet förblir källa för «hur builder-stream fungerar» (`engine-status.md`, `v0-soft-deprecation.md`).

**Relaterat:** [`engine-status.md`](./engine-status.md) · [`MASTER-ALLT-KVAR.md`](../plans/active/MASTER-ALLT-KVAR.md) §3 · [`SAJTMASKIN-EXECUTION-PLAN.md`](../plans/active/SAJTMASKIN-EXECUTION-PLAN.md)
