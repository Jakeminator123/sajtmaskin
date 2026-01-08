# Scripts

## download-docs.py

Ett enkelt Python-skript för att ladda ner dokumentation till MCP-servern.

### Användning

```bash
python scripts/download-docs.py
```

Skriptet frågar interaktivt efter en URL och laddar ner dokumentationen till 
`services/mpc/docs/` där MCP-servern automatiskt kan använda den.

### Exempel

När du kör skriptet:

```
📥 URL: https://ai-sdk.dev/docs
```

Skriptet kommer att:
1. Ladda ner dokumentationen från URL:en
2. Spara den i `services/mpc/docs/docgrab__[domän]__[sökväg]/`
3. Göra den sökbar via MCP-serverns `search_docs` tool

### Tips

- Ange fullständig URL (t.ex. `https://ai-sdk.dev/docs`)
- Dokumentationen indexeras automatiskt av MCP-servern
- Starta om MCP-servern (eller vänta tills Cursor startar den) för att den nya dokumentationen ska bli sökbar

### Vanliga dokumentationskällor

- `https://ai-sdk.dev/docs` - AI SDK dokumentation
- `https://platform.openai.com/docs` - OpenAI API dokumentation
- `https://v0.dev/docs` - v0 API dokumentation
- `https://vercel.com/docs` - Vercel platform dokumentation
