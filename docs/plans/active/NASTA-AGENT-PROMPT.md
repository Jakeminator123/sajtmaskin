# Prompt till nästa agent + arbetsuppskattning

**Repo:** Sajtmaskin (Next.js builder, own-engine, sandbox preview).  
**Branch:** `master` — kör `git pull origin master` före du börjar.

---

## Kopiera detta till nästa agent (hela rutan)

```
Du tar över utvecklingen av Sajtmaskin efter en dokumenterad handoff. Din uppgift är att driva det som fortfarande är öppet i backlog utan att duplicera redan levererad remediation (W1–W5 är klara).

LEVERANSREGLER
1) Läs först (i denna ordning):
   - docs/plans/active/AGENT-HANDOFF-RESTERANDE.md — kort översikt över öppet arbete
   - docs/plans/active/kritik-consolidated-open-items.md — kanonisk K-tabell [ ] / [x]
   - docs/plans/active/MASTER-ALLT-KVAR.md — detalj, § 0 fidelity, K-018 § 2
2) Välj ETT huvudspår per batch/PR om möjligt (minska konflikt i registry/deploy/preview):
   - K-018 (preview/sandbox/iframe) — störst användarimpact ELLER
   - K-019 (orchestration merge/UI) ELLER
   - K-007 (deploy-policy) ELLER
   - K-009 (SSE-scope) ELLER Plan 17 WS-5 (städ: docs/old, research-policy) — lägre risk
3) Hög konfliktrisk — koordinera eller undvik samma PR som andra:
   src/lib/integrations/registry.ts, src/lib/gen/detect-integrations.ts,
   config/env-policy.json, deploy-API, useBuilderDeployActions, builder-copy kring env/409.
4) Efter kodändringar: npm run typecheck && npx vitest run (och lint vid behov).
5) Uppdatera kritik-tabellen och ev. MASTER när en K-rad stängs; uppdatera 17-repo-separation när Plan 17-kryss ändras.

VIKTIGA FILER (detalj)
- K-018: docs/plans/active/queue/PLAN-PREVIEW-SANDBOX.md, INPUT_GPT.txt § 7–14, docs/architecture/preview-and-sandbox-flow.md
- K-019: docs/plans/active/queue/PLAN-K019-PROMPT-SNAPSHOT.md, orchestration-snapshot i src/lib/gen/
- Plan 17: docs/plans/active/17-repo-separation-and-independence.md — läs «Hur du ska läsa»; nyare MASTER/kritik/engine-status kan överköra äldre formuleringar

Plan 17-filen är en audit/roadmap från STOR_MIGRATION — använd den som referens + kryss, inte som enda sanning om prioritering.

MÅL
- Flytta minst en öppen K-rad mot [x] med datum, eller dokumentera tydlig N/A med motivering i kritik-tabellen.
- Committa med tydliga meddelanden; pusha inte utan gröna typecheck+vitest.
```

---

## Arbetsuppskattning (ungefär, en utvecklare som känner repot)

Siffrorna är **person-dagar** av fokuserat arbete, **inte** kalender om ni kör parallella spår. **Osäkerhet är hög** — K-018 beror på plattform (sandbox/VM) och produktbeslut.

| Spår | Storlek | Uppskattning | Kommentar |
|------|---------|----------------|-----------|
| **K-018** | Stor | **~10–40+ pd** | Redan delmoment (env merge, build-status, session store, shim-fallback). **Kvar:** sann VM-återanvändning, Fas 3-adapters, tydlig shim↔runtime-UX, ev. fler integrationer — dominerar återstoden. |
| **K-019** | Liten–medel | **~2–8 pd** | Fas 1 kod finns; **kvar:** merge-policy, ev. UI, sync create-path — mer avrundning än grönt fält. |
| **K-007** | Liten–medel | **~2–10 pd** | Strikt JSON-delmoment finns. **Kvar:** produktbeslut om auto-fix / validering före deploy + ev. mer kod. |
| **K-009** | Medel | **~3–15 pd** | Först **spika scope** (1–2 pd), sedan ev. SSE/own-engine-arbete beroende på beslut. |
| **Plan 17 WS-5** | Medel (uppdelat) | **~5–20 pd** | `docs/old/` städ = **många små PR** om ni följer «inventering före radering». `research/`-policy = doc. Stora JSON: ofta låg löpande kostnad tills nya filer tillkommer. |
| **Plan 17 deferred WS-2/WS-4** | Valfri / låg prio | **~1–5 pd** doc, **veckor** om v0/env ska kodas om | Ägarbeslut: v0 **medvetet separat**; ENV **dokumentera sanning först**. |

**Grovt totalspann om allt ska «ner till botten» i serie:** ungefär **~4–12 veckors** fokuserad utveckling för en person, där **K-018** tar lejonparten. Med **parallella agenter** på separata spår (K-019 + WS-5 doc, eller K-007 policy) kan **kalendertiden** kortas, men **inte** utan merge-risk i delade filer.

**«MVP för att kalla backlog acceptabel»** (subjektivt): ofta **K-018** till en stabil primär sandbox-preview + tydlig fallback, plus **K-019** stängd eller N/A — ofta **~3–8 veckor** beroende på VM/adapters.

---

## Underhåll

Uppdatera **datum** i denna fil när prioritering eller omfattning ändras tydligt. Pekare till samma innehåll: [`AGENT-HANDOFF-RESTERANDE.md`](./AGENT-HANDOFF-RESTERANDE.md).
