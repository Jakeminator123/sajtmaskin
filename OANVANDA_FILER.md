# Oanvända Filer & Funktioner - Kan Tas Bort

Detta dokument listar filer, funktioner och dependencies som verkar vara oanvända eller ersatta av nyare implementationer. **Kontrollera noggrant innan radering!**

---

## 🔴 HÖG PRIORITET - Säkert Oanvända

### 1. `/app/src/app/api/generate/route.ts` - Gammal API Route

**Status**: ⚠️ **ERSATT** av `/api/orchestrate`

**Anledning**:

- Dokumentationen säger att `/api/orchestrate` är "universal gatekeeper"
- `ChatPanel` använder direkt `/api/orchestrate` (inte `/api/generate`)
- `generateWebsite()` i `api-client.ts` anropar `/api/generate` men används inte

**Verifiering behövs**:

```bash
# Sök efter användningar av /api/generate
grep -r "/api/generate" app/src
grep -r "generateWebsite" app/src
```

**Åtgärd**:

1. Verifiera att ingen kod anropar `/api/generate` direkt
2. Ta bort `/app/src/app/api/generate/route.ts`
3. Ta bort `generateWebsite()` från `/app/src/lib/api-client.ts` (behåll `generateFromTemplate()`)
4. Uppdatera dokumentationen i `api-client.ts` (rad 10-12)

**Filer att ta bort**:

- `/app/src/app/api/generate/route.ts` (~291 rader)

**Filer att uppdatera**:

- `/app/src/lib/api-client.ts` (ta bort `generateWebsite()` funktion, rad 86-222)

---

### 2. `generateWebsite()` funktion i `/app/src/lib/api-client.ts`

**Status**: ⚠️ **OANVÄND**

**Anledning**:

- `ChatPanel` använder direkt `/api/orchestrate` via `fetchWithStreaming()`
- Inga imports av `generateWebsite` hittades i koden
- Endast `generateFromTemplate` används (rad 57 i chat-panel.tsx)

**Verifiering behövs**:

```bash
# Sök efter användningar
grep -r "generateWebsite" app/src
grep -r "from.*api-client.*generateWebsite" app/src
```

**Åtgärd**:

1. Verifiera att ingen kod importerar/anropar `generateWebsite()`
2. Ta bort funktionen (rad 86-222 i `api-client.ts`)
3. Behåll `generateFromTemplate()` (den används!)

**Kod att ta bort**:

```typescript
// Rad 86-222 i api-client.ts
export async function generateWebsite(...) { ... }
```

---

## 🟡 MEDEL PRIORITET - Överväg Ta Bort

### 3. Sandpack Fallback i `/app/src/lib/code-parser.ts`

**Status**: ⚠️ **SÄLLAN ANVÄND** (endast fallback)

**Anledning**:

- Stor fil (~600+ rader)
- Används endast när `demoUrl` saknas från v0 API
- Dokumentation säger "Sandpack används sällan i praktiken"
- v0 API fungerar nästan alltid

**Användning**:

- `/app/src/components/builder/code-preview.tsx` (rad 30-31, 204-223, 655-768, 843-861)
- Används endast som fallback när `demoUrl` saknas

**Åtgärd**:

1. **Alternativ A**: Behåll som backup (säkrast)
2. **Alternativ B**: Flytta Sandpack-logik till separat fil (`sandpack-fallback.ts`)
3. **Alternativ C**: Ta bort helt om v0 API alltid fungerar (riskabelt)

**Rekommendation**: **Alternativ B** - Flytta till separat fil för bättre separation of concerns

**Filer att skapa**:

- `/app/src/lib/sandpack-fallback.ts` (flytta Sandpack-relaterad kod hit)

**Filer att uppdatera**:

- `/app/src/lib/code-parser.ts` (ta bort Sandpack-funktioner, behåll v0-funktioner)
- `/app/src/components/builder/code-preview.tsx` (uppdatera imports)

---

### 4. `@codesandbox/sandpack-react` Dependency

**Status**: ⚠️ **STOR DEPENDENCY** (~2MB) för sällan använd funktion

**Anledning**:

- Stort npm-paket (~2MB)
- Används endast som fallback i `code-preview.tsx`
- v0 API fungerar nästan alltid

**Användning**:

- `/app/src/components/builder/code-preview.tsx` (rad 38-42)

**Åtgärd**:

1. **Om Sandpack behålls**: Behåll dependency
2. **Om Sandpack tas bort**: Ta bort från `package.json`

**Rekommendation**: Behåll tills vidare (säkerhetsnät om v0 API skulle misslyckas)

**Filer att uppdatera** (om tas bort):

- `/app/package.json` (ta bort rad med `@codesandbox/sandpack-react`)

