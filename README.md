# SajtMaskin - AI Website Builder

En modern plattform för att skapa webbplatser med AI-assistans, powered by v0 API.

## 🚀 Snabbstart

### Förutsättningar
- Node.js 18+ installerat
- v0 API-nyckel från [v0.dev](https://v0.dev/api)

### Installation

```bash
# 1. Installera dependencies
cd app
npm install

# 2. Konfigurera environment variables
# Kopiera credentials från config.env till app/.env.local
# (config.env är gitignored och innehåller alla API-nycklar)

# 3. Starta utvecklingsserver
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000)

## 📁 Projektstruktur

```
sajtmaskin/
├── app/                    # Next.js applikation
│   ├── src/
│   │   ├── app/           # Pages & API routes
│   │   ├── components/    # React komponenter
│   │   └── lib/           # Utilities & API clients
│   └── .env.local         # Environment variables (SKAPA DENNA)
├── config.env             # Mall för credentials (GITIGNORED)
├── info/                  # Dokumentation
└── PROGRESS.txt           # Utvecklingsstatus
```

## ✨ Funktioner

- ✅ **AI-generering**: Skapa webbplatser med naturligt språk
- ✅ **Live Preview**: Se resultat direkt i realtid
- ✅ **Kvalitetsnivåer**: Standard & Premium (v0-1.5-md/lg)
- ✅ **Komponenter**: Lägg till header, footer, pricing tables etc.
- ✅ **Export**: Ladda ner som ZIP
- ✅ **Mallar**: Förladdade templates från v0-communityt
- ✅ **Projektsystem**: Spara och återuppta arbete

## 🔑 Environment Variables

Skapa `app/.env.local` med följande innehåll:

```bash
# Obligatorisk
V0_API_KEY=din_v0_api_nyckel_här

# Valfria
OPENAI_API_KEY=din_openai_nyckel  # För framtida bildgenerering
REDIS_URL=redis://...             # För caching (prestanda)
```

**OBS:** Kopiera från `config.env` som innehåller alla credentials.

## 📊 Status

**Plattformen är fullt funktionell!** 🎉

### Färdigt (Fas 1-7):
- ✅ Startsida med kategorival
- ✅ Builder interface (Chat + Preview)
- ✅ v0 API integration via backend
- ✅ Live preview (iframe + Sandpack)
- ✅ Komponenter (ComponentPicker)
- ✅ Export (ZIP download)
- ✅ Lokala templates
- ✅ Projektsystem (SQLite)

### Återstår (Valfritt):
- ⚪ One-click deploy till Vercel

Se [PROGRESS.txt](PROGRESS.txt) för detaljerad status.

## 📖 Dokumentation

Fullständig dokumentation finns i [`info/`](info/) mappen:

- [`00_INDEX_READ_FIRST.txt`](info/00_INDEX_READ_FIRST.txt) - Start här
- [`PROGRESS.txt`](PROGRESS.txt) - Utvecklingsstatus
- [`config.env`](config.env) - API credentials (gitignored)

## 🔒 Säkerhet

- ✅ Alla API-anrop går via backend (inte från klient)
- ✅ API-nycklar är gitignored (`.env.local`, `config.env`)
- ✅ v0-branding är helt dold från användare
- ⚠️ **VIKTIGT**: Commita ALDRIG `config.env` eller `.env.local`

## 🛠️ Teknisk Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, ShadCN UI
- **State**: Zustand
- **Database**: SQLite (better-sqlite3)
- **AI**: v0 Platform API (v0-sdk)
- **Preview**: v0 demoUrl iframe + Sandpack fallback

## 📝 License

Private project.

