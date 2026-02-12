# Postmortem: Builder / Plan Mode / Preview-fel

Datum: 2026-02-12  
Projekt: `sajtmaskin`  
Scope: den deployade versionen du testade (`https://demo-kzmgufd6v5kqtmxx3rjt.vusercontent.net/`), inte senaste lokala ändringar.

## Executive Summary

Buildern föll inte primärt på en enskild "trasig endpoint", utan på en kombination av tre saker:  
1) ett **experimentellt custom modelId** var aktivt,  
2) **Plan Mode + prompt-orchestration** gav långa och delvis omstyrda prompts,  
3) **stream/finalisering** nådde fallback-scenarion utan säker preview-version.

Detta förklarar de rapporterade symptomen:
- mycket lång chattext,
- "No preview version was generated",
- stream-anomalier + abort,
- uteblivna bilder.

Min starka rekommendation är att återställa builder-baseline till `fyra` för stabilitet, och cherry-picka säkra förbättringar selektivt istället för att fortsätta direkt på nuvarande `fem`-beteende för builder-flödet.

---

## Baseline och jämförelse

- Nuvarande branch/HEAD: `fem` @ `3e7ca17`.
- Referensbranch: `fyra` (lokal `1b1712d`, remote `origin/fyra` `ed03fde`).
- Diff mellan `fyra..fem` visar ett stort builder-ingrepp i en enda commit:
  - `708 insertions / 49 deletions` i kritiska builder-filer.
  - Nya delar: custom modelId-flöde, Plan Mode first-prompt, prompt-orchestration, utökat stream/fallback-beteende.

---

## Direkta svar på dina frågor

### 1) Varför flera val i "Experimental V0 Mode LLD" / oklart beteende?

Du har nu **flera ytor** för samma val:
- header-menyn (`Experimentellt v0 modelId`),
- första-körningens modal (`Experimentellt custom modelId`),
- och valet persisteras i `localStorage`.

Kodbevis:
- `src/lib/builder/defaults.ts` (experimentella modelIds),
- `src/components/builder/BuilderHeader.tsx` (dropdown med experimentella modelIds),
- `src/app/builder/page.tsx` (`sajtmaskin:customModelId`, `selectedModelId = customModelId || tier`).

Effekt: användaren kan tro att tier-valet gäller, men ett persisterat custom modelId vinner i praktiken.

### 2) Varför blev Plan Mode så långt / "inte supersnygg sida"?

Två lager påverkar samtidigt:
- Plan block injiceras i systemprompt vid första prompten.
- Orchestratorn kan fasa/sammanfatta prompten till `Plan -> Build -> Polish` när budgettrösklar passeras.

Kodbevis:
- `src/app/builder/page.tsx` (Plan Mode injiceras i systemprompt för första prompten),
- `src/lib/builder/promptOrchestration.ts` (strategibyte till `phase_plan_build_polish`),
- `src/lib/builder/promptLimits.ts` (mjuka budgetar/thresholds).

Resultat: designkrav kan kondenseras eller tappas, och modellen kan fastna i plantext.

### 3) Varför ingen image generation?

I loggen var bildgenerering uttryckligen avstängd:
- `modelId: claude-opus-4.6-fast`
- `imageGenerations: false`
- `"Bildgenerering: av"`.

Kodbevis:
- `chat_till_vanster.txt` (Model info),
- `src/app/builder/page.tsx` (`sajtmaskin:aiImages` läses från localStorage),
- `src/lib/hooks/useV0ChatMessaging.ts` skickar `imageGenerations` direkt i request body.

### 4) Saknas IP/“iper” eller env i prod som rotorsak?

Det finns **ingen tydlig IP-allowlist-gating** i det här builder-flödet som förklarar dessa symptom.  
Prod env-audit (utan nätverksanrop) visar:
- inga fail på required setup (för audit-nivån),
- varningar på Redis-dubletter och vissa `NEXT_PUBLIC_*`-nycklar, men inget som direkt mappar till dina stream/preview-fel.

Så: möjligt med sekundära miljöproblem, men **inte huvudorsak** enligt evidens.

### 5) Behöver du byta agent p.g.a. context/memory?

