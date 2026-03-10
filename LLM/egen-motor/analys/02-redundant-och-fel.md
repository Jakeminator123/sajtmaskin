# Vad sajtmaskin gör redundant eller fel

> 2026-03-06 — Baserat på kodanalys och jämförelse med v0:s pipeline.

---

## 1. Dubbel prompt-orkestrering (REDUNDANT + FEL)

**Symptom:** `orchestratePromptMessage()` körs BÅDE på klienten (useCreateChat.ts
rad 225) OCH på servern (stream/route.ts rad 146).

**Vad händer:** En prompt som är lite för lång kan bli summarized på klienten,
skickas till servern, och summarized IGEN. Resultat: dubbel informationsförlust.

**Varför det finns:** Serverns orkestrering lades till som guardrail, men klientens
togs aldrig bort.

**Konsekvens:**
- Prompt kan bli obegripligt kort/fragmenterad
- Svårt att resonera om vad LLM:en faktiskt ser
- Svårt att debugga dåliga generationer

**Åtgärd:** Flytta all orkestrering till server-sidan. Klienten skickar rå prompt
+ metadata (buildIntent, buildMethod, attachmentsCount). Servern gör ett enda
orchestrate-pass.

**Insats:** ~1 vecka.

---

## 2. Ingen post-generation-validering (FEL)

**Symptom:** Genererad kod från v0 visas direkt för användaren utan att passera
någon validering. Om v0 producerar trasiga imports, saknade deps, eller
felaktig JSX syns det direkt.

**Varför det är ett problem:** v0-bloggen rapporterar att LLM-genererad kod har
fel ~10% av gångerna. v0:s interna pipeline (Suspense + Autofixers) fångar
de flesta, men sajtmaskin lägger ingen ytterligare kontroll på sin sida.

**Konsekvens:**
- Användaren ser trasiga previews
- Kräver en extra generation-runda (kostar tokens + tid)
- Tappar förtroende

**Åtgärd:** Implementera deterministisk post-fix efter streaming:
1. Extrahera imports → verifiera mot känd komponentlista (shadcn/ui, lucide)
2. Scanna för saknade deps → komplettera package.json
3. Enkel JSX-syntax-check

**Insats:** 3–5 veckor.

---

## 3. Ingen streaming-integritetskontroll (FEL)

**Symptom:** SSE-strömmen från v0 passerar rakt igenom (`extractContentText`,
`extractDemoUrl` etc.) utan transformation. Om v0:s Suspense-lager missar
ett fel, finns ingen andra chans.

**Vad v0 gör som sajtmaskin inte gör:**
- Import-path-fix: `@components/ui` → `@/components/ui/button`
- Lucide-icon-substitution: `VercelLogo` → `Triangle as VercelLogo`
- URL-expansion: kort alias → full blob-storage-URL

**Konsekvens:** Fel som v0:s Suspense normalt fångar passerar rakt igenom
om de slips igenom.

**Åtgärd:** Se `04-streaming-postprocess.md` för implementationsguide.

**Insats:** 3–5 veckor.

---

## 4. URL:er skickas ocomprimerade (REDUNDANT KOSTNAD)

**Symptom:** `enhancePromptForV0()` lägger till fulla URL:er (t.ex. från
media-katalog) direkt i prompten. Varje URL kan vara hundratals tecken.

**Vad v0 gör:** Ersätter långa blob-URLs med korta alias FÖRE LLM-inference,
expanderar tillbaka EFTER. Sparar "10s of tokens" per URL.

**Konsekvens:** Högre token-kostnad per generation, marginellt sämre latens.

**Åtgärd:** Inför URL-alias-mappning:
1. Före API-anrop: ersätt långa URLs med `{{URL_1}}`, `{{URL_2}}` etc.
2. Skicka mappning som metadata
3. Efter streaming: expandera alias tillbaka i genererad kod

**Insats:** 1–2 dagar.

---

## 5. promptAssistContext använder fel modell (REDUNDANT/SUBOPTIMALT)

**Symptom:** promptAssistContext.ts rad 102: `gateway("anthropic/claude-sonnet-4.5")`
med kommentar "v0-1.5-lg not available via gateway yet".

**Konsekvens:** Brief-generering och kodgenerering använder OLIKA modeller,
vilket kan ge stilmismatch i den slutgiltiga prompten.

**Åtgärd:** Antingen:
- Använd v0 Model API direkt för brief-generering (inte gateway)
- Eller vänta tills v0-modeller exponeras via AI Gateway och byt då

**Insats:** 1–2 dagar.

---

## 6. Ingen eval-feedback-loop (FEL)

**Symptom:** Ingen automatisk mätning av om genererad preview renderar felfritt.

**Vad v0 gör:** Optimerar primärt "percentage of successful generations" —
mäter render-success/fail och matar tillbaka i promptregler.

**Konsekvens:** sajtmaskin kan inte systematiskt identifiera vanliga felmönster
eller veta om en promptändring faktiskt förbättrar kvaliteten.

**Åtgärd:** Logga render-success/fail per generation. Aggregera felmönster
i en dashboard. Mata tillbaka i prompt-regler.

**Insats:** 2–4 veckor.

---

## 7. Ingen prompt-cache-optimering (REDUNDANT KOSTNAD)

**Symptom:** sajtmaskin skickar system-prompt med dynamiskt `buildIntent`-innehåll
som varierar per anrop. v0:s systemprompt håller injektioner "consistent to
maximize prompt-cache hits".

**Konsekvens:** Lägre prompt-cache-hitrate hos v0:s API. Högre latens och kostnad.

**Åtgärd:** Separera system-prompt i:
- Statisk del (alltid identisk) → maximerar cache
- Variabel del (build-intent, theme) → appendas sist

**Insats:** 1–2 dagar.

---

## Sammanfattning

| # | Problem | Typ | Prioritet | Insats |
|---|---------|-----|-----------|--------|
| 1 | Dubbel orkestrering | Redundant + Fel | HÖG | 1v |
| 2 | Ingen post-fix | Fel | HÖG | 3–5v |
| 3 | Ingen streaming-fix | Fel | MEDEL | 3–5v |
| 4 | URL:er ocomprimerade | Redundant kostnad | LÅG | 2d |
| 5 | Fel modell i brief-context | Suboptimalt | LÅG | 2d |
| 6 | Ingen eval-loop | Fel | MEDEL-HÖG | 2–4v |
| 7 | Ingen prompt-cache-opt | Redundant kostnad | LÅG | 2d |
