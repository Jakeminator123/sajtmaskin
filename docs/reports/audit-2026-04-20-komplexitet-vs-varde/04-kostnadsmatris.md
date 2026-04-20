# 04 — Kostnadsmatris (samlad ROI-tabell)

> Sammanställning av **alla 41 åtgärder** från `01-buggar.md`, `02-forbattringar.md` och `03-konsolidering-pipeline.md`, sorterade på **ROI** (värde / kostnad).

---

## Legend

- **Typ:** `B` = bugg, `F` = förbättring, `K` = konsolidering
- **Svårighet:** `enkel` (≤2h) / `medel` (½–2 dagar) / `stor` (3+ dagar)
- **Tid:** Utvecklartid (rough estimate)
- **Mån-kostnad:** Löpande kostnadsdelta per månad (negativ = besparing)
- **ROI:** Subjektiv 1–10 (10 = absolut måste)

---

## TIER S — gör imorgon (ROI 9–10)

| # | Åtgärd | Typ | Svårighet | Tid | Mån-kostnad | ROI | Källa |
|---|--------|-----|-----------|-----|-------------|-----|-------|
| 1 | `prefer-const` lint-fix | B | enkel | 2 min | 0 | 10 | `01-buggar.md` §1.1 |
| 2 | `.gitignore` Turbopack-cache | B | enkel | 5 min | 0 | 10 | `01-buggar.md` §1.2 |
| 3 | Manifest-schema sync (`designPreview/integrationsBuild`) | B | enkel | 30 min | 0 | 9 | `01-buggar.md` §1.6 |
| 4 | ESLint `--cache` flag | F | enkel | 1 h | 0 | 9 | `02-forbattringar.md` §1.2 |
| 5 | `.editorconfig` | F | enkel | 15 min | 0 | 9 | `02-forbattringar.md` §1.8 |
| 6 | P28 7 pre-existing failures | B | medel | ½ dag | 0 | 9 | `01-buggar.md` §2.1 |
| 7 | Aktivera `build` i F2 quality gate | F+B | enkel | 1 h | +5–10 USD | 9 | `01-buggar.md` §1.5 + `02-forbattringar.md` §1.4 |

**Tier S-summa:** ~1 dag arbete, +5–10 USD/mån löpande, master grön.

---

## TIER A — nästa sprint (ROI 7–8)

| # | Åtgärd | Typ | Svårighet | Tid | Mån-kostnad | ROI | Källa |
|---|--------|-----|-----------|-----|-------------|-----|-------|
| 8 | `tsc --build` projektreferenser | F | enkel | 1 h | 0 | 8 | `02-forbattringar.md` §1.3 |
| 9 | Pre-commit ÅÄÖ-hook | B | enkel | 30 min | 0 | 8 | `01-buggar.md` §1.3 |
| 10 | Filnamn `övergipande` typo | B | enkel | 5 min | 0 | 8 | `01-buggar.md` §1.4 |
| 11 | Slå ihop `predev`/`prebuild` | F+K | enkel | 30 min | 0 | 8 | `02-forbattringar.md` §1.5 |
| 12 | P50 prompt → preview metric | F | medel | 2 dagar | 0 | 8 | `02-forbattringar.md` §2.1 |
| 13 | Slå ihop `pre_vm_typecheck` + `validate_syntax` | K | medel | 2 dagar | -2–3 USD | 8 | `03-konsolidering-pipeline.md` §2.1 |
| 14 | Konsolidera `/api/v0/*` ↔ `/api/engine/*` | K | stor | 1 vecka | 0 | 8 | `03-konsolidering-pipeline.md` §3.4 |
| 15 | P22b stream-route follow-up | B | medel | ½ dag | 0 | 7 | `01-buggar.md` §2.2 |
| 16 | Inventera early-stop-flaggor | K | enkel | 2 h | 0 | 7 | `03-konsolidering-pipeline.md` §1.2 |
| 17 | Brief som optional (A/B-test) | K | medel | 2 dagar | -5–10 USD | 7 | `03-konsolidering-pipeline.md` §3.5 |
| 18 | FEATURES-flagga rensning | K | enkel-medel | ½ dag | 0 | 7 | `03-konsolidering-pipeline.md` §3.7 |

