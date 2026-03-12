# README.md

Reason: Setup and architecture context

```text
# v0 clone

> **⚠️ Developer Preview**: This SDK is currently in beta and is subject to change. Use in production at your own risk.

<p align="center">
    <img src="./screenshot.png" alt="v0 Clone Screenshot" width="800" />
</p>

<p align="center">
    An example of how to use the AI Elements to build a v0 clone with authentication and multi-tenant support.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy Your Own</strong></a> ·
  <a href="#setup"><strong>Setup</strong></a> ·
  <a href="#getting-started"><strong>Getting Started</strong></a> ·
  <a href="#usage"><strong>Usage</strong></a>
</p>
<br/>

## Deploy Your Own

You can deploy your own version of the v0 clone to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fv0-sdk%2Ftree%2Fmain%2Fexamples%2Fv0-clone&env=V0_API_KEY,AUTH_SECRET&envDescription=Get+your+v0+API+key&envLink=https%3A%2F%2Fv0.app%2Fchat%2Fsettings%2Fkeys&products=%255B%257B%2522type%2522%253A%2522integration%2522%252C%2522protocol%2522%253A%2522storage%2522%252C%2522productSlug%2522%253A%2522neon%2522%252C%2522integrationSlug%2522%253A%2522neon%2522%257D%255D&project-name=v0-clone&repository-name=v0-clone&demo-title=v0+Clone&demo-description=A+full-featured+v0+clone+built+with+Next.js%2C+AI+Elements%2C+and+the+v0+SDK&demo-url=https%3A%2F%2Fclone-demo.v0-sdk.dev)

## Setup

### Environment Variables

Create a `.env` file with all required variables:

```bash
# Auth Secret - Generate a random string for production
# Generate with: openssl rand -base64 32
# Or visit: https://generate-secret.vercel.app/32
AUTH_SECRET=your-auth-secret-here

# Database URL - PostgreSQL connection string
POSTGRES_URL=postgresql://user:password@localhost:5432/v0_clone
# For Vercel Postgres, use the connection string from your dashboard

# Get your API key from https://v0.dev/chat/settings/keys
V0_API_KEY=your_v0_api_key_here

# Optional: Use a custom API URL
# V0_API_URL=http://localhost:3001/v1
```

### Database Setup

This project uses PostgreSQL with Drizzle ORM. Set up your database:

1. **Generate Database Schema**:

   ```bash
   pnpm db:generate
   ```

2. **Run Database Migrations**:

   ```bash
   pnpm db:migrate

// ... truncated
```
