# ⚡ Snabbguide: Uppdatera AI SDK dokumentation

## Steg-för-steg

### 1. Gå till rätt mapp

```bash
cd services/mpc/docs
```

### 2. Ladda ner/uppdatera dokumentationen

```bash
python doc.py --auto "https://ai-sdk.dev/docs"
```

Detta kommer att:

- ✅ Ladda ner senaste dokumentationen från ai-sdk.dev
- ✅ Spara i `docgrab__ai-sdk.dev__docs/`
- ✅ Automatiskt indexera för MCP-servern

### 3. Sök i den nya dokumentationen

Efter att dokumentationen är nedladdad, använd MCP-servern:

```
"Använd MCP-serverns search_docs tool för att söka efter '[ditt ämne]'
med source 'ai-sdk'"
```

---

## 💡 Exempel: Sök specifikt i AI SDK

### Sök efter streaming

```
"Använd MCP-serverns search_docs tool för att söka efter 'streamText'
i ai-sdk dokumentationen. Använd source 'ai-sdk'."
```

### Sök efter generateText

```
"Använd MCP-serverns search_docs tool för att söka efter 'generateText'
med source 'ai-sdk' och limit 10."
```

### Läsa specifik fil

```
"Använd get_doc för att läsa
'docgrab__ai-sdk.dev__docs/llms/llms.txt'"
```

---

## 🔄 Uppdatera regelbundet

Dokumentationen ändras, så uppdatera den regelbundet (t.ex. varje vecka):

```bash
cd services/mpc/docs
python doc.py --auto "https://ai-sdk.dev/docs"
```

---

**Tips**: Efter uppdatering behöver MCP-servern startas om (eller vänta tills Cursor
startar den automatiskt) för att den nya dokumentationen ska bli sökbar.
