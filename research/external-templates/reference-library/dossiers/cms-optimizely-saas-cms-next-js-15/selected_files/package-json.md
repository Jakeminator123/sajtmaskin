# package.json

Reason: Dependency and script verification

```text
{
  "name": "opti-masterclass",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "cross-env NODE_OPTIONS='--inspect' next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write .",
    "gen-types": "graphql-codegen -r dotenv/config --config ./codegen.yaml"
  },
  "lint-staged": {
    "*": "prettier --write --ignore-unknown"
  },
  "dependencies": {
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-slot": "^1.1.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.474.0",
    "negotiator": "^1.0.0",
    "next": "^15.2.8",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.1",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3",
    "@graphql-codegen/cli": "^5.0.4",
    "@graphql-codegen/typescript": "^4.1.3",
    "@graphql-codegen/typescript-generic-sdk": "^4.0.1",
    "@graphql-codegen/typescript-operations": "^4.4.1",
    "@types/negotiator": "^0.6.3",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "cross-env": "^7.0.3",
    "eslint": "^9",
    "eslint-config-next": "15.2.8",
    "lint-staged": "^15.4.3",
    "postcss": "^8",
    "prettier": "^3.4.2",
    "prettier-plugin-tailwindcss": "^0.6.11",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
```
