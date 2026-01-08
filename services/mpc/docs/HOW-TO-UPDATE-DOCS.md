# Hur man laddar ner och uppdaterar dokumentation

## 📥 Ladda ner/uppdatera dokumentation från ai-sdk.dev

### Snabbkommando

```bash
cd services/mpc/docs
python doc.py --auto "https://ai-sdk.dev/docs"
```

Detta kommer att:
1. Ladda ner den senaste dokumentationen från ai-sdk.dev
2. Spara den i mappen `docgrab__ai-sdk.dev__docs/`
3. Automatiskt indexera den så den blir sökbar via MCP-servern

### Alternativ: Ladda ner alla sidor

Om du vill ha ALLA sidor (kan ta lite längre tid):

```bash
cd services/mpc/docs
python doc.py --auto --all "https://ai-sdk.dev/docs"
```

### Alternativ: Bara startsidan

Om du bara vill ha startsidan:

```bash
cd services/mpc/docs
python doc.py --auto --start "https://ai-sdk.dev/docs"
```

---

## 🔍 Så här söker du specifikt i ai-sdk dokumentationen

### Metod 1: Använd `source` parametern

När du använder `search_docs`, specificera `source: "ai-sdk"`:

```
"Använd MCP-serverns search_docs tool för att söka efter 'streamText' 
med source 'ai-sdk'"
```

Detta kommer BARA söka i ai-sdk dokumentationen, inte i andra källor.

### Metod 2: Använd `get_doc` för specifik fil

Om du vet vilken fil du vill läsa:

```
"Använd get_doc för att läsa filen 
'docgrab__ai-sdk.dev__docs/llms/llms.txt'"
```

Eller om det finns markdown-filer:

```
"Använd get_doc för att läsa 
'docgrab__ai-sdk.dev__docs/md/docs_ai-sdk-core_streaming.md'"
```

---

## 📋 Praktiska exempel

### Exempel 1: Uppdatera och söka

```bash
# 1. Uppdatera dokumentationen
cd services/mpc/docs
python doc.py --auto "https://ai-sdk.dev/docs"

# 2. Starta om MCP-servern (om den körs)
# I Cursor: Servern startas automatiskt när den behövs
# Eller manuellt: npm run mpc

# 3. Sök i den nya dokumentationen
"Använd MCP-serverns search_docs tool för att söka efter 
'generateText' med source 'ai-sdk'"
```

### Exempel 2: Söka specifikt i ai-sdk

```
"Använd MCP-serverns search_docs tool för att söka efter 
'streaming responses' i ai-sdk dokumentationen. 
Använd source 'ai-sdk' och limit 10."
```

### Exempel 3: Se vad som finns i ai-sdk mappen

```
"Använd list_doc_sources för att se hur många filer som finns 
i ai-sdk dokumentationen"
```

Sedan kan du använda `get_doc` för att läsa specifika filer.

---

## 🎯 Tillgängliga sources

När du söker kan du använda dessa sources:

- `"ai-sdk"` - Bara AI SDK dokumentationen
- `"openai"` - Bara OpenAI dokumentationen  
- `"vercel"` - Bara Vercel dokumentationen
- `"v0"` - Bara v0 dokumentationen
- `"local"` - Bara lokala projektfiler
- `"all"` - Alla källor (standard)

---

## 💡 Tips

1. **Uppdatera regelbundet**: Dokumentationen ändras, så uppdatera den regelbundet
2. **Använd rätt source**: Specificera source när du vet vilken källa du behöver
3. **Börja med search**: Använd `search_docs` först för att hitta relevanta filer
4. **Läs sedan detaljer**: Använd `get_doc` för att läsa fullständig information

---

## 🔄 Uppdatera andra dokumentationskällor

Samma process fungerar för andra källor:

```bash
# OpenAI
python doc.py --auto "https://platform.openai.com/docs"

# Vercel
python doc.py --auto "https://vercel.com/docs"

# v0
python doc.py --auto "https://v0.dev/docs"
```

---

**Kom ihåg**: Efter att ha laddat ner ny dokumentation behöver du starta om MCP-servern 
(eller vänta tills Cursor startar den automatiskt) för att den nya dokumentationen ska 
bli sökbar.
