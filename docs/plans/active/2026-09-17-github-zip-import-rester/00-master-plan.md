# GitHub/ZIP-import — kvarvarande arbete efter #1433

> **Status: PR2 landad på `preview` via #1461 (`7c606b11`).** #1446 stängd
> som superseded. Kvar i den här mappen: idempotens (`02`) och privat
> live-smoke (`03`). Ingen produktionspromote.
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
| PR2 bilder + lokala fonts | **DONE** #1461. Extractorn skriver `base64:` + `language: "binary"`. Extra/för stora assets hoppas över mot preview-hostens transporttak (2/12 MiB). Boot-smoke PASS på PR-tråden (körbar Next, save→leave→reopen). |
| Server-side import-idempotens | Inte implementerad. Kräver atomisk claim/receipt; se `02`. Ingen ny DB-migration skapas här. |
| Privat-repo live-smoke | Inte kört. Inga `TEST_USER_*` i den här miljön. |

## Ordning

1. PR2 binary assets/fonts — landad #1461. Kontrakt: [`01-pr2-binary-assets-fonts.md`](01-pr2-binary-assets-fonts.md)
2. Separat senare PR: idempotens — [`02-server-side-import-idempotency.md`](02-server-side-import-idempotency.md)
3. Verifiering om credentials finns — [`03-private-repo-smoke.md`](03-private-repo-smoke.md)

Gör-inte-om: [`04-do-not-reopen.md`](04-do-not-reopen.md).
Ursprunglig agentprompt: [`05-agent-prompt.md`](05-agent-prompt.md).

## Anmärkning efter #1461

PR2 är mergad. Idempotens och privat live-smoke är medvetet kvar som
residualer. Preview-host runtime ändrades inte: materialisering av
`base64:` fanns redan.

**P2 residual (samma på dagens kod):** host-totaltaket appliceras när en
binär övervägs. Text som kommer senare i ZIP-ordningen kan fortfarande
driva UTF-8-transport över 12 MiB. Samma klass som det äldre text/host-hålet
(textbudget 16 MiB). Inte merge-blocker; tvåpass byggs inte här.
