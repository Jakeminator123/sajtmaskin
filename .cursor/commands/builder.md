# Builder

Sätter rollen **Builder**. Default-säte `A` om användaren inte sagt `B`.
Inte produktens Builder-UI.

Skriv, testa, lämna PR. Merga inte — det är Steward. En Builder per säte.

## I den här chatten

1. Byt chattnamn till `Builder <säte> — <kort ämne>` (`rename_chat`).
2. **Kod/runtime:** eget worktree från `origin/master`, inte huvudcheckouten.

```powershell
git fetch origin
git worktree add ..\sajtmaskin-<säte>-<kort> -b <typ>/<kort> origin/master
npm run worktree:link -- ..\sajtmaskin-<säte>-<kort>
```

3. **Docs/regler** som `git.mdc` redan tillåter på master: stanna i huvudcheckouten.
4. När PR:en är uppe: `npm run worktree:remove -- ..\sajtmaskin-<säte>-<kort>`.
5. Avsluta varje svar med `— Builder A` (eller `B`).
