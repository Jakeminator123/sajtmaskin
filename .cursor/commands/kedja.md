# /kedja — stegad buggfix-pipeline

Kör **en** bugg genom sju steg. Steg 2 (failande test) gör domen mekanisk.
**Fix mode** — skriver kod i **egna worktrees**, aldrig i huvudcheckouten.
Vinnaren committas på sin kedja-branch; ingen push/PR utan begäran.

**Fulltext (steg, prompts, dom, efter körning):** läs
[`.cursor/skills/kedja-fix-pipeline/SKILL.md`](../skills/kedja-fix-pipeline/SKILL.md)
— den här filen är bara orkestrator-stub. Ladda inte om samma recept två gånger.

## Argument

| Kommando | Betyder |
|---|---|
| `/kedja <bugg eller backlog-rad>` | kör pipelinen på den buggen |
| `/kedja` | fråga användaren vilken bugg — välj aldrig själv |
| `... kandidater=3` | 3 fix-kandidater i steg 5 i stället för 2 |

Modellslug: [`.cursor/README.md` § Modellval](../README.md#modellval-för-subagenter-kanonisk-tabell) — `<grok-4.5>` upplöst mot sessionens `cursor-grok-4.5*`.

## Delegerat läge — STANDARD för dyra orkestratorer

1. Du: **steg 0** (bugg + acceptanskommando + utanför scope) — visa för användaren.
2. En Grok-runner läser **skillen** och kör steg 1–6; returnerar **bara** sluttabellen.
3. Du: **steg 7** (bugbot), läs testdiffen själv, committa vinnare, riv förlorare (se skill § After the run).

Själv köra alla steg: bara om orkestratorn redan är Grok/billig, eller ägaren ber om det.

## Stoppvillkor

Avbryt och rapportera när: acceptans saknas · rött test är grönt på orörd kod · ingen enig rotorsak efter en omkörning · ingen grön kandidat efter en extra runda · scope > buggen / protected paths / >10 filer.

## Steg 0 (orkestratorn)

- **Bugg:** en mening + `fil:rad`.
- **Acceptans:** `npx vitest run <fil>` (rött nu → grönt efter).
- **Utanför scope:** vad du inte rör.
- Regen av genererad vy efter ägar-edit = synk-plikt, inte scope-brott (`workflow.mdc`).
- Från backlog: läs raden ordagrant (kolumnen "Beslut / nästa steg").
