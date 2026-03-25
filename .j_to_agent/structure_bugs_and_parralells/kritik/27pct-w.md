# Parallell granskning — remediation efter `ceaee87b` → `b428b2ff` (`master`)

**Granskad tip:** `b428b2ff` — `feat(remediation): ~27pct tier2 UTF-8 landing data + integration registry scaffold`  
**Jämförelsebas (förra rapporten):** `ceaee87b` (~18pct landning)  
**Repo:** `C:\Users\jakem\dev\projects\sajtmaskin`, gren **`master`** (= `origin/master` efter `git fetch`)

**Arbetsregel (inhämtad):** Allt remediation-arbete utgår från **`master`**; vid varje koll ska **`git log master -1`** / **`origin/master`** vara den auktoritativa spetsen — inte en detached HEAD i annan worktree.

---

## 1. Finns det *nyare* commits än `b428b2ff`?

**Nej** — efter `git fetch origin` pekar både `master` och `origin/master` på **`b428b2ff`**. Det finns inga ytterligare commits att granska utöver denna kedja.

---

## 2. Commit-kedja som granskats (18pct → 27pct)

| Commit | Kort innehåll |
|--------|----------------|
| `fc0c2908` | `useLandingController`, `landing-chat-data.ts`, `landing-hooks.ts`; stor minskning av `chat-area.tsx` (data/hooks ut) |
| `9cc26ba5` | Docs: commit policy, förtydligande helhet vs landning |
| `b428b2ff` | UTF-8 i `landing-chat-data.ts`, `src/lib/integrations/registry.ts`, `write-tier2-run.mjs`, progress uppdaterad |

**Aggregerad diff:** `ceaee87b..b428b2ff` — 8 filer, ~+1336 / −999 rader (enligt `git diff --stat`).

---

## 3. Validering

- **`npm run typecheck`** kördes i checkout på **`C:\Users\jakem\dev\projects\sajtmaskin`**: **OK** (exit 0).

---

## 4. Styrkor

1. **`useLandingController`** samlar tydligt state, `startBuild`, jämförelselogik och terminal/glow-referenser — i linje med steg 2 i `.j_to_agent/1.txt` (hook för landning).
2. **`landing-hooks.ts`** behåller **DOM-baserad tilt** och **`prefers-reduced-motion`** — ingen regression mot 18pct-prestandaidén.
3. **Data ut ur `chat-area.tsx`** minskar risken att copy och konstanter lever i en megafil; `landing-chat-data.ts` är en rimlig SOT för statisk landningsdata.
4. **`integrationRegistry`** + `IntegrationDefinition` följer den avsedda formen från planen (nyckel, env, guide, runtime, optional) och har **6** poster — rimlig första scaffold.
5. **Progress-dokumentet** beskriver uttryckligen att registret **inte** är kopplat till detektion än — ärlig scope-gräns.

---

## 5. Svagheter, risker och potentiella buggar

### 5.1 Dokumentation: motsägande procentsiffror

I `external-review-remediation-progress.md` står raden om **~24%** / **~58%** som förklaring, medan tabellen anger **~27%** / **~62%**. Det skapar onödig förvirring för nästa agent. **Åtgärd:** uppdatera den inledande texten så den matchar tabellen (eller ta bort den duplicerade förklaringen).

### 5.2 `extract-landing-chat-data.mjs` — skört mot radnummer

Skriptet plockar rader **137–746** ur `chat-area.tsx` hårdkodat. Om någon flyttar data-blocket i filen **utan** att uppdatera skriptet kan nästa extraktion bli **fel eller tom**. **Åtgärd:** kommentera tydligt i skriptet att det måste synkas manuellt, eller ersätt med markörer eller robust parsning.

### 5.3 `write-tier2-run.mjs` — hårdkodad körningsmapp

Skriptet skriver till `.cursor/orchestrator/run/2026-03-26-tier2-continue`. Användbart som engångsstämplare men lätt att missta för generiskt. **Åtgärd:** parametrisera run-id via CLI-arg eller namnge som template.

### 5.4 `chat-area.tsx` fortfarande ~1700+ rader

Refaktorn flyttade data/hooks men **LandingHero / LandingFooter** är inte utbrutna än. Underhålls- och merge-risk kvarstår.

### 5.5 Integration registry — drift mot resten av systemet

- **`detect-integrations.ts` importerar inte** `integrationRegistry` — tills wire finns **två sanningar** (heuristik vs lista).
- **OpenAI** som `category: "other"` är svagt för UI-gruppering senare.
- **Supabase-env** i registret är minimalt — OK som scaffold; dokumentera utökning.

### 5.6 `useLandingController` — observationer

- `startBuild`-deps ser rimliga ut för importerade konstanter.
- Modal + `document.body.style.overflow` har cleanup kopplat till `activeFeature` — ser korrekt ut.

---

## 6. Rekommenderad ordning

1. Koppla **`detect-integrations` + UI/wizard** till **`integrationRegistry`**.
2. Bryt ut **`LandingHero` / `LandingFooter`** (sekventiellt).
3. Rätta **progress-dokumentets** inledande procentsatser.
4. Sedan: `LandingBackground`, reduced-motion, manifest + deploy (`1.txt`).

---

## 7. Slutsats

Kedjan **18pct → 27pct** är **sammanhängande**, **typecheck-ren**, och följer planen. Största uppföljningar: **docs-siffror**, **skört extraktionsskript**, **registry wiring**.

---

*Rapport: `27pct-w.md` — ~27pct + bokstav.*
