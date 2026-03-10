# v0 vs sajtmaskin — Promptmotoranalys

> Senast uppdaterad: 2026-03-06
> Typ: Beslutsunderlag (undersökning/jämförelse, ej implementation)

---

## Syfte

Denna rapport besvarar:

1. Hur mycket av v0:s motor har sajtmaskin redan byggt?
2. Vad kan byggas internt, och vad kräver v0:s proprietära infrastruktur?
3. Var gör sajtmaskin fel jämfört med v0:s mönster?
4. Vad händer om v0-motorn tas bort helt?

---

## Källor och evidensnivåer

| Nivå  | Betydelse |
|-------|-----------|
| Hög   | Officiell källa (Vercel-blogg, docs) eller egen källkod |
| Medel | Multipla community-rapporter med intern överensstämmelse |
| Låg   | Enskild läcka eller rimlig slutledning utan bevis |

Primära: Vercel-blogg (2026-01-07), v0.app/docs, sajtmaskins källkod.
Sekundära: Reddit r/LocalLLaMA (nov 2024), GitHub 2-fly-4-ai/V0-system-prompt,
dev.to reverse-engineering (dec 2023).

---

## v0: vad är bekräftat

| Mekanism | Källa | Evidens |
|----------|-------|---------|
| Dynamic System Prompt (intent-detektion via embeddings + keyword → docs-injektion) | Vercel-blogg | Hög |
| LLM Suspense (streaming find-and-replace, lucide-substitution, URL-komprimering, <100ms) | Vercel-blogg | Hög |
| Autofixers (AST-parse + fine-tunad modell, <250ms) | Vercel-blogg | Hög |
| MDX-baserat utdataformat med 5-blocks systemprompt | Blogg + läcka | Hög |
| Thinking-steg före svar | Blogg + läcka | Hög |
| 10% baseline error-rate som fixas av pipeline | Vercel-blogg | Hög |
| "Static JSX" som designprincip | Reverse-eng | Medel |
| ~8–16K tokens systemprompt | Läcka | Medel |

---

## sajtmaskin: modellrouting

v0 är alltid kodgeneratorn. Andra modeller används för stödfunktioner.

| Syfte | Modell(er) | Endpoint |
|-------|------------|----------|
| Kodgenerering (ny sajt) | v0-max-fast, v0-1.5-md, v0-1.5-lg, v0-gpt-5 | /api/v0/chats/stream |
| Kodgenerering (fortsättning) | Samma | /api/v0/chats/[chatId]/stream |
| Prompt Assist (rewrite/polish) | openai/gpt-5.2 eller v0-1.5-md/lg via gateway | /api/ai/chat |
| Brief-generering | anthropic/claude-sonnet-4.5 | promptAssistContext.ts |
| Wizard enrichment | AI Gateway (varierad) | /api/wizard/enrich |
| Inspector/audit | openai via AI Gateway | /api/inspector-ai-match |

---

## Kapabilitetsmatris

| # | Kapabilitet | v0 | sajtmaskin | Gap | Byggbar | Insats |
|---|-------------|-----|-----------|-----|---------|--------|
| 1 | Promptspecifikation | 9 | 8 | 1 | Ja | Låg |
| 2 | Dynamisk kontextinjektion | 9 | 4 | 5 | Delvis | Medel |
| 3 | Modellrouting | 8 | 7 | 1 | Ja | Låg |
| 4 | Ny chatt vs fortsättning | 9 | 7 | 2 | Ja | Låg |
| 5 | Streaming-fixar (Suspense) | 9 | 0 | 9 | Delvis | Hög |
| 6 | Post-generation autofix | 8 | 2 | 6 | Delvis | Medel |
| 7 | Eval / observability | 7 | 5 | 2 | Ja | Medel |
| 8 | Säkerhet / guardrails | 8 | 5 | 3 | Ja | Medel |
| 9 | Kostnadskontroll | 7 | 7 | 0 | Ja | Låg |
| 10 | Felåterhämtning | 8 | 4 | 4 | Delvis | Medel |
| 11 | Prompt-orkestrering | 7 | **8** | -1 | Ja | — |
| 12 | Visuell identitet i prompt | 6 | **8** | -2 | Ja | — |

---

## Scoring

| Score | Värde | Tolkning |
|-------|-------|----------|
| ParityScore | 58% | sajtmaskin implementerar 58% av v0:s pipeline |
| SelfBuildScore | 72% | 72% av kapabiliteten kan byggas internt |
| ReliabilityScore | 45% | Utan post-fix: ~10% trasiga generationer passerar |
| StrategicFitScore | 75% | sajtmaskins styrkor matchar målgruppen |
| **Sammanvägt** | **62.5%** | Confidence: 55–70% |

---

## Om v0 tas bort: insatsuppskattning

| Zon | Insats | Resultat |
|-----|--------|----------|
| Blockerare (modell + preview) | 7–16v | Fungerande pipeline men ~30% felfrekvens |
| Kvalitetshöjare (systemprompt, streaming-fix, autofix) | 8–14v | Felfrekvens ner till ~10–15% |
| Förbättrare (intent-detektion, retry, eval) | 6–11v | Ner till ~5–10% |
| **Totalt** | **21–41v** | ~85–90% av v0:s kapabilitet |

Jämförelse: behåll v0 + bygg post-fix/retry = **5–9 veckor**.

---

## Rekommendation

1. **Kort sikt:** Behåll v0. Bygg post-fix + retry-loop (5–9v).
2. **Medelsikt (Q2–Q3):** Bygg intent-detektion, streaming-filter, eval-loop.
3. **Lång sikt (Q4+):** Utvärdera egen modell via AI Gateway. Fas ut v0 gradvis.
