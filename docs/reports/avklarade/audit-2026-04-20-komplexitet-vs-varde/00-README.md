# Audit 2026-04-20 — Komplexitet vs värde

**Författare:** Cursor-agent (ask-mode-utvärdering)
**Scope:** Hela repot — fokus på pipeline-konsolidering, buggar och förbättringar
**Bedömningsbetyg (unbiased):** **6.5 / 10** mot world-class (Lovable, Bolt.new, v0, Replit Agent)
**Sammanvägd potential efter rapportens åtgärder:** **8.0–8.5 / 10**

---

## Vad denna mapp är

Detta är en **engångsrapport** — inte en plan i `docs/plans/active/`. Rapporten är skriven av en kodgranskande agent som gick igenom hela kodbasen, dokumentationen och pipelinen för att identifiera:

1. **Buggar** som finns idag (eller är pre-existing på master)
2. **Förbättringar** som skulle höja kvaliteten på produkten
3. **Pipeline-konsolidering** — vad i den 14-stegs codegen-kedjan som kan tas bort, slås ihop eller förenklas utan kvalitetsförlust

Allt är försett med:
- **Svårighetsgrad:** `enkel` (≤2h) / `medel` (½–2 dagar) / `stor` (3+ dagar)
- **Kostnadsestimat:** utvecklartid + ev. löpande infra/API-kostnad
- **Konkreta filsökvägar** så det går att exekvera
- **Manual/körplan** per åtgärd

---

## Hur du läser den

| Fil | Syfte | Rekommenderad läsordning |
|-----|-------|--------------------------|
| [`00-README.md`](./00-README.md) | Detta — orientering + övergripande slutsatser | 1 |
| [`01-buggar.md`](./01-buggar.md) | Alla identifierade buggar, indelade `enkel/medel/stor` | 2 (om du vill släcka bränder först) |
| [`02-forbattringar.md`](./02-forbattringar.md) | Alla identifierade förbättringar, indelade `enkel/medel/stor` | 4 |
| [`03-konsolidering-pipeline.md`](./03-konsolidering-pipeline.md) | **Huvudfokus enligt request:** vad i pipelinen som kan tas bort/förenklas | 3 (läs efter buggar — det är här största vinsten finns) |
| [`04-kostnadsmatris.md`](./04-kostnadsmatris.md) | Sammanställd tabell: ROI-sortering av allt | 5 |
| [`05-korplan.md`](./05-korplan.md) | Föreslagen exekveringsordning i tre vågor | 6 |

> **Tips:** Om du har en timme — läs `00`, `03` (konsolidering) och `05` (körplan). Det är där 80% av värdet ligger.

---

## Top-10 högsta-ROI-åtgärderna (sneak peek)

Sorterade på (värde / kostnad). Detaljer i [`04-kostnadsmatris.md`](./04-kostnadsmatris.md).

