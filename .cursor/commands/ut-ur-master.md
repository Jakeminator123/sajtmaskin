# Ut ur master

Rutin när du står i **huvudcheckouten på `master`** och är på väg att ändra kod lokalt. Syftet är två saker: aldrig flytta HEAD i en checkout som delas med ägaren och andra agenter, och aldrig commit/push direkt till `master`. Kanoniska regler: [`agent-worktree.mdc`](../rules/agent-worktree.mdc) + [`git.mdc`](../rules/git.mdc).

Kör den innan första kodändringen — inte efteråt.

## 1. Läs läget

```powershell
git rev-parse --show-toplevel
git rev-parse --git-common-dir
git branch --show-current
git status --short
```

`--git-common-dir` som svarar `.git` betyder huvudcheckout; en sökväg in i `.git/worktrees/...` betyder att du redan står i en egen worktree.

| Läge | Vad det betyder |
| --- | --- |
| Huvudcheckout · `master` · rent | Du får läsa, söka och köra tester. Ska något **committas**: egen worktree. |
| Huvudcheckout · `master` · smutsigt | De ändringarna är ägarens eller en annan agents pågående arbete tills motsatsen bevisats. Rör dem inte, stage dem inte, stasha dem inte. Fråga. |
| Egen worktree · feature-branch | Kör på. Ingen fråga behövs. |
| Huvudcheckout · annan branch än `master` | Någon annan har flyttat HEAD. Flytta den **inte** tillbaka. Fråga. |

## 2. Behöver uppgiften ett eget spår?

| Uppgift | Egen worktree? |
| --- | --- |
| Läsa kod, svara på fråga, köra `typecheck`/tester | Nej |
| Ändra kod eller docs som ska committas | **Ja** |
| "Bara en rad" | **Ja** — storleken avgör inte, mergevägen gör |
| Lokalt experiment som ska kastas | Ja, så det inte blandas med ägarens ändringar |
| Läsa loggar, `gh pr view`, verifiera en PR | Nej |

## 3. Fråga innan du agerar

Ställ frågan som ett val (`AskQuestion`), inte som prosa:

1. **Skapa egen worktree + branch och jobba där** (rekommenderat).
2. **Jobba kvar i huvudcheckouten på `master`** — ägarens uttryckliga val. Du committar ändå aldrig till `master`; ändringarna måste flyttas ut innan de kan gå in.
3. **Bara läsa** — ingen ändring behövs.

Är checkouten smutsig får alternativ 1 aldrig föreslås utan att du samtidigt säger *hur* de befintliga ändringarna hanteras (steg 5).

## 4. Skapa spåret

```powershell
git worktree add ..\sajtmaskin-<slug> -b <fix|feat|chore|docs>/<slug>
node scripts/cursor/worktree.mjs link ..\sajtmaskin-<slug>
```

- `<slug>`: 2–4 ord, kebab-case, transliterera å→a, ä→a, ö→o.
- Worktreen ligger **bredvid** repo-roten, aldrig under `.cursor/`.
- Sätt aktiv branch-metadata (`SetActiveBranch`) så användarens diffvy följer arbetet.
- Städa alltid med `npm run worktree:remove -- ..\sajtmaskin-<slug>` — **aldrig** rå `git worktree remove` (den följer junction-länken och tömmer huvudcheckoutens `node_modules`).

## 5. Flytta redan gjorda ändringar ut ur master

Standardvägen är en patch, eftersom den lämnar huvudcheckouten exakt som den var:

```powershell
git diff > $env:TEMP\ut-ur-master.patch
Set-Location ..\sajtmaskin-<slug>
git apply $env:TEMP\ut-ur-master.patch
```

- **Ospårade (nya) filer följer inte med** i `git diff` — kopiera dem: `Copy-Item <fil> ..\sajtmaskin-<slug>\<fil>`.
- Stash-vägen (`git stash push -u -m "ut-ur-master-<tid>"` + `git stash apply` i worktreen) tar bort ändringarna ur ägarens vy → **bara på explicit OK**.
- Städa i huvudcheckouten först när worktreen är verifierad, och bara de filer du faktiskt flyttat: `git restore <path>`. Aldrig `git restore .`.

## 6. Förbjudet oavsett svar

- `git checkout`/`git switch` till en **befintlig** branch i huvudcheckouten.
- `git reset --hard`, lång rebase eller konfliktfylld merge där.
- `git add -A` — stage bara filer som hör till din uppgift.
- `git stash pop` utan att först läsa `git stash list`.
- Commit eller push direkt till `master`.

## 7. Rapportera

Branch, worktree-sökväg, vilka filer som flyttades, och vad som lämnades orört i huvudcheckouten.

## Undantag: ägaren

Ägaren äger huvudcheckouten och får jobba direkt i den. Den här rutinen gäller **agenter**. Ber ägaren dig uttryckligen att ändra kod "här och nu i master": bekräfta en gång, gör ändringen, och säg vad mergevägen blir — rutinen ersätter inte ägarens beslut, den skyddar mot att en agent tar beslutet åt hen.
