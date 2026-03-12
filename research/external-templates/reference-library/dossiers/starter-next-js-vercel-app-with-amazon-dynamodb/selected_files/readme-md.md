# README.md

Reason: Setup and architecture context

```text
# Amazon DynamoDB Movies Demo

This demo uses Amazon DynamoDB with Next.js to fetch movies from the database. It is able to securely connect to DynamoDB without using hardcoded access tokens through Vercel's [OIDC Federation](https://vercel.com/docs/security/secure-backend-access/oidc).

[![This is an alt text.](/public/Vercel-AWS-GitHub-DDB.png)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Faws-dynamodb-demo&project-name=aws-dynamodb-demo&repository-name=aws-dynamodb-demo&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22aws%22%2C%22productSlug%22%3A%22aws-dynamodb%22%2C%22protocol%22%3A%22storage%22%7D%5D)

**Demo:**
[View Demo](https://aws-dynamodb-demo.labs.vercel.dev)

**Getting Started:**
Click the "Deploy" button to clone this repo, create a new Vercel project, setup the AWS integration, and provision a new DynamoDB table:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Faws-dynamodb-demo&project-name=aws-dynamodb-demo&repository-name=aws-dynamodb-demo&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22aws%22%2C%22productSlug%22%3A%22aws-dynamodb%22%2C%22protocol%22%3A%22storage%22%7D%5D)

Once the process is complete, you can clone the newly created GitHub repository and start making changes locally.

## Requirements

- Installed Amazon DynamoDB. You can do that via [Vercel Marketplace](https://vercel.com/marketplace/aws)

## Local Setup

1. Pull vercel environment variables locally

```bash
vercel env pull
```

2. Install dependencies:

```bash
pnpm install
```

3. Seed the DynamoDB table with movie data:

```bash
pnpm run db:seed
```

4. Start the development server:

```bash
pnpm run dev
```

5. View local development: http://localhost:3000
```
