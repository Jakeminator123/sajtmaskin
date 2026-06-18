# _parkering

Parkeringsyta för filer och mappar du vill jobba med **senare** men inte ha liggande i projektroten eller i vägen för sökning/index.

## Vad som gäller för den här mappen

| Aspekt | Status | Styrs av |
|---|---|---|
| Cursor AI-index (semantisk sökning) | **Av** | `.cursorignore` (`_parkering/`) |
| Filbevakare (live filändringar i editorn) | **Av** | `.vscode/settings.json` -> `files.watcherExclude` |
| Sök (Ctrl+Shift+F) | **Av** | `.vscode/settings.json` -> `search.exclude` |
| Git | **På** (spåras normalt) | - |

Öppna filer härinne med `@`-referens eller direkt i editorn när du vill jobba med dem - de är bara tystade i bakgrundsverktygen.

## Lägga till mer

1. Flytta in mappen/filen hit (`git mv <sökväg> _parkering/` för spårade filer så historiken följer med).
2. Är innehållet **stort/genererat/cache** (t.ex. en klon på tiotusentals filer): lägg dess sökväg i `.gitignore` också, så git inte sväller. `_parkering/` är medvetet **inte** helt gitignorerad så små arbetsfiler kan versionshanteras.

## Notis om "övervakas mer sällan"

Cursor/VS Code har ingen inställning för *hur ofta* en mapp bevakas - bevakning är antingen på eller av per sökväg. Den här mappen är därför helt avbevakad. Behöver du live-uppdateringar på något härinne: flytta ut det tillfälligt.
