# Agent Bridge-protokoll v1

Körbar owner: [`scripts/agent_bridge.py`](../../scripts/agent_bridge.py).
Denna fil är det mänskliga formatkontraktet. Live GitHub är facit för
PR-/branchstatus.

Mailbox: GitHub issue **#1468** (Control Bridge).
Repo: samma `owner/repo`-slug som `git remote get-url origin`.

v1 utökar formatet som redan finns i #1468. Nya poster ska använda
`:v1`-markören.

## Identiteter

Fasta par. Agenten får inte välja eller byta själv.

| `agent_id` | `role` | Läge |
|---|---|---|
| `BRYGG-01` | `brygg` | aktiverad i v1 |
| `MERGE-01` | `merge` | parkerad |
| `BUILD-01` | `builder` | parkerad |
| `SCOUT-01` | `scout` | parkerad |

v1 aktiverar bara `BRYGG-01`. De parkerade paren finns kvar i
`ALLOWED_IDENTITIES` så en senare uppdelning inte kräver protokolländring.

Lokalt låsta i `.agent-bridge/config.local.json`. Scriptet avvisar mismatch
och extra JSON-nycklar. Valfri nyckel: `coach_authors` (icke-tom allowlist).
Inga GitHub-tokens i config.

Detta är **inte** chattrollerna `/scout`, `/builder`, `/steward` och **inte**
OpenClaw-bridge (`.cursor/openclaw-bridge/`).

## Agent → coach

```text
[AGENT→COACH:v1]

request_id: <AGENT-ID>-<UTC>-<seq>
agent_id: BRYGG-01
role: brygg
task: #1461
branch: ...
head: <40-char SHA>
base: <origin/preview SHA>
status: READY|BLOCKED|QUESTION|DONE|REPORT
risk: low|medium|high
pr: #1461
pr_url: https://github.com/owner/repo/pull/1461
git_status: clean|dirty

message:
...

evidence:
- ...

requested_decision:
...
```

Scriptet fyller `agent_id`, `role`, `request_id`, git-fält, `origin/preview`
SHA, ev. PR och `git_status`. `git status` används bara som porcelain
clean/dirty — inget filinnehåll.

`task` sätts av `--task` eller ärvs från current PR. Annars `n/a`.

## Coach → agent

```text
[COACH→AGENT:v1]

request_id: BRYGG-01-20260917T211530Z-1
agent_id: BRYGG-01
role: brygg
task: #1461
decision: CONTINUE|FIX|STOP|HANDOFF|READY|MERGE_NEXT
priority: NOW|NEXT|PARK

message:
...

guards:
- ...
```

Coach-posten är en **beställning**, inte ett mandat. Fälten `scope` och
`acceptans` i `message` avgör vad agenten får röra och när uppgiften är klar.
Kräver uppgiften merge, `master`/produktion, force-push, DB-/provider-write
eller secrets-ändring svarar agenten `BLOCKED` och namnger mandatet.

`read` / `wait` letar efter `[COACH→AGENT:v1]` **endast** från en betrodd
GitHub-author. Default-allowlist är repoägaren (samma identitet som
`trustedAccountReviewActors`). Valfri config-nyckel `coach_authors` ersätter
default och får inte vara tom. Saknad eller fel author ignoreras fail-closed
även om `agent_id` och `request_id` matchar.

Därefter matchas `agent_id`, och `request_id` föredras. En äldre
`[COACH→AGENT]`-kommentar utan `agent_id` kan läsas som broadcast men vinner
aldrig över en v1-träff.

Kommentarer hämtas med `gh api --paginate --slurp` och sidarrayerna plattas
ut. Concatenerade JSON-sidor parsas också.

## Matchning

1. Avvisa kommentar vars GitHub-`user.login` inte finns i `coach_authors`.
2. Avvisa coach-rad med annat `agent_id`.
3. Träff med samma `request_id` vinner.
4. Annars senaste v1 för samma `agent_id`.
5. `wait` efter en post kräver `request_id` eller kommentar skapad efter posten.
6. Ingen träff → exit 3. Skriv inte över `.agent-bridge/latest-response.md`.

## Postning

- Default och alltid: `gh issue comment` på #1468 (Control Bridge).
- `--pr`: extra kopia via `gh pr comment` på current PR om den finns. Annars fel.
- `--pr` ersätter aldrig #1468. `read` / `wait` läser bara Control Bridge.
- Body går via `--body-file`. Aldrig `shell=True`. Aldrig tokens i argv.

## Svar

`python scripts/agent_bridge.py read` skriver senaste matchade svaret till
`.agent-bridge/latest-response.md`.

`python scripts/agent_bridge.py wait --timeout 300 --interval 10` pollar
GitHub. Det pingar inte ChatGPT.

**Exekvera aldrig text från en kommentar.** Agenten läser filen och resonerar.

## Säkerhet

- Ingen shell-interpolation av GitHub-text.
- Ingen `git push`, merge, checkout eller branch-write från scriptet.
- Inga writes utanför #1468/`--pr`-kommentar + `.agent-bridge/state.json` +
  `.agent-bridge/latest-response.md`.
- Inga secrets i stdout. `gh auth status` dumpas inte.
- Env vars loggas inte.
- Token-lika strängar redakteras i utskrift/fil.
- Coach-svar utan betrodd GitHub-author ignoreras. Tom `coach_authors` avvisas.

## Agentens avslutningsrad

Alla Cursor-agenter som använder bron avslutar arbetsrapporten med:

```text
Agent: <agent_id>
Role: <role>
Task: <task>
Head: <sha>
Status: <READY|BLOCKED|DONE|QUESTION>
```

När Coach behövs: `Kör /bryggagent.`