---

## 🟢 LÅG PRIORITET - Dokumentation/Uppdatering

### 5. Dokumentation i `/app/src/lib/api-client.ts`

**Status**: ⚠️ **FÖRÅLDRAD** dokumentation

**Problem**:

- Rad 10-12 dokumenterar `/api/generate` som huvudendpoint
- Verkligheten: `/api/orchestrate` är huvudendpoint

**Åtgärd**:

1. Uppdatera dokumentationen (rad 8-18)
2. Ta bort referenser till `/api/generate`
3. Fokusera på `/api/orchestrate` som huvudendpoint

**Filer att uppdatera**:

- `/app/src/lib/api-client.ts` (rad 8-34)

**Ny dokumentation** (förslag):

```typescript
/**
 * Frontend API Client
 * ====================
 *
 * Hanterar alla API-anrop från frontend till backend.
 * Backend kommunicerar sedan med v0 API (aldrig direkt från frontend).
 *
 * ENDPOINTS:
 *
 * POST /api/orchestrate → (används direkt i chat-panel)
 *   - Input: prompt, quality, existingChatId?, existingCode?, projectFiles?, mediaLibrary?
 *   - Output: code, files, demoUrl, chatId, versionId, webSearchResults?, generatedImages?
 *   - UNIVERSAL GATEKEEPER - alla prompts går härigenom
 *
 * POST /api/template → generateFromTemplate()
 *   - Input: templateId, quality
 *   - Output: template code + files + demoUrl
 *
 * GET /api/local-template?id=xxx → (används av chat-panel direkt)
 *   - Läser lokal mall från disk
 *   - Returnerar kod + filer + metadata
 */
```

---

## ✅ CHECKLISTA FÖR RADERING

### Steg 1: Verifiering

- [ ] Sök efter `/api/generate` i hela projektet
- [ ] Sök efter `generateWebsite` i hela projektet
- [ ] Testa att appen fungerar utan dessa filer
- [ ] Kontrollera att inga externa API:er anropar `/api/generate`

### Steg 2: Backup

- [ ] Skapa git branch: `git checkout -b cleanup/unused-files`
- [ ] Commit nuvarande state: `git commit -am "Backup before cleanup"`

### Steg 3: Radering

- [ ] Ta bort `/app/src/app/api/generate/route.ts`
- [ ] Ta bort `generateWebsite()` från `/app/src/lib/api-client.ts`
- [ ] Uppdatera dokumentationen i `api-client.ts`
- [ ] (Valfritt) Flytta Sandpack-logik till separat fil

### Steg 4: Testning

- [ ] Kör `npm run build` (ska fungera)
- [ ] Testa builder-flödet (skapa nytt projekt)
- [ ] Testa template-flödet (ladda template)
- [ ] Testa refinement (redigera befintligt projekt)
- [ ] Testa att fallback fungerar (om Sandpack behålls)

### Steg 5: Commit

- [ ] Commit ändringar: `git commit -am "Remove unused /api/generate endpoint and generateWebsite()"`
- [ ] Push till remote: `git push origin cleanup/unused-files`
- [ ] Skapa PR för review

---

## 📊 SAMMANFATTNING

| Fil/Funktion                    | Storlek    | Status           | Åtgärd                    |
| ------------------------------- | ---------- | ---------------- | ------------------------- |
| `/api/generate/route.ts`        | ~291 rader | 🔴 Ersatt        | **TA BORT**               |
| `generateWebsite()`             | ~137 rader | 🔴 Oanvänd       | **TA BORT**               |
| Sandpack i `code-parser.ts`     | ~600 rader | 🟡 Sällan använd | **FLYTTA** eller behåll   |
| `@codesandbox/sandpack-react`   | ~2MB       | 🟡 Fallback      | **BEHÅLL** (säkerhetsnät) |
| Dokumentation i `api-client.ts` | -          | 🟢 Föråldrad     | **UPPDATERA**             |

**Total bytes att spara**: ~291 rader kod + ~137 rader funktion = **~428 rader kod**

**Risk**: 🟢 **LÅG** - Dessa filer verkar inte användas, men verifiera noggrant!

---

## ⚠️ VIKTIGT

**INNAN RADERING**:

1. ✅ Verifiera att ingen kod använder dessa filer
2. ✅ Testa appen noggrant
3. ✅ Skapa backup/git branch
4. ✅ Testa i production-liknande miljö

**EFTER RADERING**:

1. ✅ Testa alla flöden (generation, refinement, templates)
2. ✅ Kontrollera att inga fel uppstår
3. ✅ Uppdatera dokumentationen

---

**Skapad**: 2025-01-XX  
**Senast uppdaterad**: 2025-01-XX
