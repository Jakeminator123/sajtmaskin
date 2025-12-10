# Hur man använder OpenAI API-dokumentationen

## Var finns dokumentationen?

Dokumentationen ligger i: **`docs/OPENAI_API_LATEST_FEATURES.md`**

Detta är en komplett guide över de senaste OpenAI API-funktionerna som AI-modeller (som de i Cursor) kanske inte känner till.

## När ska du använda detta?

Använd detta dokument när:

- Du implementerar OpenAI API-funktioner
- AI-modellen ger föråldrad information om OpenAI API
- Du är osäker på vilken modell eller API-endpoint som ska användas
- Du behöver veta om nya funktioner som Responses API, Agents SDK, etc.

## Hur instruerar du AI-modeller att använda detta?

### Metod 1: Direktreferens i prompten

När du promptar en AI-modell (t.ex. i Cursor), lägg till detta:

```
Innan du föreslår någon OpenAI API-implementation, läs först:
docs/OPENAI_API_LATEST_FEATURES.md

Använd detta som referens för:
- Responses API (rekommenderas för nya projekt)
- Inbyggda verktyg (web_search, image_generation, etc.)
- Modellval (GPT-5, GPT-5.1-Codex, GPT-4.1, etc.)
- Bästa praxis och migreringsguider
```

### Metod 2: Specifik fråga

Om du har en specifik fråga om OpenAI API:

```
Jag vill implementera [funktion]. Läs docs/OPENAI_API_LATEST_FEATURES.md
och föreslå implementation baserat på de senaste API-mönstren där.
```

### Metod 3: Automatisk referens (för Cursor)

Cursor kan automatiskt läsa filer i projektet. Om AI-modellen ger föråldrad information, säg:

```
Du verkar använda föråldrade OpenAI API-mönster. Läs
docs/OPENAI_API_LATEST_FEATURES.md för att få den senaste informationen
om Responses API, Agents SDK, och nya modeller.
```

## Viktiga punkter att minnas

1. **Responses API** är det nya rekommenderade API:et (inte Chat Completions)
2. **Inbyggda verktyg** finns nu (`web_search`, `image_generation`, etc.)
3. **GPT-5.1-Codex** är för agentiska kodningsuppgifter, inte allmänt bruk
4. **Reasoning-modeller** använder `reasoning.effort` istället för `temperature`
5. **Alltid verifiera** mot officiella OpenAI-dokumentationen innan produktion

## Snabbreferens för AI-modeller

När du promptar AI-modeller, använd denna mall:

```
Använd Responses API (inte Chat Completions) för detta projekt.
Läs docs/OPENAI_API_LATEST_FEATURES.md för:
- Rätt modellval baserat på uppgiften
- Inbyggda verktyg som kan användas
- Bästa praxis för implementation
- Kostnadsoverväganden
```

## Exempel på användning

### Exempel 1: Implementera webbsökning

```
Jag vill lägga till webbsökning i min app. Läs
docs/OPENAI_API_LATEST_FEATURES.md och visa mig hur man använder
det inbyggda web_search-verktyget i Responses API.
```

### Exempel 2: Välja rätt modell

```
Jag behöver en modell för kodgenerering. Läs
docs/OPENAI_API_LATEST_FEATURES.md och rekommendera rätt modell
baserat på kostnad och prestanda.
```

### Exempel 3: Migrera från Chat Completions

```
Jag har kod som använder Chat Completions API. Läs
docs/OPENAI_API_LATEST_FEATURES.md och hjälp mig migrera till
Responses API.
```

## Var dokumentationen finns

- **Huvuddokument**: `docs/OPENAI_API_LATEST_FEATURES.md`
- **Denna guide**: `HOW_TO_USE_OPENAI_DOCS.md` (denna fil)

## Uppdateringar

Dokumentationen uppdateras när OpenAI släpper nya funktioner.
Verifiera alltid mot officiella docs: https://platform.openai.com/docs
