# FALLBACK VERSIONS

Known-good commits from approximately 24 hours ago (snapshot taken 2026-03-15).

> "Jag tror att det är 24 timmar sedan jag hade en version som var mycket bättre än den här."

## Versions

| Commit | Datum & tid | Meddelande | Status |
|--------|------------|------------|--------|
| `5eef955` | 2026-03-13 21:08:24 +0100 | Harden own-engine preview fidelity and diagnostics | Stabil grund |
| `51ee7ea` | 2026-03-13 22:24:46 +0100 | Polish preview diagnostics and autofix flow | Polerad autofix |
| `ef6e62a` | 2026-03-14 06:06:23 +0100 | **BRA** | Bekräftad bra av användaren |
| `e00fbde` | 2026-03-14 06:17:16 +0100 | Fix Swedish diacritics in preview and OpenClaw UI | Diakritik-fix |

## Rekommenderad fallback

`ef6e62a` -- "BRA" -- är den commit som användaren bekräftat fungerade bäst.

```bash
git checkout ef6e62a -- .
```

## Kontext

Mellan "BRA" och nuvarande HEAD har ~105 filer ändrats (~8 900 rader tillagda, ~5 600 borttagna).
Majoriteten är refaktoriseringar (preview-modul, post-checks-uppdelning, tester, D-ID-avatar, docs).
De kritiska fixarna (autofix dedupe, follow-up-frågor, tomma custom instructions) är ocommittade
och bör committas separat.

## Gateway-status (verifierad 2026-03-15)

- Vercel AI Gateway och OpenClaw Gateway är helt separata system.
- Ingen interferens möjlig: olika nycklar, URLer, kodvägar och strömmar.
- OpenClaw (`openclaw:sajtagenten`): gpt-5.1-codex / gpt-5.3-codex. Chat gratis, tips 2 credits.
