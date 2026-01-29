# 🚀 START HÄR: Snabbguide för MCP-servern

## Vad är MCP-servern?

MCP-servern ger dig tillgång till projektets dokumentation (AI SDK, OpenAI, Vercel, v0) och verktyg för att logga fel.

## ⚡ Snabbstart (3 steg)

### 1. När ska du använda den?
- ✅ Du behöver söka i dokumentationen
- ✅ Du behöver läsa specifik dokumentation
- ✅ Du vill logga fel för framtida analys
- ✅ Du vill se vilka dokumentationskällor som finns

### 2. Vilket tool ska du använda?

| Vad du vill göra | Tool att använda |
|------------------|------------------|
| Söka i dokumentation | `search_docs` |
| Läsa specifik fil | `get_doc` |
| Se tillgängliga källor | `list_doc_sources` |
| Logga fel | `report_error` |
| Se tidigare fel | `list_errors` |

### 3. Var explicit i dina prompts!

**✅ Rätt:**
```
"Använd MCP-serverns search_docs tool för att söka efter 'streamText' i ai-sdk dokumentationen"
```

**❌ Fel:**
```
"Hitta information om streamText"
```

---

## 📚 Läs mer

- **WHEN-TO-USE-MCP.md** - Detaljerad guide om när och hur du ska använda MCP-servern
- **HOW-TO-UPDATE-DOCS.md** - Hur man laddar ner och uppdaterar dokumentation
- **EXAMPLES.md** - Praktiska exempel för olika scenarion
- **quick-reference.txt** - Snabböversikt över vanliga API:er och mönster
- **overview.txt** - Fullständig dokumentation om servern

---

## 💡 Viktiga tips

1. **Var alltid explicit**: Säg "Använd MCP-servern" eller "Använd search_docs"
2. **Börja med search**: Använd `search_docs` först, sedan `get_doc` för detaljer
3. **Använd rätt source**: Specificera källa (ai-sdk, openai, vercel, v0, local) när du vet
4. **Logga viktiga fel**: Använd `report_error` för att spara information

---

**Kom igång nu!** Be Cursor att "Använd MCP-serverns list_doc_sources tool för att se vad som finns tillgängligt"
