# STATUS-04 AUDIT — orkestrator-granskning av plan-04-leveransen

**Datum:** 2026-04-23
**Granskare:** orkestrator-agent (denna chatt)
**Granskat:** [`fixer-matrix.md`](./fixer-matrix.md), [`STATUS-04-fixer-surface.md`](./STATUS-04-fixer-surface.md)
**Granskningsmetod:** stickprov + cross-check mot kod + glob-scan av alla `fix*/run*/check*/validate*/repair*` exporter i `src/lib/gen/`.

## Sammanfattning

Plan-04-leveransen (Codex 5.3 High agent) är **välstrukturerad och korrekt så långt den når**, men matrisen **missar en hel kategori av fixers** — `suspense/rules/` (13 stream-time line-rules) — och de flesta `security/`-checkarna. Faktisk fixer-yta är **~75 rader, inte 59**.

Verdict per agentens påståenden:

| Påstående | Status |
|---|---|
| 49 entries i `FIXER_REGISTRY` | ✓ Verifierat exakt (`FIXER_REGISTRY_SIZE` = 49 i `fixer-registry.ts:611`) |
| 10 aktiva pass utanför registry | ⚠️ Underräkning — verkligt antal är ~25 |
| Merge-kandidat: react-import-trio | ✓ Verifierat (alla tre delar `rules/react-import-consolidated.ts`, även dokumenterat i registry-noter rad 128-131) |
| Merge-kandidat: tre `runLlmFixer`-gates | ✓ Verifierat (`llm-syntax-fixer`, `llm-verifier-fixer`, `llm-server-repair` lever i tre olika filer men delar motor) |
| Merge-kandidat: 4 preflight-validatorer | ✓ Inte cross-checkat i detalj men struktur stämmer |
| Remove-kandidat: `llm-partial-file-repair` | ✓ Bekräftad i registry rad 538-548, telemetri-blockad |
| 5 tombstones | ✓ Verifierade — alla är 1-rads kommentarer, noll beteendeändring, ingen rör plan-02-territorium |

## Vad agenten missade

### A. Hela `src/lib/gen/suspense/rules/` — 13 stream-time line-rules

Dessa är `SuspenseRule`-objekt som körs **i streaming-fasen** (innan filerna ens finns färdiga), via `createDefaultRules()` i `src/lib/gen/suspense/default-rules.ts`. De är en helt egen lane — varken mekaniska autofixers eller LLM-repair, utan **per-line transformer**.

| # | Rule | Path | Triggerpunkt |
|---|---|---|---|
| 60 | `shadcn-import-fix` | `suspense/rules/shadcn-import-fix.ts` | `createDefaultRules()` → stream transform |
| 61 | `lucide-icon-fix` | `suspense/rules/lucide-icon-fix.ts` | dito |
| 62 | `radix-import-fix` | `suspense/rules/radix-import-fix.ts` | dito |
| 63 | `url-alias-expand` | `suspense/rules/url-alias-expand.ts` | dito |
| 64 | `type-annotation-fix` | `suspense/rules/type-annotation-fix.ts` | dito |
| 65 | `tailwind-class-fix` | `suspense/rules/tailwind-class-fix.ts` | dito |
| 66 | `duplicate-import-fix` | `suspense/rules/duplicate-import-fix.ts` | dito (stateful, per-stream) |
| 67 | `missing-export-fix` | `suspense/rules/missing-export-fix.ts` | dito |
| 68 | `next-og-strip` | `suspense/rules/next-og-strip.ts` | dito |
| 69 | `image-src-fix` | `suspense/rules/image-src-fix.ts` | dito |
| 70 | `forbidden-import-strip` | `suspense/rules/forbidden-import-strip.ts` | dito |
| 71 | `jsx-attribute-fix` | `suspense/rules/jsx-attribute-fix.ts` | dito |
| 72 | `relative-import-fix` | `suspense/rules/relative-import-fix.ts` | dito |

**Implikation för plan 05:** Suspense-rules är **inte** kandidater för "single fixer entrypoint" — de är en separat designad lane (per-line, streaming, stateless utom där annat anges). De bör dokumenteras som **egen lane** i plan 05 eller explicit lämnas utanför fixer-konsolideringen.

**Implikation för plan 09:** Många av dessa har överlapp med autofix-fixers (lucide-icon-fix vs lucide-image-fixer/lucide-link-fixer; shadcn-import-fix vs import-validator; duplicate-import-fix vs duplicate-import-binding-fixer). Värd egen analys för plan 09: vilka är defensiva dubletter och vilka fångar verkligen olika fall?

