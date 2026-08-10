# _parkering

Parkeringsyta för filer du vill behålla i git **utan** att de stör sökning/index.
**Inte** source of truth — runtime läser inte härifrån.

## Agenter

- **Läs inte** den här mappen som bakgrund. Öppna bara en fil om användaren
  uttryckligen pekar på den.
- Utfasade dossier-träd är **borttagna** (2026-08-10). Återställ via
  git-historik (`data/dossiers/hard|soft/<id>/` före parkeringen) +
  `docs/plans/avklarat/README.md` (dossier-förenkling).
- Gamla dump-MD (handoff/research) är **borttagna** (2026-08-10). Återställ
  via git-historik om någon behöver dem.

## Vad som gäller

| Aspekt | Status | Styrs av |
|---|---|---|
| Cursor AI-index | **Av** | `.cursorindexingignore` (`_parkering/`) |
| Filbevakare | **Av** | `.vscode/settings.json` → `files.watcherExclude` |
| Sök (Ctrl+Shift+F) | **Av** | `.vscode/settings.json` → `search.exclude` |
| Git | **På** (spåras normalt) | - |

## Lägga till mer

1. `git mv <sökväg> _parkering/` för spårade filer.
2. Stort/genererat innehåll: lägg dess sökväg i `.gitignore` också.
