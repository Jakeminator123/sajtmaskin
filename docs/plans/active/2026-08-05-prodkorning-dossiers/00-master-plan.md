---
status: active
owner: unassigned
topic: Fynd från live prod-körning 2026-08-05 kväll — dossier-kedjan är huvudspåret (trasigt MapLibre-byggblock, icke-deterministisk F3, package.json-omskrivning, undertryckt auto-repair). Plus pipeline-defekter och ägarens UX-punkter.
created: 2026-08-05
source: Observatörssession i prod-buildern (chatId 3a6c5472-9c70-4d1d-b7c8-181c4f85b160, projekt Nm-CccXtbDO7qYKkymVZ9) följd av full /logg-korsreferens (prod-Postgres, Vercel runtime, Fly). Rådata i gitignorerade .cursor/logg-internet/runs/2026-08-05_2029*.md.
---

# Master-plan: prod-körningens fynd, fokus dossiers

## TL;DR

En hel kundresa kördes i prod med Premium (`gpt-5.6-sol`): friprompt → sajt →
AI-chatt-uppföljning → F3-integrationsbygge. Sajten blev bra och chatten blev
till slut korrekt kodad mot `OPENAI_API_KEY` — men **ingen av de två
integrationsversionerna nådde användaren**. Den ena promotades med en trasig
karta (vårt eget dossier-fel), den andra underkändes på fyra blockerare varav
två var triviala importfel som auto-repair hade lagat om den inte varit
undertryckt.

Sessionens genomgående mönster: **kontrollerna hittar felen, åtgärden uteblir.**
Typkontrollen pekade exakt på kartbuggen och nedgraderades till advisory.
Preflight hittade hydreringsfelet och släppte igenom det. Verifieraren hittade
importfelen och auto-repair stängdes av just för att fynden var blockerande.

## Områdesfiler

| Fil | Innehåll | Läge |
|---|---|---|
| [`01-dossiers.md`](01-dossiers.md) | **Huvudspåret.** Dossier-kedjans fem defekter + kontraktsinsikter + åtgärdsordning | Diagnos klar, filverifierad |
| [`02-defekter-pipeline.md`](02-defekter-pipeline.md) | Det som gick dåligt utanför dossiers: OpenClaw auto-send, postcheck-racet, hydrering, klassificerare, telemetri | Diagnos klar |
| [`03-ux-onskemal.md`](03-ux-onskemal.md) | Ägarens klagomål och önskemål från sessionen, punkt för punkt (MVP-frys: detta ÄR den uttryckliga begäran-listan) | Insamlad, oprioriterad |

## Vad som bevisligen fungerade (rör ej)

| Fix | Bevis i sessionen |
|---|---|
| #778 browser-fel → error-log | Hydreringsfelet loggades som `preview:client-error` |
| #799/#813 preview-host | Omdeployad 17:18 UTC; Fly-loggens "HTML body still looks empty… accepting response" upphör efter deployen |
| #808/#813 promote-guard | `[quality-gate] Stale promote-guard revision: stamped fresh verdict…` i Vercel-loggen 18:58:01 |
| #815 verifier-budget | Verifieringen tog 60 s (> gamla 30 s-taket) och reparationen överlevde |
| F3-tomhetsgrinden | Vägrade grönmarkera passet som inte skrev filer |
| Infra | 0 runtime-felkluster i appen, DB-pool frisk, `retry_count: 0` på alla versioner |

## Prioritering (avstämd 2026-08-08)

Avstämd mot master 2026-08-08, efter #828, hela dossier-förenklingen
(etapp 1–4, pool 27 → 18; indexerad i
[`../../avklarat/README.md`](../../avklarat/README.md)) samt #839/#842.

1. ~~**Auto-repair-undertryckandet** (§ A4)~~ — **levererad i #842** (2026-08-08,
   `SM-024` i arkivet): den mekaniska prepassen körs nu i diagnosticOnly,
   LLM-repair och promotion förblir avstängda.
2. ~~**MapLibre-importen** (§ A1)~~ — **levererad i #828**, tillsammans med
   acceptansmatrisens täckning av soft-dossiers med filer och F3-planblockets
   förbud mot suggestion-only-rundor (§ A2:s åtgärdsspår a).
3. ~~**`package.json`-kontraktet i F3** (§ A3)~~ — **rotorsaken levererad i #839**
   (2026-08-08, `SM-023` i arkivet): deep-merge av `package.json` fanns redan;
   det som dödade versionen var den inaktuella verifier-domen, som nu
   stale-checkas mot mergade filer. Residual: åtgärdsspår (b), versionspinnar i
   dossier-manifestens `dependencies` — oprioriterad idé, ingen defekt.
4. **OpenClaw auto-send-effekten** ([`02-defekter-pipeline.md`](02-defekter-pipeline.md) § B1)
   — gör hela armerade autonomin obrukbar; orsaken är en beroendelista.
   Spårad som `SM-026` i backloggen.
5. **Typecheck-advisory-policyn** (§ A5) — ägarbeslut, inte bugg: ska
   `defect.kind: "compile"` i en verbatim dossier-fil få promotas?

Buggarna ska in i `BUG-SWARM-BACKLOG.md § Aktiv kö` när de tas — den här planen
är diagnos + åtgärdsförslag, inte buggkön.
