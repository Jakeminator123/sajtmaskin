# MCP Server Information & Test

**Datum**: 2025-01-XX  
**Server**: `app/services/mpc/server.mjs`  
**Status**: Konfigurerad men behöver startas för att användas

---

## 📋 MCP SERVER ÖVERSIKT

### Vad är MCP-servern?

MCP-servern (Model Context Protocol) ger AI-agenter (som mig i Cursor) tillgång till projektets dokumentation och error reporting. Den exponerar dokumentation från `app/services/mpc/docs/` som MCP resources som kan läsas direkt.

### Konfiguration

**Server-fil**: `app/services/mpc/server.mjs`  
**Start-kommando**: `npm run mpc` (från `app/` mappen)  
**Config-fil**: Skapa `.cursor/mcp.json` i projektroten med:

```json
{
  "mcpServers": {
    "sajtmaskin-docs": {
      "command": "node",
      "args": ["./app/services/mpc/server.mjs"],
      "env": {}
    }
  }
}
```

**Alternativt** (om du använder npm script):
```json
{
  "mcpServers": {
    "sajtmaskin-docs": {
      "command": "npm",
      "args": ["run", "mpc"],
      "cwd": "C:\\Users\\jakem\\Desktop\\sajtmaskin\\app",
      "env": {}
    }
  }
}
```

---

## 📚 TILLGÄNGLIGA RESURSER

Alla `.txt` och `.json` filer i `app/services/mpc/docs/` exponeras automatiskt som MCP resources med URI-formatet: `docs://local/{filnamn}`

### Lokal Dokumentation

| Resource URI | Fil | Beskrivning |
|--------------|-----|-------------|
| `docs://local/overview` | `overview.txt` | MCP server overview och konfiguration |
| `docs://local/error-playbook` | `error-playbook.txt` | Hur man rapporterar och spårar fel |
| `docs://local/docs-index` | `docs-index.txt` | Komplett dokumentationskarta för AI-agenter |

### Externa Dokument (Scraped)

| Resource URI | Fil | Beskrivning |
|--------------|-----|-------------|
| `docs://local/docgrab__vercel.com__docs/llms/llms` | `docgrab__vercel.com__docs/llms/llms.txt` | Vercel AI SDK dokumentation |
| `docs://local/docgrab__vercel.com__docs/llms/llms-full` | `docgrab__vercel.com__docs/llms/llms-full.txt` | Vercel AI SDK (full) |
| `docs://local/docgrab__platform.openai.com__docs_overview/llms/llms` | `docgrab__platform.openai.com__docs_overview/llms/llms.txt` | OpenAI API dokumentation |
| `docs://local/docgrab__platform.openai.com__docs_overview/llms/llms-full` | `docgrab__platform.openai.com__docs_overview/llms/llms-full.txt` | OpenAI API (full) |

**OBS**: URI-formatet använder filnamnet utan extension. För undermappar kan strukturen variera.

---

## 🛠️ TILLGÄNGLIGA TOOLS

### 1. `report_error`

Loggar fel/events till lokal MPC-log.

**Input Schema**:
```typescript
{
  message: string;        // Kort sammanfattning (required)
  level?: "error" | "warn" | "info";  // Default: "error"
  stack?: string;        // Stack trace om tillgängligt
  component?: string;    // UI/screen eller service name
  user?: string;         // User/account ID (undvik secrets)
  context?: Record<string, any>;  // Extra data (inputs, feature flags, etc.)
}
```

**Output**:  
- Bekräftelse med timestamp
- Entry sparas i `app/services/mpc/logs/error-log.jsonl`

**Exempel**:
```json
{
  "message": "Audit PDF rendering failed",
  "level": "error",
  "stack": "<stacktrace>",
  "component": "audit/pdf-report",
  "context": {"projectId": "abc123", "template": "light"}
}
```

---

### 2. `list_errors`

Hämtar senaste fel-entries från loggen.

**Input Schema**:
```typescript
{
  limit?: number;  // Antal entries (1-50, default: 10)
}
```

**Output**:  
- Lista med senaste fel-entries
- Formaterad text-sammanfattning
- Structured content med alla entries

**Exempel**:
```json
{
  "limit": 20
}
```

---

## 📁 LOGG-FILER

**Plats**: `app/services/mpc/logs/error-log.jsonl`  
**Format**: JSONL (en JSON-objekt per rad)  
**Rotation**: Auto-roterar vid 500 entries (behåller senaste 500)

**Exempel entry**:
```json
{"message":"Failed to parse template","level":"error","timestamp":"2025-01-XXT...","component":"template-loader","context":{"templateId":"xyz"}}
```

---

## 🔍 TESTNING

### Test 1: Lista tillgängliga resurser

När MCP-servern är startad och konfigurerad i Cursor, kan du be mig:
- "Visa mig alla tillgängliga MCP resources"
- "Läs MCP resource docs://local/overview"
- "Vad finns i docs-index?"

### Test 2: Läsa dokumentation

Jag kan läsa dokumentation direkt från MCP-servern:
- "Läs error-playbook från MCP-servern"
- "Visa mig Vercel AI SDK dokumentation från MCP"

### Test 3: Rapportera fel

Jag kan använda `report_error` tool:
- "Rapportera ett fel: [beskrivning]"
- "Logga en varning: [beskrivning]"

### Test 4: Lista fel

Jag kan använda `list_errors` tool:
- "Visa mig senaste 10 felen"
- "Lista alla fel från loggen"

---

## ⚠️ VIKTIGT

### Servern måste startas

MCP-servern måste vara startad och konfigurerad i Cursor för att jag ska kunna använda den. Om `list_mcp_resources` returnerar inga resurser, betyder det att:

1. Servern inte är startad
2. Konfigurationen saknas eller är felaktig
3. Cursor har inte laddat om efter konfigurationsändringar

### Konfigurationssteg

1. Skapa `.cursor/mcp.json` i projektroten (om den inte finns)
2. Lägg till konfigurationen (se ovan)
3. Starta om Cursor
4. Verifiera att servern startar (kolla Cursor's MCP output)

---

## 📊 STATUS

**Nuvarande status**:  
- ✅ Server-fil finns: `app/services/mpc/server.mjs`
- ✅ Dokumentation finns: `app/services/mpc/docs/`
- ✅ npm script finns: `npm run mpc`
- ⚠️ Konfiguration: `.cursor/mcp.json` behöver skapas/kontrolleras
- ⚠️ Server-status: Okänd (behöver startas för att testa)

**Tillgängliga dokument**:
- `overview.txt` - MCP server overview
- `error-playbook.txt` - Error reporting guide
- `docs-index.txt` - Documentation index
- `docgrab__vercel.com__docs/llms/*.txt` - Vercel AI SDK docs
- `docgrab__platform.openai.com__docs_overview/llms/*.txt` - OpenAI API docs

---

**Skapad**: 2025-01-XX  
**Senast uppdaterad**: 2025-01-XX

