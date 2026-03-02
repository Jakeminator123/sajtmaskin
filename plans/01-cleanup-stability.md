# Plan 01 – Städ & stabilitet

Prioritet: **Hög**
Uppskattad insats: ~2–4 timmar

---

## 1. Konsolidera toast-bibliotek

**Status:** Ej gjort
**Problem:** Både `sonner` och `react-hot-toast` är installerade. Bara `react-hot-toast` används.

### Validering

- `sonner` importeras **enbart** i `src/components/ui/sonner.tsx` (wrapper). Ingen annan fil importerar den.
- `react-hot-toast` importeras i **23 filer** (se lista nedan).
- `<Toaster>` från `react-hot-toast` renderas i `src/app/builder/BuilderLayout.tsx`.

### Filer som importerar react-hot-toast

```
src/app/builder/BuilderLayout.tsx
src/app/builder/useBuilderCallbacks.ts
src/app/builder/useBuilderDeployActions.ts
src/app/builder/useBuilderEffects.ts
src/app/builder/useBuilderPageController.ts
src/app/builder/useBuilderPromptActions.ts
src/app/builder/useBuilderProjectActions.ts
src/app/buy-credits/page.tsx
src/app/category/[type]/page.tsx
src/app/page.tsx
src/app/projects/page.tsx
src/components/builder/ChatInterface.tsx
src/components/builder/InitFromRepoModal.tsx
src/components/builder/PreviewPanel.tsx
src/components/builder/SandboxModal.tsx
src/components/builder/VersionHistory.tsx
src/components/forms/prompt-input.tsx
src/components/landing-v2/chat-area.tsx
src/lib/hooks/useCssValidation.ts
src/lib/hooks/usePromptAssist.ts
src/lib/hooks/v0-chat/stream-handlers.ts
src/lib/hooks/v0-chat/useCreateChat.ts
src/lib/hooks/v0-chat/useSendMessage.ts
```

### Uppgifter

- [x] Byt alla `import toast from "react-hot-toast"` → `import { toast } from "sonner"` i samtliga 23 filer
- [x] Byt `<Toaster>` i `BuilderLayout.tsx` → `<Toaster>` från `@/components/ui/sonner`
- [x] Lägg till `<Toaster>` i `src/app/layout.tsx` för icke-builder-sidor (page.tsx, projects, buy-credits)
- [x] Verifiera att Sonner API matchar (success/error/loading/promise/dismiss)
- [x] `npm uninstall react-hot-toast`
- [x] Ta bort eventuella kvarvarande toast-importer

### API-skillnader att hantera

| react-hot-toast | sonner |
|-----------------|--------|
| `toast("msg")` | `toast("msg")` ✓ |
| `toast.success("msg")` | `toast.success("msg")` ✓ |
| `toast.error("msg")` | `toast.error("msg")` ✓ |
| `toast.loading("msg")` | `toast.loading("msg")` ✓ |
| `toast.promise(p, {...})` | `toast.promise(p, {...})` ✓ |
| `toast.dismiss(id)` | `toast.dismiss(id)` ✓ |
| `toast("msg", { icon: ... })` | `toast("msg", { icon: ... })` – delvis, kontrollera |

---

## 2. Uppdatera DEPS-STATUS.txt

**Status:** Inaktuell
**Problem:** Listar `@ai-sdk/anthropic` och `@ai-sdk/vercel` som inte finns i `package.json`.

### Validering

- `@ai-sdk/anthropic` finns **inte** i `package.json` och importeras ingenstans
- `@ai-sdk/vercel` finns **inte** i `package.json`, explicit markerad "EJ ANVÄND" i `v0-generator.ts`
- `gateway()` i AI SDK 6 hanterar Anthropic/Vercel-modeller direkt, ingen separat provider krävs

### Uppgifter

- [x] Ta bort `@ai-sdk/anthropic: ^3.0.23` från DEPS-STATUS.txt
- [x] Ta bort `@ai-sdk/vercel: ^2.0.19` från DEPS-STATUS.txt
- [x] Uppdatera "Senast uppdaterad" datum
- [x] Verifiera att övriga versioner matchar `package.json`

---

## 3. Uppdatera quick-reference.txt

**Status:** Inaktuell (senast uppdaterad 2026-01-06)
**Problem:** Refererar `gpt-4o-mini` och `gpt-4o` men projektet använder `gpt-5.2` via gateway.

### Validering

- `src/app/api/ai/chat/route.ts` använder `gateway("openai/gpt-5.2")` som default
- `src/app/api/ai/brief/route.ts` använder `gateway("openai/gpt-5.2")`
- `quick-reference.txt` listar `gpt-4o-mini` och `gpt-4o` som primära modeller

### Uppgifter

- [x] Uppdatera modellsektion: byt `gpt-4o-mini` → `gpt-5.2` som primär
- [x] Uppdatera v0 API-modeller: lägg till `v0-max-fast` och `v0-gpt-5`
- [x] Uppdatera AI SDK-exemplen till aktuella patterns (gateway)
- [x] Uppdatera "Last updated" datum

---

## 4. Fixa calls.txt-referens

**Status:** Saknas
**Problem:** `v0-prompt-guide.txt` refererar `schemas/calls.txt` som inte existerar.

### Validering

- `LLM/v0-prompt-guide.txt` refererar filen
- Filen finns inte i `LLM/` eller `LLM/schemas/`
- `schemas_overview.txt` nämner `calls.txt` som en fil som borde finnas

### Uppgifter

- [ ] Antingen: skriv `LLM/calls.txt` med aktuella API-flöden
- [x] Eller: ta bort referenserna till filen i `v0-prompt-guide.txt` och `schemas_overview.txt`

---

## 5. versions.pinned schema-mismatch

**Status:** Känd issue
**Problem:** Drizzle schema har NOT NULL men Supabase tillåter NULL.

### Validering

- `src/lib/db/schema.ts`: `pinned` kolumn har `.default(false)` (NOT NULL)
- Supabase tillåter NULL enligt DEPS-STATUS

### Uppgifter

- [x] Kör: `ALTER TABLE public.versions ALTER COLUMN pinned SET NOT NULL;` *(körd 2026-03-02, 0 NULL-rader)*
- [x] Verifiera att alla befintliga rader har ett värde – 109 rader, 0 NULL
- [x] Uppdatera Drizzle schema: `.default(false).notNull()`
