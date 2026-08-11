# Flödesschema — så byggs en sajt (grindar, fixare och modeller)

Snabbtitt för ägaren: vilka vägar en generering kan ta, vilka **grindar** (kontroller
som kan stoppa) och **fixare** (automatiska reparatörer) som finns, och vilken modell
som jobbar var. Enkelt språk; dev-ordet står i parentes. Koden vinner alltid över
det här dokumentet. Djupare detaljer: [`docs/architecture/llm-pipeline.md`](docs/architecture/llm-pipeline.md).

## Huvudflödet (F2 — designläget)

```mermaid
flowchart TD
    A["Din prompt<br/>(+ ev. djupanalys av önskemålet, 'deep brief' — bara första gången)"] --> B
    B["Planering (orchestration):<br/>välj startpaket (scaffold), stil (variant),<br/>Byggblock (dossiers) och UI-recept (shadcn)"] --> C
    C["Modellen skriver koden<br/>(own-engine stream: planner → generator)"] --> D
    D["Städning (Normalize):<br/>korta URL:er expanderas, texter normaliseras"] --> E
    E["Mekaniska fixare (autofix, ingen AI):<br/>saknade paket pinnas (dep-completer),<br/>trasiga importer lagas (import-repair),<br/>saknade filer kopplas om (cross-file-import-checker)"] --> F
    F{"Stavningskontroll för kod<br/>(syntaxvalidering, esbuild)"}
    F -- fel --> G["AI-fixaren lagar riktat<br/>(LLM-fixer, upp till 4 pass)"] --> F
    F -- rent --> H["Snabb typkontroll mot varm cache<br/>(pre-VM typecheck — hoppas över om cachen är kall)"]
    H --> I["AI-granskaren läser koden<br/>(verifier-LLM: hittar Blockers = stoppande fel<br/>och Advisory = råd som inte stoppar)"]
    I --> J["Ihopslagning med startpaketet (merge):<br/>package.json djup-merges, skyddade filer återinjiceras"]
    J --> K["Efterkontroll av granskningen (stale-check):<br/>fynd som ihopslagningen redan löst släpps"]
    K --> L["Previewn startar i moln-VM<br/>(Fly, preview-host)"]
    L --> M{"Fungerar previewn?<br/>(RenderGate: typecheck + readiness-prob)"}
    M -- nej --> R
    M -- ja --> N["Produktkoll i riktig webbläsare<br/>(Product Postcheck, Playwright):<br/>döda länkar, trasig mobilmeny, fejkformulär"]
    N --> O["SEO-koll + kodsanity<br/>(bara råd, stoppar inte)"]
    O --> P{"Kvar några Blockers?"}
    P -- nej --> Q["✅ Versionen godkänns (promoted)<br/>grön i versionslistan"]
    P -- ja --> R["🔧 Reparationsvägen (RepairGate)"]
```

## Reparationsvägarna (när något stoppar)

```mermaid
flowchart TD
    R["Fel upptäckt"] --> R1["Automatisk reparation från servern<br/>(server-repair, max 2 pass)"]
    R --> R2["Automatisk reparation från din webbläsare<br/>(klient-autofix, max 3 per chatt, max 1 per felsort)"]
    R --> R3["Du klickar själv 'Reparera'<br/>(manual repair)"]
    R1 & R2 & R3 --> R4["AI-fixaren skriver om de utpekade filerna<br/>(samma LLM-fixer som ovan)"]
    R4 --> R5{"Blev det bättre?<br/>(ny verify-körning)"}
    R5 -- ja --> R6["Reparation väntar på ditt OK<br/>(auto-godkänns efter 5 min om du inte svarar)"]
    R5 -- nej --> R7["Versionen förblir röd —<br/>skriv i chatten vad som ska ändras"]
```

## F3 — "Bygg integrationer" och publicering

```mermaid
flowchart TD
    S["Du klickar 'Bygg integrationer'<br/>(finalize-design → F3/integrations)"] --> T{"Env-grind:<br/>saknas byggkritiska nycklar?<br/>(bara 'build'-nycklar stoppar — demo-värden OK)"}
    T -- ja --> T1["Stopp (412) — Byggblock-panelen<br/>öppnar rätt block att fylla i"]
    T -- nej --> U["Ny generering som kopplar in riktiga integrationer<br/>(OpenAI-chatt, Stripe m.fl. — demo blir på riktigt)"]
    U --> V["Samma slutsteg som F2 (fixare → granskare → preview)"]
    V --> W{"Släppgrinden (ReleaseGate):<br/>typecheck → riktig build i VM"}
    W -- rött --> R["Reparationsvägen"]
    W -- grönt --> X["Publicera-knappen låses upp"]
    X --> Y["Deploy till Vercel<br/>(eget projekt per sajt; publik alias-URL)"]
```

## Vilken modell jobbar var? (per kvalitetsnivå/tier)

Kanonisk källa: `config/ai_models/manifest.json` → `phaseRouting` (syns även i
backoffice → LLM-konfig).

| Fas | Premium | Pro | Max | Anthropic |
|---|---|---|---|---|
| Planerare (planner) | GPT-5.6 Sol 🧠 | gpt-5.3-codex 🧠 | gpt-5.5 🧠 | Claude Opus 4.8 🧠 |
| Kodskrivare (generator) | GPT-5.6 Sol 🧠 | gpt-5.3-codex 🧠 | gpt-5.5 🧠 | Claude Opus 4.8 🧠 |
| **Fixare (fixer)** | **GPT-5.6 Sol** (utan 🧠 — ägarbeslut 2026-08-11) | gpt-5.3-codex | gpt-5.3-codex | Claude Opus 4.8 (utan 🧠) |
| Granskare (verifier) | GPT-5.6 Sol 🧠 | gpt-5.3-codex | gpt-5.3-codex | Claude Opus 4.8 |
| Deploy-hjälp | GPT-5.6 Sol 🧠 | gpt-5.3-codex | gpt-5.3-codex | Claude Opus 4.8 |

🧠 = "thinking" (modellen resonerar längre innan svar; långsammare men noggrannare).
Fixaren jobbar riktat på utpekade filer — där vinner snabbhet över djup.

## Grindarna i klartext

| Grind | Vad den stoppar | När |
|---|---|---|
| Syntaxvalidering | kod som inte ens kompilerar | direkt efter generering |
| Verifier-LLM | logiska fel, låtsasfunktioner, trasigt manifest (Blockers) | efter fixarna |
| Stale-check | *häver* granskarens fynd som ihopslagningen redan löst | efter merge |
| RenderGate | preview som inte renderar | F2, efter boot |
| Product Postcheck | trasig mobilmeny, ≥2 döda länkar, renderkrasch | F2, i riktig webbläsare |
| Env-grind (412) | saknade byggkritiska nycklar | vid F3-klick |
| ReleaseGate | kod som inte klarar riktig build | F3, före Publicera |
| Deploy-grindar (409) | opublicerbar version (ej grön, fel env) | vid Publicera |

## Lärande i bakgrunden (RAG)

Varje fel och fix loggas i produktionsdatabasen (`error_log_events` i Postgres/Supabase).
Före varje ny generering hämtas de ~5 000 senaste raderna (en gång per serverinstans
per minut, inte per bygge) och blir "lärdomar från liknande byggen" i prompten —
så samma fel ska bli mindre sannolikt nästa gång.