**Tier A-summa:** ~2 veckor arbete, -10 USD/mån löpande, pipeline -1 fas, API-yta -50 %.

---

## TIER B — när tid finns (ROI 5–6)

| # | Åtgärd | Typ | Svårighet | Tid | Mån-kostnad | ROI | Källa |
|---|--------|-----|-----------|-----|-------------|-----|-------|
| 19 | Prometheus/OTel export | F | enkel | 2 h | +5 USD | 6 | `02-forbattringar.md` §1.1 |
| 20 | Brief-cache (Redis) | F | medel | ½ dag | -2 USD | 6 | `02-forbattringar.md` §2.7 |
| 21 | `data/dossiers/` `.gitignore` | F | enkel | 30 min | 0 | 6 | `02-forbattringar.md` §1.6 |
| 22 | Auto-archive avklarade planer | F | enkel | 1 h | 0 | 6 | `02-forbattringar.md` §1.7 |
| 23 | Konsolidera `promptAssist.allowed` | F | medel | ½ dag | 0 | 6 | `02-forbattringar.md` §2.3 |
| 24 | Eval-suite som CI-gate | F | medel | 1 dag | +20–40 USD | 6 | `02-forbattringar.md` §2.4 |
| 25 | Strukturerad logging (JSON) | F | medel | 2 dagar | 0 | 6 | `02-forbattringar.md` §2.5 |
| 26 | Engelska som primärspråk i docs | F | medel | 2 dagar | 0 | 6 | `02-forbattringar.md` §2.10 |
| 27 | Konsolidera 5 cross-file-import-fixers | K | medel | 1 dag | 0 | 6 | `03-konsolidering-pipeline.md` §2.2 |
| 28 | Mekaniska autofixers → deklarativ tabell | K | medel | 1 dag | 0 | 6 | `03-konsolidering-pipeline.md` §2.3 |
| 29 | Förenkla `BuildSpec` till presets | K | medel | 1 dag | 0 | 6 | `03-konsolidering-pipeline.md` §3.6 |
| 30 | Repair-loop hård gräns 90s | B | stor | 2 dagar | -2–5 USD | 6 | `01-buggar.md` §3.2 |
| 31 | Komponenttester (builder) | F | medel | 3 dagar | 0 | 5 | `02-forbattringar.md` §2.8 |

**Tier B-summa:** ~3 veckor arbete, +20 USD/mån löpande.

---

## TIER C — strategiska (ROI 4–5)

| # | Åtgärd | Typ | Svårighet | Tid | Mån-kostnad | ROI | Källa |
|---|--------|-----|-----------|-----|-------------|-----|-------|
| 32 | Slå ihop server-verify + quality-gate + accept-repair | K | stor | 1 vecka | 0 | 5 | `03-konsolidering-pipeline.md` §3.2 |
| 33 | Ta bort verifier-pass (eller asynkron) | K | stor | ½ vecka | -10–15 USD | 5 | `03-konsolidering-pipeline.md` §3.1 |
| 34 | Ta bort partial-file-repair | K | medel | 4 h | -2–3 USD | 5 | `03-konsolidering-pipeline.md` §3.3 |
| 35 | Storybook / Ladle | F | medel | 1 dag | 0 | 5 | `02-forbattringar.md` §2.9 |
| 36 | Switch `pg` → Neon serverless | F | medel | 1 dag | 0 | 4 | `02-forbattringar.md` §2.2 |
| 37 | SSE → WebSocket | F | medel | 3 dagar | 0 | 4 | `02-forbattringar.md` §2.6 |

**Tier C-summa:** ~3 veckor, -10–18 USD/mån, pipeline blir betydligt enklare.

---

## TIER D — moonshots (ROI 3–9, men hög insats)

