# Underhåll — kommandon du bör köra ibland

CI och `predev` tar det mesta. Det här är **manuella** knappar: gitignorerad
scratch, lokala worktrees, env-/DB-kollar och städ som medvetet _inte_ raderas
automatiskt (för att inte döda en pågående agentkörning).

`package.json` är alltid kanonisk källa om ett skript byter namn.
Detaljerad hygien: [`docs/runbooks/hygiene.md`](../docs/runbooks/hygiene.md).
Worktrees: [`docs/runbooks/git-worktree.md`](../docs/runbooks/git-worktree.md).

## Snabbmeny

| När                                        | Kör                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Före PR / “är diffen redo?”                | `npm run verify:pr -- --plan` + relevanta riktade kontroller     |
| Bred manuell underhållskoll                | `npm run hygiene` (manuell; CI kör de blockerande delarna)       |
| Disken växer / efter många agent-körningar | `npm run clean:scratch:apply`                                    |
| Efter `/kedja` eller trasiga worktrees     | `npm run kedja:clean` → sedan med `--yes`                        |
| Varje vecka eller efter många mergar       | `git fetch --prune`                                              |
| Efter ny migration lokalt                  | `npm run db:migrate` (+ prod via CI eller `db:migrate:prod`)     |
| Env känns fel                              | `npm run env:status`                                             |

---

## 1. Hygien och städ

### `npm run hygiene`

**Vad:** En knipsamling som _kontrollerar_ (docs-synk, länkar, planhistorik,
termer, bug-backlog-format, oimporterade filer) och _rapporterar_ vad
`clean:orphans` / `clean:scratch` _skulle_ ta bort. Tar **inte** bort scratch
själv (dry-run).

**När:** Som bred manuell kontroll, eller när du undrar om docs/död kod glidit
isär. Före PR visar `npm run verify:pr -- --plan` följdytorna; riktade lokala
kontroller ger snabb återkoppling och CI publicerar tung profil eller light-kvitto.
**Hur ofta:** Vid behov; annars ~1×/vecka.

### `npm run clean:scratch:apply`

**Vad:** Raderar gitignorerad scratch: `.cursor/swarms/runs` och
`logg-internet/runs` (behåller 3 nyaste, raderar äldre än 14 dagar),
`.cursor/kedja`, `.cursor/bugs`, handoffs, logg-dumps (max 2 mappar),
`.tmp`, m.m. Se `scripts/dev/clean-scratch.mjs`.

**När:** Efter `/automat`, många `/kedja`, eller när `.cursor/` / `logs/` känns
tunga. Förhandsgranska först med `npm run clean:scratch` (utan `:apply`).
**Hur ofta:** Efter intensiva agentsessioner, annars ~varannan vecka.

### `npm run clean:orphans`

**Vad:** Tar bort regenererbara syskon som git inte spårar (t.ex. `__pycache__`,
tomma mappar efter raderade träd). Dry-run: `npm run clean:orphans:dry`
(ingår i `hygiene`).

**När:** Efter stora filflyttar/raderingar, eller när `hygiene` visar orphans.
**Hur ofta:** Vid behov (inte rutin varje dag).

### `npm run kedja:clean`

**Vad:** Torrkörning som listar kvarlämnade kedja-worktrees/brancher. Faktisk
städ: `node scripts/cursor/kedja-clean.mjs --yes --keep ..\sajtmaskin-kedja-<slug>-a` —
`--keep` tar **worktree-sökväg** (inte branchnamn). **Inte** via `npm` (npm
äter flaggorna). Rör aldrig andras pågående worktrees utan `--keep`.

**När:** Efter avbruten `/kedja`, eller när `git worktree list` visar skräp.
**Hur ofta:** Efter varje kedja-körning som inte städades klart; annars månadsvis
koll.

---

## 2. Git och worktrees

### `git fetch --prune`

**Vad:** Hämtar remote och tar bort lokala `origin/*`-refs vars remote-branch
är raderad (efter merge).

**När:** Efter en merge-våg eller när `git branch -r` ser ut som ett museum.
**Hur ofta:** ~1×/vecka vid aktiv PR-trafik.

### `git worktree list`

**Vad:** Visar registrerade worktrees. Städ **aldrig** med rå
`git worktree remove` om `node_modules` är junction — använd
`npm run worktree:remove -- <sökväg>`.