Inte nödvändigt som primär åtgärd.  
Bättre är:
- kortare incidentspår per chat,
- explicit "state snapshot" i fil (vilket du redan gör bra),
- separera felsökning (stream) från feature-arbete (UI/design) i olika körningar.

### 6) Ska du gå vidare på nuvarande branch eller `fyra`?

**Rekommendation: gå via `fyra` som stabil baseline för builder-flödet.**  
Använd sedan cherry-pick för säkra, verifierade förbättringar i små steg.

---

## Felsymptom-karta (symptom -> bevis -> påverkan)

1. **Lång chatttext / plan-dominerad output**
   - Bevis: `chat_till_vanster.txt` innehåller mycket lång PRD/plan-output.
   - Påverkan: låg implementeringstäthet, hög textmängd, svag visuell leverans.

2. **"No preview version was generated"**
   - Bevis: `DOM_dev_tols.txt` felmeddelande från create/send stream.
   - Påverkan: ingen fungerande preview-version trots lång körning.

3. **Stream anomaly + safety timeout + AbortError**
   - Bevis: `DOM_dev_tols.txt` visar:
     - `Stream anomaly detected`
     - `Stream safety timeout reached`
     - `AbortError: BodyStreamBuffer was aborted`.
   - Påverkan: avbrutna sessioner, trasigt användarflöde.

4. **Inga bilder genereras**
   - Bevis: `chat_till_vanster.txt` (`imageGenerations: false`).
   - Påverkan: visuellt svagare sidor.

5. **Modellförvirring (inte V0 Max-varning + custom-id aktivt)**
   - Bevis: screenshot visar `opus-4.6-fast` i header, log visar `claude-opus-4.6-fast`.
   - Påverkan: svårt att veta vilken modell som faktiskt kör.

---

## Tidslinje (förenklad)

1. Första prompt begär plan/PRD innan kod -> modellen går tungt in i plantext.
2. Model info visar `claude-opus-4.6-fast`, `imageGenerations: false`.
3. Stream-fel uppstår: preview-version uteblir i minst en körning.
4. Senare körning ger preview-url men post-check indikerar inga filändringar (`+0 ~0 -0`).
5. Följdproblem: långa svar, låg designkvalitet, utebliven bildgenerering.

---

## Evidens (kod och loggar)

### Logg-evidens

- `chat_till_vanster.txt`
  - Model info: `claude-opus-4.6-fast`, `imageGenerations: false`, varning ej V0 Max.
  - Post-check: ingen tidigare version + `files: 91` men `added/modified/removed: 0/0/0`.

- `DOM_dev_tols.txt`
  - `Stream anomaly detected` (create/send),
  - `Error creating chat: No preview version was generated`,
  - `Stream safety timeout reached`,
  - `AbortError: BodyStreamBuffer was aborted`.

### Kod-evidens

- Modell/Plan-läge:
  - `src/lib/builder/defaults.ts`
  - `src/components/builder/BuilderHeader.tsx`
  - `src/app/builder/page.tsx`

- Prompt-fasning/sammanfattning:
  - `src/lib/builder/promptOrchestration.ts`
  - `src/lib/builder/promptLimits.ts`

- Stream/finalisering:
  - `src/lib/hooks/useV0ChatMessaging.ts`
  - `src/app/api/v0/chats/stream/route.ts`
  - `src/app/api/v0/chats/[chatId]/stream/route.ts`
  - `src/lib/v0/resolve-latest-version.ts`

- Preview/media-varningar:
  - `src/components/builder/PreviewPanel.tsx`
  - `src/app/api/health/route.ts`

---

## Root Causes (rankade)

### RC1 (Primär): Persisterat experimentellt modelId styr körningen

`customModelId` persisteras i localStorage och överstyr tier-valet (`selectedModelId = customModelId || tier`).  
Det gör att körningen kan hamna på experimentell modell trots att UI också visar tier-kontext.

**Konsekvens:** oförutsägbar kvalitet/preview-beteende och förvirring i UI.

### RC2 (Hög): Plan Mode + orchestration gav aggressiv prompt-fasning för stora prompts

Vid stora prompts och Plan Mode first prompt går systemet till `phase_plan_build_polish` och genererar kondenserad/fasad prompt.

**Konsekvens:** tappar designdetaljer, ökar sannolikhet för plan-text istället för konkret kodändring.

