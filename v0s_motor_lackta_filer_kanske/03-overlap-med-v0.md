# Vad sajtmaskin byggt som v0 redan gör internt

> 2026-03-06 — Kartläggning av funktioner som existerar i BÅDA systemen,
> med bedömning av om sajtmaskins version tillför värde eller är redundant.

---

## Bakgrund

sajtmaskin skickar en bearbetad prompt till v0 Platform API. v0 har sedan
sin egen interna pipeline som OCKSÅ bearbetar prompten. I vissa fall gör
sajtmaskin saker som v0 redan hanterar — ibland bättre, ibland sämre.

---

## 1. Prompt-strukturering (sajtmaskin TILLFÖR VÄRDE)

**sajtmaskin gör:**
`formatPromptForV0()` strukturerar ostrukturerade prompts till:
MÅL / SEKTIONER / STIL / CONSTRAINTS / TILLGÄNGLIGHET

**v0 gör internt:**
v0:s systemprompt instruerar modellen att använda `<Thinking>` för att
"evaluate which code block type is most appropriate" — dvs v0 strukturerar
sin EGEN förståelse av prompten.

**Bedömning:** sajtmaskins strukturering HJÄLPER v0 att förstå prompten
snabbare och mer korrekt. Inte redundant — det är pre-processing som
förenklar v0:s jobb.

**Behåll:** JA.

---

## 2. System-prompt med build-intent (sajtmaskin TILLFÖR VÄRDE)

**sajtmaskin gör:**
`resolveBuildIntentSystemPrompt()` skickar t.ex.:
"Website build: focus on clear structure and flows..."
som `system`-fält i API-request.

**v0 gör internt:**
v0 har sin egen dynamiska systemprompt som injicerar kontextbaserat
(embeddings + keyword). sajtmaskins `system`-fält APPENDAS till v0:s
interna systemprompt.

**Bedömning:** Inte redundant. v0:s interna prompt är generisk;
sajtmaskins system-fält ger specifik intent-vägledning som v0 inte
kan veta utan att få det som input.

**Behåll:** JA.

---

## 3. Visuell identitet-injektion (sajtmaskin LEDER v0)

**sajtmaskin gör:**
`buildDynamicInstructionAddendumFromBrief()` injicerar:
- ## Interaction & Motion (motionProfile, lively/subtle/cinematic)
- ## Visual Identity (colorPalette, themeTokens, accent-linjer)
- ## Quality Bar (premium, layered, never flat white backgrounds)

**v0 gör internt:**
v0:s systemprompt har enkla regler: "MUST USE bg-primary",
"DOES NOT use indigo or blue". Mycket mindre sofistikerat.

**Bedömning:** sajtmaskin leder (8 vs 6). v0:s regler är statiska;
sajtmaskins är dynamiskt anpassade per brief.

**Behåll:** JA — detta är en konkurrensfördel.

---

## 4. Budget/token-orkestrering (sajtmaskin LEDER v0)

**sajtmaskin gör:**
`orchestratePromptMessage()` med:
- complexityScore (0–9)
- Per-promptType budgetTarget
- Strategier: direct / summarize / phase_plan_build_polish
- Hard cap med emergency-summarize

**v0 gör internt:**
Ingen publik information om budget-orkestrering. v0 accepterar prompten
som-den-är och hanterar token-begränsningar via kontextfönstret.

**Bedömning:** sajtmaskin leder (8 vs 7). Men OBS: dubbel-orkestrering
(klient + server) är ett problem — se `02-redundant-och-fel.md`.

**Behåll:** JA, men konsolidera till enbart server-sidan.

---

## 5. Category/template-prompts (PARITET)

**sajtmaskin gör:**
`CATEGORY_PROMPTS` i v0-generator.ts — fördefinierade prompts för
"landing-page", etc. som helt ersätter användarens prompt.

**v0 gör internt:**
v0 har interna templates baserat på domänkunskap (från läckt prompt:
"domain knowledge" + citeringsregler).

**Bedömning:** Paritet. sajtmaskins templates är bra men v0 har bredare
domänkunskap. Inte redundant — de kompletterar varandra.

**Behåll:** JA.

---

## 6. Bildhantering (PARITET)

**sajtmaskin gör:**
- `IMAGE_DENSITY_GUIDANCE` regler i prompt
- `imageGenerations`-flagga i API-request
- Instruktioner om alt-text, inga placeholder-services om AI-bilder aktiva

**v0 gör internt:**
- `Uses /placeholder.svg?height={height}&width={width}`
- Stödjer blob-storage-URLs

**Bedömning:** Paritet. sajtmaskins regler kompletterar v0:s.

**Behåll:** JA.

---

## 7. Modellval (DELVIS REDUNDANT)

**sajtmaskin gör:**
`QUALITY_TO_MODEL` mappning: light→v0-1.5-md, premium→v0-max-fast.
Legacy-alias-resolution. UI för att välja modell.

**v0 gör internt:**
v0-bloggen: "composite model family" — v0 kan intern-routa mellan
modeller per steg i pipelinen.

**Bedömning:** sajtmaskins modellval styr vilken HUVUD-modell som anropas,
men v0 kan internt byta modell per steg ändå. sajtmaskins val är INTE
redundant — det styr kostnad och kvalitetsnivå.

**Behåll:** JA.

---

## 8. Thinking-flagga (PASS-THROUGH)

**sajtmaskin gör:**
Skickar `thinking: true/false` i API-request beroende på modelltier.

**v0 gör internt:**
v0:s systemprompt: "ALWAYS uses <Thinking> BEFORE providing a response".

**Bedömning:** sajtmaskins flagga AKTIVERAR v0:s thinking-funktion.
Utan flaggan körs thinking ändå (enligt läckt prompt), men flaggan
ger sajtmaskin kontroll över att stänga av det om önskat.

**Behåll:** JA.

---

## Sammanfattning

| # | Funktion | Overlap | Sajtmaskin tillför? | Behåll? |
|---|----------|---------|---------------------|---------|
| 1 | Prompt-strukturering | Delvis | JA (pre-processing) | Ja |
| 2 | System-prompt intent | Delvis | JA (specifik guidance) | Ja |
| 3 | Visuell identitet | Minimal | JA (leder v0) | Ja |
| 4 | Budget-orkestrering | Minimal | JA (leder v0) | Ja, konsolidera |
| 5 | Category-prompts | Paritet | JA (kompletterar) | Ja |
| 6 | Bildhantering | Paritet | JA (kompletterar) | Ja |
| 7 | Modellval | Delvis | JA (kostnadskontroll) | Ja |
| 8 | Thinking-flagga | Direkt | JA (kontroll) | Ja |

**Slutsats:** Inget av sajtmaskins egenbyggda lager är rent redundant.
Alla tillför värde eller ger kontroll. Den enda åtgärden är att
konsolidera dubbel-orkestreringen (punkt 4).