| # | Åtgärd | Typ | Svårighet | Tid | Mån-kostnad | ROI | Källa |
|---|--------|-----|-----------|-----|-------------|-----|-------|
| 38 | **Migrera till StackBlitz WebContainers** | F | stor | **2–3 veckor** | -60 USD (Fly bort) | **9** | `02-forbattringar.md` §3.1 |
| 39 | Live-preview cold-start palliativ (warm pool) | B | stor | 3–5 dagar | -10–20 USD | 7 | `01-buggar.md` §3.1 |
| 40 | Egen finetuning av OSS-modell | F | stor | 2 mån | -50 USD | 4 | `02-forbattringar.md` §3.2 |
| 41 | Visual-QA med vision-LLM | F | stor | 3 veckor | +30 USD | 4 | `02-forbattringar.md` §3.4 |
| 42 | Runtime-loadable scaffolds | F | stor | 2 veckor | 0 | 4 | `02-forbattringar.md` §3.3 |
| 43 | Multi-tenant / vita-label | F | stor | 1 mån | 0 | 3 | `02-forbattringar.md` §3.5 |

> **#38 är trots sin storlek den enskilt högsta-värdet-åtgärden i hela rapporten.** Det är den som tar produkten från 6.5 → 8 i unbiased-betyg.

---

## Sammanställd kostnadsbudget

### Om man kör allt

| Tier | Antal | Tid | Löpande/mån |
|------|-------|-----|-------------|
| S | 7 | ~1 dag | +5–10 USD |
| A | 11 | ~2 veckor | -10 USD |
| B | 13 | ~3 veckor | +20 USD |
| C | 6 | ~3 veckor | -10–18 USD |
| D | 6 | ~3 mån | -90 USD (om #38 + #40) |
| **Summa** | **43** | **~5 mansmånader** | **netto -65 USD/mån** |

### Om man kör bara Tier S + A (rekommenderat MVP)

| Tier | Antal | Tid | Löpande/mån |
|------|-------|-----|-------------|
| S+A | 18 | ~3 veckor | netto 0–5 USD |

**Effekt:** Master grön, pipeline -1 fas, API-yta -50%, 4–6 P28-failures borta.

### Om man kör S + A + #38 (rekommenderat för world-class)

| Tier | Antal | Tid | Löpande/mån |
|------|-------|-----|-------------|
| S+A+#38 | 19 | ~6 veckor | -50 USD/mån |

**Effekt:** Allt ovan + boot-tid 2–5 min → 5 sek (enskilt största user-experience-lyftet).

---

## Vad som hänger ihop (åtgärds-grafer)

- **#13** (slå ihop typecheck-stegen) **+ #16** (early-stop-inventering) **+ #27** (cross-file-import-fixers) bör köras tillsammans — alla rör autofix-pipelinen.
- **#14** (`/api/v0/*` ↔ `/api/engine/*`) **fixar #15 + 4 av 7 P28-failures** automatiskt.
- **#33** (verifier bort) **+ #34** (partial-file-repair bort) **kräver** #19 (telemetri) först för datadriven beslutsbas.
- **#38** (WebContainers) **gör #39** (warm pool) onödig — välj bara en.
- **#26** (engelska docs) **möjliggör** #43 (multi-tenant) eftersom externa bidrag krävs.

---

## Kostnadsberäkningar — antaganden

- **Utvecklartid:** 1 dag = 8 h fokustid. "Stor" = 3+ dagar = 24+ h.
- **LLM-kostnad:** GPT-5.4 ~$0.005/1k input, ~$0.015/1k output. En verifier-pass ~3000 tokens in + 500 ut = ~$0.024. Vid 1000 genereringar/mån = $24/mån enbart för verifier.
- **Fly-VM:** Aktuell `performance-2x` `arn`-region: ~$0.009/h × 730 h = $6.5/mån för CPU + storage = ~$60–70/mån fully loaded.
- **WebContainers Enterprise:** $99/mån grundavtal eller free tier för låg volym.

Faktiska kostnader varierar med användarvolym. Siffrorna ovan antar ~1000 genereringar/månad.

---

## Vad denna fil INTE täcker

- **Beskrivningar och manualer per åtgärd** — finns i `01-buggar.md`, `02-forbattringar.md`, `03-konsolidering-pipeline.md`
- **Föreslagen körordning** — se [`05-korplan.md`](./05-korplan.md)
