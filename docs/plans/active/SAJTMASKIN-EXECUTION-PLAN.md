# Sajtmaskin — execution plan (primär körplan)

**Syfte:** En **enda** övergripande lista över vad som återstår efter remediation-exit, i vilken ordning man typiskt arbetar, och var detaljer finns. Uppdatera denna fil när en K-rad stängs eller prioritering ändras tydligt.

**Kanonisk K-tabell (`[ ]` / `[x]`):** [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md)  
**Djup berättelse + acceptans:** [`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md)  
**Handoff-/beslutsdokument (arkiverade 2026-03-26):** [`../avklarat/2026-03-handoff-doc-bundle/`](../avklarat/2026-03-handoff-doc-bundle/)

**Verifiering efter kod:** `npm run typecheck` && `npx vitest run`

---

## Öppna K-spår (implementation)

| ID | Kort fokus | Detalj |
|----|------------|--------|
| **K-018** | Preview/sandbox/`iframe` ≈ `npm run dev` för **genererad** sajt; UX shim↔sandbox; session/VM; Fas 3-adapters | [`queue/PLAN-PREVIEW-SANDBOX.md`](./queue/PLAN-PREVIEW-SANDBOX.md), [`INPUT_GPT.txt`](../../../INPUT_GPT.txt) §7–14, [`preview-fidelity-tiers.md`](../../architecture/preview-fidelity-tiers.md), MASTER §2 |
| **K-019** | Orchestration snapshot: merge-policy, ev. UI, ev. sync create | [`queue/PLAN-K019-PROMPT-SNAPSHOT.md`](./queue/PLAN-K019-PROMPT-SNAPSHOT.md), `orchestration-snapshot.ts` |
| **K-007** | Deploy: policy **oförändrad** tills vidare (beslut i arkiv); ev. tydligare copy kring blockering | `version-file-integrity.ts`, [`deploy-precheck.md`](../../architecture/deploy-precheck.md) |
| **K-009** | Own-engine SSE **scope** = byggarens loop; inte marknads-FAQ; rad `[ ]` tills leverans eller medvetet N/A | MASTER §3, arkiverad BESLUT §2 |

**Rekommendation:** **ett huvudspår per PR** (minimera merge-konflikt).

---

## Hög konfliktrisk (undvik samma PR som tung preview-refaktor)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`
- `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409

---

## Plan 17 — återstående

- **WS-5:** stor JSON / `.gitignore`-scan vid behov, `research/`-policy (se [`research/README.md`](../../../research/README.md)); `docs/old` redan flyttad.
- **WS-4 (deferred):** `ENV.md` + `env-policy` — **efter** K-018/K-019-stabilitet (dokumentera sanning först).
- **WS-2 (deferred):** v0 SDK / `V0_API_KEY` — **ägarbeslut** separat spår.

Kryss: [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md)

---

## Övriga pekare

- FAQ / terminologi: [`queue/FRAGOR-SVAR-FAQ.md`](./queue/FRAGOR-SVAR-FAQ.md)
- Plan 17 öppet (del): [`queue/PLAN-REPO-SEPARATION-OPEN.md`](./queue/PLAN-REPO-SEPARATION-OPEN.md)
- Progress / remediation 100%: [`external-review-remediation-progress.md`](./external-review-remediation-progress.md)
- Hub «kvar efter exit»: [`REMAINING-WORK.md`](./REMAINING-WORK.md)

---

## Historik

| Datum | Vad |
|-------|-----|
| 2026-03-26 | Skapad; handoff-filer flyttade till `avklarat/2026-03-handoff-doc-bundle/`. |
