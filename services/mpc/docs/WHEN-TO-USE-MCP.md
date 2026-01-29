# När ska du använda MCP-servern?

## Enkelt och explicit guide

### 🎯 **NÄR SKA DU ANVÄNDA MCP-SERVERN?**

Använd MCP-servern när du behöver:

1. **Söka i projektets dokumentation**

   - När du behöver hitta information om API:er, bibliotek eller mönster
   - När du inte är säker på hur något fungerar
   - När du behöver exempel eller referenser

2. **Läsa specifik dokumentation**

   - När du vet vilken fil du behöver läsa
   - När du behöver fullständig dokumentation för ett ämne

3. **Logga fel för framtida analys**

   - När något går fel och du vill spara informationen
   - När du vill spåra problem över tid

4. **Se vilka dokumentationskällor som finns**
   - När du vill veta vad som är tillgängligt
   - När du planerar att söka i dokumentationen

---

### ✅ **EXEMPEL: När du SKA använda MCP-servern**

#### Exempel 1: Söka efter API-information

```
"Använd MCP-servern för att söka efter information om v0 API templates"
"Använd search_docs för att hitta hur man använder AI SDK streamText"
"Sök i dokumentationen efter OpenAI image generation"
```

#### Exempel 2: Läsa specifik dokumentation

```
"Använd get_doc för att läsa quick-reference.txt"
"Hämta dokumentationen om AI SDK från MCP-servern"
```

#### Exempel 3: Logga fel

```
"Logga detta fel i MCP error log: [beskrivning]"
"Använd report_error för att spara detta problem"
```

#### Exempel 4: Lista källor

```
"Visa mig vilka dokumentationskällor som finns tillgängliga"
"Använd list_doc_sources för att se vad som finns"
```

---

### ❌ **När du INTE behöver använda MCP-servern**

- När du redan vet svaret eller har informationen tillgänglig
- När du gör enkla kodändringar som inte kräver dokumentation
- När du arbetar med projektets egen kod (använd codebase search istället)

---

### 🚀 **SÅ HÄR ANVÄNDER DU MCP-SERVERN**

#### Steg 1: Identifiera när du behöver dokumentation

Tänk: "Behöver jag söka i extern dokumentation eller projektets dokumentation?"

#### Steg 2: Använd rätt tool

- **search_docs**: När du söker efter något
- **get_doc**: När du vet vilken fil du behöver
- **list_doc_sources**: När du vill se vad som finns
- **report_error**: När du loggar fel
- **list_errors**: När du vill se tidigare fel

#### Steg 3: Var explicit i dina prompts

Istället för: "Hitta information om v0"
Säg: "Använd MCP-serverns search_docs tool för att söka efter 'v0 API templates'"

---

### 📋 **QUICK REFERENCE**

| Behov                  | Tool att använda   | Exempel                                           |
| ---------------------- | ------------------ | ------------------------------------------------- |
| Söka i dokumentation   | `search_docs`      | "Använd search_docs för att hitta 'streamText'"   |
| Läsa specifik fil      | `get_doc`          | "Använd get_doc för att läsa quick-reference.txt" |
| Se tillgängliga källor | `list_doc_sources` | "Visa mig tillgängliga dokumentationskällor"      |
| Logga fel              | `report_error`     | "Logga detta fel: [beskrivning]"                  |
| Se tidigare fel        | `list_errors`      | "Visa mig de senaste 10 felen"                    |

---

### 💡 **TIPS**

1. **Var explicit**: Säg "Använd MCP-servern" eller "Använd search_docs" istället för att bara be om information
2. **Använd rätt source**: När du söker kan du specificera källa (ai-sdk, openai, vercel, v0, local)
3. **Börja med search**: Använd `search_docs` först, sedan `get_doc` för att läsa fullständig information
4. **Logga viktiga fel**: Använd `report_error` för att spara information som kan vara användbar senare

---

### 🔍 **PRAKTISKA EXEMPEL**

#### Exempel: Implementera en ny feature med AI SDK

```
1. "Använd MCP-serverns search_docs för att söka efter 'generateText' i ai-sdk dokumentationen"
2. "Använd get_doc för att läsa den fullständiga dokumentationen om generateText"
3. Implementera koden baserat på dokumentationen
4. Om något går fel: "Logga detta fel i MCP error log med komponent 'feature-implementation'"
```

#### Exempel: Felsöka ett problem

```
1. "Använd list_errors för att se de senaste felen"
2. "Använd search_docs för att hitta lösningar på detta problem"
3. "Logga lösningen i error log när problemet är löst"
```

---

**Kom ihåg**: MCP-servern är din vän när du behöver dokumentation eller vill logga information. Var inte rädd för att använda den!
