# Verifiering – privat GitHub-repo

Endast smoke om credentials redan finns säkert. Ingen ny arkitektur.

## Test på aktuell preview

1. Logga in med befintligt testkonto som har GitHub anslutet.
2. Importera ett litet privat repo.
3. Verifiera nytt project/chat/version.
4. Verifiera att GitHub zipball-access fungerar.
5. Verifiera preview.
6. Save/reopen.
7. Kontrollera att tokens inte exponeras i UI/logg.

PASS: dokumentera SHA + repo-typ + steg, ingen kod.

FAIL: smal separat PR för exakt repro. Blanda inte in PR2/idempotens om felet
är authspecifikt.

## Status i denna kod-PR

Inte kört. Inga `TEST_USER_*` i moln-VM:en. Enhetstester för privat zipball
finns redan i `github-import-transport.test.ts`.
