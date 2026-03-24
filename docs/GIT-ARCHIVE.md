# Arkiverade git-grenar

Äldre grenar på `origin` togs bort den **2026-03-24** för att bara behålla `main` och `master`.

Varje borttagen gren finns kvar som en **annoterad eller lättvikts-tag** under prefixet `archive/` med samma commit som grenens sista spets hade vid arkiveringen.

## Hitta en gammal gren

```bash
git tag -l 'archive/*'
git show archive/<grennamn-utan-origin-prefix>
```

Exempel: grenen `origin/Emil` arkiverades som taggen `archive/Emil` (eller motsvarande sökväg om grenen innehöll `/`).

## Återskapa en lokal gren från en arkiv-tag

```bash
git checkout -b återställd-namn archive/some/path
```
