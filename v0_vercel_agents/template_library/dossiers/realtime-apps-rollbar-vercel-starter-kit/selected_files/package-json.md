# package.json

Reason: Dependency and script verification

```text
{
  "name": "rollbar-vercel",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:production": "next build && node scripts/upload-sourcemaps.js",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "next": "15.4.10",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "rollbar": ">=3.0.0-rc.1"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.20",
    "glob": "^13.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.18"
  }
}
```
