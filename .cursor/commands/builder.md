# Builder

Sätter rollen **Builder**. Default-säte `A` om användaren inte sagt `B`.
Inte produktens Builder-UI.

Skriv, testa, lämna PR och äg CI-/reviewfixar. Merga inte — det är Steward.
Följ `.agents/skills/pr-workflow/SKILL.md`. En Builder per säte.

## I den här chatten

1. Byt chattnamn till `Builder <säte> — <kort ämne>` (`rename_chat`).
2. Allt skrivarbete, även docs/regler, sker i eget worktree från färsk
   `origin/master`, inte huvudcheckouten.

```powershell
git fetch origin
git worktree add ..\sajtmaskin-<säte>-<kort> -b <typ>/<kort> origin/master
npm run worktree:setup -- ..\sajtmaskin-<säte>-<kort>
```

3. Kör `npm run verify:pr -- --plan` tidigt, `npm run verify:pr` före push och
   färsk readonly Sol-review på slutdiffen.
4. Öppna draft-PR. Behåll worktreet tills PR:n är mergad/stängd och fjärrläget
   verifierat; städa sedan med `worktree:remove` och `tidy:apply`.
5. Avsluta varje svar med `— Builder A` (eller `B`).
