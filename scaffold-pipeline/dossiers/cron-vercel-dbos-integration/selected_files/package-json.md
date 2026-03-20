# package.json

Reason: Dependency and script verification

```text
{
  "name": "dbos-vercel-integration",
  "version": "0.5.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@dbos-inc/dbos-sdk": "^4.5.13",
    "@dbos-inc/otel": "^4.5.13",
    "@vercel/functions": "^3.3.4",
    "next": "^16.0.10",
    "react": "^19.2.3",
    "react-dom": "^19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.0.1",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```
