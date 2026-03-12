# package.json

Reason: Dependency and script verification

```text
{
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "db:seed": "npx tsx lib/db/seed.ts",
    "db:migrate": "npx tsx lib/db/migrate.ts"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.693.0",
    "@aws-sdk/lib-dynamodb": "^3.693.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@vercel/functions": "^3.3.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "dotenv": "^16.4.7",
    "lucide-react": "^0.468.0",
    "next": "^16.0.9",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.5.5",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.1",
    "csv-parser": "^3.0.0",
    "postcss": "^8.4.49",
    "prettier": "^3.7.4",
    "tailwindcss": "^3.4.16",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```
