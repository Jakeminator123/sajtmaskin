# Praktiska exempel: Använda MCP-servern

## Konkreta exempel för olika scenarion

### 📚 Exempel 1: Söka efter API-dokumentation

**Scenario**: Du behöver implementera bildgenerering med OpenAI.

**Steg 1**: Sök i dokumentationen

```
"Använd MCP-serverns search_docs tool för att söka efter 'image generation'
i OpenAI-dokumentationen. Använd source 'openai'."
```

**Steg 2**: Läsa fullständig dokumentation

```
"Använd get_doc för att läsa den fullständiga dokumentationen om
OpenAI image generation API."
```

**Steg 3**: Implementera baserat på dokumentationen

```
Implementera koden baserat på det du hittade i dokumentationen.
```

---

### 🔍 Exempel 2: Felsöka ett problem

**Scenario**: Något går fel och du vill hitta lösningar.

**Steg 1**: Kolla tidigare fel

```
"Använd list_errors för att se de senaste 10 felen.
Finns det något liknande problem?"
```

**Steg 2**: Sök efter lösningar

```
"Använd search_docs för att söka efter 'error handling'
eller '[ditt specifika fel]' i dokumentationen."
```

**Steg 3**: Logga lösningen

```
"Logga detta fel i MCP error log med:
- message: '[beskrivning av felet]'
- level: 'error'
- component: '[komponenten där felet uppstod]'
- context: { [extra information] }"
```

---

### 🚀 Exempel 3: Implementera ny feature med AI SDK

**Scenario**: Du ska implementera streaming text med AI SDK.

**Steg 1**: Sök efter relevant dokumentation

```
"Använd MCP-serverns search_docs för att söka efter 'streamText'
i ai-sdk dokumentationen. Använd source 'ai-sdk'."
```

**Steg 2**: Läsa quick reference

```
"Använd get_doc för att läsa quick-reference.txt och hitta
exempel på streamText-användning."
```

**Steg 3**: Implementera

```
Implementera streaming baserat på exemplen i dokumentationen.
```

**Steg 4**: Om något går fel

```
"Om något går fel, logga det med report_error:
- message: 'Streaming implementation failed'
- component: 'feature/streaming'
- context: { [relevant information] }"
```

---

### 📖 Exempel 4: Utforska tillgängliga dokumentationskällor

**Scenario**: Du vill veta vad som finns tillgängligt.

**Steg 1**: Lista källor

```
"Använd list_doc_sources för att se vilka dokumentationskällor
som finns tillgängliga och hur många filer varje källa har."
```

**Steg 2**: Välj relevant källa

```
Baserat på resultatet, välj rätt source när du söker:
- ai-sdk: För AI SDK 6 dokumentation
- openai: För OpenAI API dokumentation
- vercel: För Vercel platform dokumentation
- v0: För v0 API dokumentation
- local: För projektets egna dokumentation
```

---

### 🐛 Exempel 5: Logga och spåra fel över tid

**Scenario**: Du vill spåra ett återkommande problem.

**Steg 1**: Logga felet första gången

```
"Logga detta fel:
- message: 'Component X fails to render'
- level: 'error'
- component: 'components/X'
- context: {
    userAgent: '...',
    timestamp: '...',
    props: { ... }
  }"
```

**Steg 2**: Kolla tidigare förekomster

```
"Använd list_errors med limit 50 för att se om detta fel
har hänt tidigare. Sök efter 'Component X' i resultatet."
```

**Steg 3**: Sök efter lösningar

```
"Använd search_docs för att söka efter lösningar på
'component rendering errors' i dokumentationen."
```

---

### 💡 Exempel 6: Kombinera flera tools

**Scenario**: Du behöver komplett information om ett ämne.

**Steg 1**: Se vad som finns

```
"Använd list_doc_sources för att se tillgängliga källor."
```

**Steg 2**: Sök i flera källor

```
"Använd search_docs med source 'all' för att söka efter
'streaming' i alla dokumentationskällor."
```

**Steg 3**: Läsa de mest relevanta filerna

```
"Använd get_doc för att läsa de mest relevanta filerna
baserat på sökresultaten."
```

**Steg 4**: Logga viktig information

```
"Om du hittar något viktigt, logga det som info:
- message: 'Found important pattern: [beskrivning]'
- level: 'info'
- component: 'documentation/research'"
```

---

### ✅ Best Practices

1. **Var alltid explicit**
   - ✅ "Använd MCP-serverns search_docs tool"
   - ❌ "Hitta information om X"

2. **Använd rätt source**
   - Specificera source när du vet vilken källa du behöver
   - Använd "all" när du är osäker

3. **Börja med search, sedan get**
   - Använd `search_docs` först för att hitta relevanta filer
   - Använd sedan `get_doc` för att läsa fullständig information

4. **Logga viktiga händelser**
   - Använd `report_error` för fel, varningar och viktig information
   - Detta hjälper dig att spåra problem över tid

5. **Kombinera tools**
   - Använd `list_doc_sources` för att se vad som finns
   - Använd `search_docs` för att hitta information
   - Använd `get_doc` för att läsa detaljer
   - Använd `report_error` för att spara viktig information

---

**Kom ihåg**: MCP-servern är ett kraftfullt verktyg när du använder den explicit och korrekt!