**När:** Innan du skapar nya worktrees, eller när disk/projektsyskon känns
fula.
**Hur ofta:** Vid behov; efter periods med flera agenter.

### `npm run tidy` → exakt `FRI` → `npm run worktree:remove -- ..\sajtmaskin-<namn>`

**Vad:** Säker teardown (kopplar loss junction först). Kör först `npm run tidy`
från en worktree som ska behållas. Exakt målsökväg måste rapporteras som `FRI`:
ingen öppen PR, rent träd och exakt Git-/PR-mergebevis. Wrappern verifierar
samma livscykel igen och stoppar fail-closed om GitHub-status inte kan läsas.

`--force` är endast ett uttryckligt discardbeslut, aldrig normal städning. Det
kräver en tydlig `SAJTMASKIN_DISCARD_REASON`; rädda annars arbetet till en ny
branch/PR.

**När:** När en feature-/kedja-worktree är mergad eller övergiven.
**Hur ofta:** Direkt när jobbet är klart — låt dem inte ligga kvar “för säkerhets skull”.

---

## 3. Databas och env (lokalt)

### `npm run db:check` / `npm run db:migrate`

**Vad:** `db:check` = read-only sanity mot lokal/dev-DB. `db:migrate` applicerar
migrationer mot **dev** (inte prod). Prod körs i CI vid push till master, eller
medvetet via `npm run db:migrate:prod` (se
[`docs/runbooks/db-migrations.md`](../docs/runbooks/db-migrations.md)).

**När:** Efter ny fil under `src/lib/db/migrations/`, eller när lokal app klagar
på saknad kolumn.
**Hur ofta:** Vid migrationsarbete — annars sällan.

### `npm run env:status`

**Vad:** Översikt över vilka env-nycklar som finns/saknas lokalt vs policy.

**När:** “Varför funkar X inte lokalt?”, efter `vercel env pull`, eller ny
maskin/worktree.
**Hur ofta:** Vid env-problem; annars ~månadsvis.

### `npm run db:check-target -- --expect=dev`

**Vad:** Bekräftar att du pekar på **dev**-DB (etikett), inte prod av misstag.

**När:** Före manuella migrate/write-skript.
**Hur ofta:** Varje gång du är osäker på vilken databas shellen pratar med.

---

## 4. Domänvalidering (när du rört området)

| Kommando                        | Vad                                   | När                                          |
| ------------------------------- | ------------------------------------- | -------------------------------------------- |
| `npm run dossiers:validate-all` | Manifest/deps/SDK för Byggblock       | Efter dossier-ändring                        |
| `npm run scaffolds:validate`    | Scaffold-/variantkontrakt             | Efter scaffold-ändring                       |
| `npm run typecheck`             | TypeScript utan emit                  | Efter större TS-ändring (CI kör också)       |
| `npm run knip`                  | Full dödkodsrapport (många FP i deps) | Vid städpass — lita mest på **Unused files** |

Dessa ingår ofta i `devtest` / CI när du pushar — poängen med att köra lokalt är
**snabbare feedback** innan PR.

---

## 5. Medvetet _inte_ här

| Sak                                  | Varför                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm run build` / hela testsviten    | CI (`quality`, `build`, …) äger det på PR                                                                          |
| `prod-migrations-apply`              | CI på push till master                                                                                             |
| Rå `git worktree remove --force`     | Junction-fälla och saknar PR-livscykelbevis → kan både kasta agentarbete och tömma huvudcheckoutens `node_modules` |
| Att lägga `clean:scratch:apply` i CI | Scratch är lokal/agent-specifik; risk att radera mitt i körning                                                    |

---

## Minimal veckorutin (ägare)

```powershell
npm run verify:pr -- --plan  # på en aktiv PR-branch
npm run hygiene              # valfri bred veckokoll
npm run clean:scratch:apply   # om hygiene/scratch-dry visar mycket
git fetch --prune
git worktree list             # ta bort övergivna med worktree:remove
```

Efter en tung agentvecka: lägg till `npm run kedja:clean` och följ upp med
`node scripts/cursor/kedja-clean.mjs --yes --keep ..\sajtmaskin-kedja-<slug>-a`
(worktree-sökväg, inte branchnamn).