### B. Security-checks

| # | Check | Path | Anmärkning |
|---|---|---|---|
| 73 | `runSecurityChecks` | `src/lib/gen/security/run-security-checks.ts` | Kallas från `pipeline.ts` (line 41 import) — wraps de tre nedan |
| 74 | `sanitizeOutput` | `src/lib/gen/security/output-sanitizer.ts` | sub-pass av #73 |
| 75 | `checkPromptInjection` | `src/lib/gen/security/prompt-guard.ts` | sub-pass av #73 |
| 76 | `path-validator` | `src/lib/gen/security/path-validator.ts` | callsite okontrollerad i denna granskning |

Alla är validators (read-only), kan emit warnings/blocks. Bör vara `keep` men explicit dokumenterade.

### C. Conditional fixers

| # | Pass | Path | Anmärkning |
|---|---|---|---|
| 77 | `analyzeVisualQuality` | `src/lib/gen/verify/visual-qa.ts` | Bakom flagga `SAJTMASKIN_VISUAL_QA=1`. Inaktiv default. |

Bör vara med som **conditional**-rad i matrisen så plan 09 vet att flaggan finns + kan väljas att aktivera/avveckla.

## Korrigeringar / Nya kandidater

### Nya merge-kandidater (utöver agentens 4)

5. **Lucide-fixers cross-lane:** `suspense/rules/lucide-icon-fix.ts` (rewrite unknown → Circle) + autofix `lucide-image-fixer` + autofix `lucide-link-fixer` — överlappar i intent. Plan 05 bör avgöra om suspense-laget gör autofix-laget överflödigt eller tvärtom.

6. **Duplicate-import dubblering:** `suspense/rules/duplicate-import-fix.ts` (stream-time, line-baserad) + autofix `duplicate-import-binding-fixer` + autofix `duplicate-import-local-type-collision-fixer`. Tre fixers för samma allmänna failure-mode.

7. **Shadcn-import dubblering:** `suspense/rules/shadcn-import-fix.ts` + autofix `import-validator` (som är `mechanical-shadcn`-kategorin). Sannolikt redundans.

### Nya unknowns

5. **`scaffold-manifest-validation.ts`** — agenten missade. Validator för scaffold-manifest. Påverkar fas 1, inte fas 2/3 — ev. utanför scope men bör nämnas.

### Korrigerad totalsumma

| Lager | Räkning |
|---|---|
| FIXER_REGISTRY entries | 49 |
| Aktiva pass utanför registry (agentens räkning) | 10 |
| Suspense-rules (missade) | 13 |
| Security-checks (missade) | 4 |
| Conditional/feature-flagged (missad) | 1 |
| **Totalt verkligt** | **~77** |

## Bedömning

**Plan-04 som leverans:** användbar bas, men **inte komplett**. Plan-05-agenten skulle ha tagit fel beslut om "single fixer entrypoint" eftersom hen hade missat att suspense-rules är en hel separat lane som inte hör hemma i samma entrypoint.

**Rekommendation till plan 05:**
- Behandla `autofix/`-lanen och `suspense/rules/`-lanen som **separata** men med konsoliderade entrypoints inom varje lane.
- Adressera överlappen (lucide, duplicate-import, shadcn) **innan** entrypoint-flytten — inte efter.

**Rekommendation till plan 09:**
- Använd denna audit + agentens originalmatris som bas.
- Lägg till de 14 missade raderna i `remove`/`unknown`/`keep`-utvärderingen.

**Plan-04 bör inte revideras retroaktivt** — det skulle försena wave 2. Istället: plan-05- och plan-09-prompterna ska explicit referera till **både** `fixer-matrix.md` **och** `STATUS-04-AUDIT.md` så agenterna får hela bilden.

## Notering om CORB-fyndet från smoke

Run 1 av plan 01 visade `CORB blocked Unsplash photo` — det är en **bild-strategi-bug** som antagligen ligger i:
- `suspense/rules/image-src-fix.ts` (stream-time bildhantering), eller
- `next-config-remote-patterns` (autofix `unknown`-rad)

Värt att korsreferera när plan 05/06/09 körs. Inte nödvändigtvis ett fixer-yta-problem — möjligen en system-prompt-problem (LLM:n vet inte att den ska använda en känd bild-host).