### RC3 (Hög): Stream-finish var beroende av version/demo, fallback tar tid och kan sluta i fel

När done-event saknar meningsfull data försöker servern lösa latest version i flera försök. Om ingen version/demo hittas skickas explicit fel.

**Konsekvens:** långa stream-sessioner, timeout/abort i frontend och "No preview version was generated".

### RC4 (Medel): Bildgenerering var avstängd i request

Loggen visar `imageGenerations: false`.

**Konsekvens:** inga AI-bilder även om övrigt flöde fungerar.

### RC5 (Medel): Dubbel/överlappande modell-UX

Custom model-val finns i flera ytor + persistens, samtidigt som varningscopy fokuserar på "inte V0 Max".

**Konsekvens:** användaren får otydlig mental modell av vad som faktiskt kör.

---

## Vad gick bra vs dåligt

### Vad gick bra

- Bra observability i klient/server: stream-anomaly, safety-timeout, felmeddelanden.
- Fallback-flöden finns (stream -> sync), vilket gör att allt inte dör direkt.
- Post-check pipeline ger extra signaler efter generation.

### Vad gick dåligt

- UX och styrning av modellval är inte deterministisk för användaren.
- Plan-läge och orchestration blev för aggressivt i praktiska scenarion.
- Preview-resolving är för skört när version/demo uteblir.
- Image flag och model flag blev "fel tysta lägen" (av utan tydlig blockering).

---

## Rekommenderad handlingsplan

## P0 (omedelbart, stabilitet)

1. Ta bort eller feature-flagga experimentella modelIds i produktion.
2. Nollställ `sajtmaskin:customModelId` och `sajtmaskin:planModeFirstPrompt` vid deploy (migrering).
3. Visa alltid "Effektivt modelId / AI-bilder / Plan-läge" bredvid Send i chatten.
4. Sätt fail-fast för första prompt: om ingen `versionId` inom kort tröskel, fallback till `v0-max` + `imageGenerations: true`.
5. Temporärt stäng av Plan Mode i produktion tills validerad.

## P1 (stabilisering)

1. Spara modell/plan/image-flaggor per chat (DB) istället för global localStorage.
2. Höj/tuna orchestration-budgetar för långa designprompts.
3. Minska antalet modellvalytor (en enda källa i UI).
4. Inför explicit "plan output max length" i plan-läge.

## P2 (kvalitet/design)

1. Lägg till design quality gate (minimikrav: hero + media + sektioner).
2. Kör automatisk kontroll på "faktiska filändringar > 0" innan post-check räknas som lyckad.
3. Lägg till scenario-tester:
   - lång prompt + plan mode,
   - custom model active,
   - image on/off.

---

## Branchrekommendation

### Alternativbedömning

- **Fortsätt på `fem` direkt:** hög regressionsrisk i builderflödet.
- **Cherry-pick till `fem` utan rollback:** svårt att isolera p.g.a. stora sammanflätade ändringar.
- **Basera på `fyra` och cherry-picka säkert:** lägst risk för snabb stabilisering.

### Rekommendation (tydlig)

**Gå via `fyra` som baseline för buildern.**  
Skapa en recovery-branch från `fyra`, och cherry-picka endast verifierade delar i små batcher (P0 först, sedan P1/P2).

---

## Rekommendation om agent/context

- Agentbyte är inte ett krav för att lösa felet.
- Det viktiga är arbetsupplägg:
  - en incident per chat,
  - korta sammanfattningsfiler mellan steg,
  - separata spår för "stream reliability" och "UI quality".

När kontext blir stor: starta ny agentkörning med en kompakt incident-brief + länkar till loggfilerna (inte hela historiken).

---

## Residual risks

1. Även efter rollback kan externa v0-/provider-spikar ge intermittent streamstörning.
2. Om custom modelId tillåts igen utan guard rails återkommer sannolikt felet.
3. Beroenden till preview-proxy/iframe kan ge varningar som maskerar verkliga fel.

---

## Slutstatus

Postmortem slutsats: felet är huvudsakligen **konfigurations- och flödesrelaterat** (modellval + plan/orchestration + stream-finalisering), inte ett enskilt "API down"-problem.  
Nästa säkra steg är en **kontrollerad återgång via `fyra`** och därefter återinförande av funktioner med tydliga guard rails.

