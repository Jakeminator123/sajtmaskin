# Parallell granskning — ny fas ~34pct (`LandingBackground`)

**Granskad tip (remote `master`):** `b3125390` (senaste: orchestrator-logg; kodfasen ~34pct i `62cdcd2b`)  
**Föregående segment (känd baseline):** `bf58d0cc` … `62cdcd2b` inkl. `LandingBackground` + CSS  
**Obs:** Lokal worktree kan ligga på äldre SHA; granskningen utgår från **`origin/master`**.

---

## 1. Ja — en ny fas har inletts

Efter ~31pct + SQLite-fixen kommer minst:

- **`e9f781c7`** — ESLint-landning + progress  
- **`8ec3ded9`** — städ av `.j_to_agent` 1–3, orchestrator-workloads, **kritikfiler in i repot**  
- **`d75cbb77` / `b3125390`** — orchestrator-run-dokumentation + logg  
- **`62cdcd2b`** — **`feat(remediation): ~34pct — LandingBackground + semantic tint`**

Progress: **Whole ~34%**, **Landing ~72%**, integrationsspår oförändrat **~22%** — landningsspåret tar kliv enligt `1.txt` (bakgrund ut + semantik).

---

## 2. De tre första kritikfilerna (`18pct-k`, `27pct-w`, `31pct-t`) — har buggarna åtgärdats?

**Delvis / successivt — ja på det mesta som var kod, nej på allt som var “kvar i backlog”.**

| Källa | Central kritik | Status på `master` nu |
|--------|----------------|------------------------|
| **18pct-k** | Mousemove utan `setState`, reduced motion för tilt, tech vs `package.json`, footer, video+toast, Zod-rad | **Kvar** (tidigare commits); tilt/reduced motion utökas nedan. |
| **27pct-w** | Progress-siffror vs tabell inkonsekventa; `extract-landing-chat-data` skört; `write-tier2-run` hårdkodad path; megafil `chat-area`; registry ej wired | **Mesta fixat:** tabell/intro i sync i senaste progress; extract **vakt**; tier2 **CLI run-id**; hero/footer + controller; **detect → registry**. `chat-area` fortfarande stor men mindre monolit. |
| **31pct-t** | SQLite-setup svenska; extrakt fortfarande radbundet; nästa: `LandingBackground`, m.m. | **SQLite** fixad i `bf58d0cc`. **LandingBackground** levererad i `62cdcd2b`. Radbundet extrakt **kvar** (vakt hindrar bara korruption). |

**Slutsats:** De tre rapportfilerna beskriver i stor utsträckning **lösta** eller **pågående** punkter; de behöver inte “rättas” som felaktiga — men **nya** luckor finns (nedan).

---

## 3. Nya / kvarvarande kritikpunkter (något att skriva här)

### 3.1 `LandingBackground` — semantik vs plan

- CSS-tint definieras för **`template`**, **`audit`**, **`analyserad`**. **`fritext`** har inga egna gradient-regler → **default** teal/orbs (samma som innan). Det kan vara **medvetet minimalt**, men jämfört med `1.txt` (“fritext = lugn neutral”) är skillnaden **subtil** — överväg en explicit ljusare/dämpad `fritext`-profil om ni vill att lägesbytet ska *kännas* tydligare.

### 3.2 Reduced motion — fortfarande ojämnt

- Under **`.landing-chat-bg`** stängs orb- och grid-animationer av och opacitet sänks — **bra** och bättre än tidigare “bara tilt”.  
- Progress nämner fortfarande **`IntegrationCard` float** och liknande **utanför** den scoped CSS:en → användare med `prefers-reduced-motion` kan fortfarande få **mycket rörelse** längre ner på sidan. Nästa steg: utöka samma princip (eller global `@media (prefers-reduced-motion: reduce)` för `float-particle-kf` / marquees) om tillgänglighet är prio.

### 3.3 Dubbel källa för “läge”

- `landingBackgroundSemanticMode(selectedCategory, isAuditMode, activeCategory)` använder `selectedCategory ?? activeCategory?.id`. Vid **kontrollerad** kategori utifrån + tillfälligt avsaknad `activeCategory` är det rimligt; vid edge cases där prop och intern lista divergerar kan tint och hero hamna **osynkade** — låg sannolikhet men värt en snabb mental test: controlled mode från förälder.

### 3.4 `.j_to_agent` inkl. `1.txt`–`3.txt` i git

- **Commit `8ec3ded9`** checkar in stora agent-underlag + kritik. **Fördel:** reproducerbarhet, samma underlag för alla clones. **Risk:** repo-storlek och **PII/leakage** om framtida körningar råkar committa känsligt — håll `.gitignore` / commit-policy skarp (progress-filen nämner redan att inte allt ska in).

### 3.5 Worktree-synk

- Om Cursor-worktree ligger kvar på t.ex. **`ceaee87b`** ser lokala filer **gamla** `external-review-remediation-progress.md` ut trots att `origin/master` är på **~34%**. **Rekommendation:** checka ut `master` i den worktreen som ska spegla orchestratorn, eller `git pull`/ny worktree.

---

## 4. Validering

- **`npm run typecheck`** på uppdaterad `master` (`C:\Users\jakem\dev\projects\sajtmaskin`): **OK** (körd i samband med denna granskning).

---

## 5. Kort slutsats

Nya fasen **~34pct** levererar **`LandingBackground`**, **`data-landing-bg`**, och **scoped reduced-motion** för bakgrundslagren — det är ett **tydligt steg** mot `1.txt` punkt om semantisk bakgrund. Kritikfilerna **18/27/31pct** är i stor utsträckning **inhämtade** i koden; återstår mest **tillgänglighet utanför bakgrunden**, **tydligare fritext-profil**, och **nästa stora spår** (integration manifest / deploy, own-engine, scripts enligt progress).

---

*Fil: `34pct-n.md` — helhetsnivå ~34pct + unik bokstav.*
