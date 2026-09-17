# GitHub/ZIP-import — kvarvarande arbete efter #1433

> **Status: PR2 i #1446 mot `preview`.** Ingen produktionspromote.
> Handoff från coach 2026-09-17 efter att #1433 och #1439 mergats.
> Runtime-ägare för extract är
> [`src/lib/import/extract-imported-archive.ts`](../../../../src/lib/import/extract-imported-archive.ts).
> Init-kedjan ägs av
> [`src/app/api/engine/chats/init/route.ts`](../../../../src/app/api/engine/chats/init/route.ts).

## Syfte

Betja det som **faktiskt blev kvar** efter den mergade importkedjan. Öppna
inte #1433-identitet, handoff-latch, GitHub-ref, SSRF eller preview-containment
utan ny konkret reproduktion.

## Aktuellt läge

| Del | Läget |
|---|---|
| #1433 importkedja + P1-latch | Mergad till `preview` (`1ef89ca82`) |
| #1439 Builder-auth-grind | Mergad; rörs inte här |
| PR2 bilder + lokala fonts | **I #1446:** extractorn skriver `base64:` + `language: "binary"`. Extra assets hoppas över vid filtak/budget i stället för att fälla hela importen. |
| Server-side import-idempotens | Inte implementerad. Kräver atomisk claim/receipt; se `02`. Ingen ny DB-migration skapas här. |
| Privat-repo live-smoke | Inte kört. Inga `TEST_USER_*` i den här miljön. |

Save/reopen browser-smoke påstods PASS av arbetsledande/prepagent. Det syns
inte i koden och är inte omkört i denna PR.

## Ordning

1. PR2 binary assets/fonts — [`01-pr2-binary-assets-fonts.md`](01-pr2-binary-assets-fonts.md)
2. Separat senare PR: idempotens — [`02-server-side-import-idempotency.md`](02-server-side-import-idempotency.md)
3. Verifiering om credentials finns — [`03-private-repo-smoke.md`](03-private-repo-smoke.md)

Gör-inte-om: [`04-do-not-reopen.md`](04-do-not-reopen.md).
Ursprunglig agentprompt: [`05-agent-prompt.md`](05-agent-prompt.md).

## Den här PR:ns anmärkning

Koddelen levererar **PR2**. Idempotens och privat live-smoke är medvetet
kvar som residualer. Preview-host runtime ändras inte: materialisering av
`base64:` fanns redan. #1445 (workspace-jail) är inmergad från `preview`
men orörd i den här diffen.