| # | Åtgärd | Typ | Kostnad | Värde | Källa | Status |
|---|--------|-----|---------|-------|-------|--------|
| 1 | Fixa `prefer-const` lint i `font-import-fixer.ts:45` | Bugg-enkel | 2 min | Master grön | `01-buggar.md` §1.1 | ✅ DONE |
| 2 | Lägg `.next/dev/cache/turbopack/**` i `.gitignore` | Bugg-enkel | 5 min | Hundratals untracked filer borta | `01-buggar.md` §1.2 | ✅ DONE |
| 3 | Slå ihop `pre_vm_typecheck` med `validate_syntax` | Konsolidering | 2 timmar | Ett stadium mindre i pipelinen | `03-konsolidering-pipeline.md` §2.1 | ✅ DONE (Wave 3) |
| 4 | Fasa ut `verifier-pass` (hybrid: deterministiska guardrails + LLM-granskning) | Konsolidering | 3 timmar | Mindre verifierkostnad om LLM-lagret kan tas bort utan kvalitetstapp | `03-konsolidering-pipeline.md` §3.1 | ⏸ DEFER (kräver A/B-data; W2 går motsatt riktning) |
| 5 | Slå ihop `/api/v0/*` ↔ `/api/engine/*` (compat-routes) | Konsolidering | 1 dag | -50 % API-yta | `03-konsolidering-pipeline.md` §3.4 | ✅ DONE (P29: chat-ytan borta, Class C beh. permanent) |
| 6 | Verifiera F2 quality gate-policy | Förbättring-enkel | 1 timme | F2 är numera medvetet typecheck-only; build/lint hör till warm-cache/F3 | `01-buggar.md` §1.5 / `02-forbattringar.md` §1.4 | ✅ SUPERSEDED 2026-04-23 |
| 7 | Fixa P28-spåret (7 pre-existing testfailures) | Bugg-medel | ½ dag | Master grön | `01-buggar.md` §2.1 | ✅ DONE (alla 7 löstes organiskt) |
| 8 | Migrera live-preview från Fly-VM → StackBlitz WebContainers | Förbättring-stor | 2–3 veckor | Boot 5 min → 5 sek (50–60×) | `02-forbattringar.md` §3.1 | ⏸ Strategiskt nästa steg |
| 9 | Konsolidera 5 cross-file-import-fixers → 1 (med telemetri) | Konsolidering | 1 dag | -4 fixers, lättare att underhålla | `03-konsolidering-pipeline.md` §2.2 | ⏸ DEFER (audit säger telemetri först) |
| 10 | Engelska som primärspråk i docs (svenska som sekundär) | Förbättring-medel | 2 dagar | Sänker bus factor från 1 → flera | `02-forbattringar.md` §2.10 | ⏸ Politiskt val |

**Top-10 progress sedan rapport-datum (2026-04-20):** 6 av 10 ✅ DONE samma dag. 1 strategisk satsning (#8 WebContainers) återstår som single-largest ROI-vinst. 3 är medvetet deferrerade per linje-resonemang (kräver data eller är politik).

---

## Sammanvägda kostnader

| Kategori | Antal poster | Total tid (utvecklare) | Löpande kostnad/månad |
|----------|--------------|-----------------------|----------------------|
| Buggar — enkla | 6 | ~3 timmar | 0 |
| Buggar — medel | 4 | ~2 dagar | 0 |
| Buggar — stora | 2 | ~5 dagar | 0 |
| Förbättringar — enkla | 8 | ~1 dag | 0 |
| Förbättringar — medel | 7 | ~2 veckor | 0 → +20 USD/mån (CI) |
| Förbättringar — stora | 5 | ~3 månader | -40 USD/mån (om Fly slopas) |
| Pipeline-konsolidering | 9 | ~3 veckor | -50 USD/mån (färre LLM-anrop) |
| **TOTALT om allt körs** | **41** | **~5 mansmånader** | **netto −70 USD/mån** |

> **Praktiskt:** En realistisk MVP-version av rapporten (top 15 åtgärder) tar ~3 veckor och ger 80 % av kvalitetslyftet.

---

## Generell metodik

Rapporten utgår från:

- **Faktiskt observerad kod** under `src/lib/gen/`, `src/lib/own-engine/`, `src/lib/providers/own-engine/`, `preview-host/`, `config/ai_models/manifest.json`
- **`docs/plans/active/P27-validator.md` blocking_note** (auktoritativ källa till pre-existing failures)
- **`docs/plans/active/P28-pre-existing-cleanup.md`** (samma failures, bekräftade som pre-existing genom git-stash mot HEAD `8b36a5a88`)
- **`docs/architecture/glossary.md`** (terminologistruktur)
- **`docs/architecture/fas2-orchestration-and-build.md`** (kanonisk pipeline-källa)
- **`docs/plans/active/Kvarvarande-uppgifter.md`** (öppna kända punkter)

Alla rekommendationer pekar mot konkreta filer och rader. Inga synliga lösningar är "magi" — varje förslag har en angiven mekanism.

---

## Nästa steg för dig

1. Läs [`05-korplan.md`](./05-korplan.md) för att förstå rekommenderad ordning.
2. Bestäm dig för **scope** — full version eller MVP (top-15)?
3. Skapa motsvarande `P29..Pxx` plan-filer i `docs/plans/active/` för det du vill exekvera (rapporten är inte en plan i sig).
4. Lämna eller arkivera denna mapp när åtgärderna är genomförda — flytta då till `docs/reports/avklarade/`.
