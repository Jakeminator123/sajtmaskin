# README.md

Reason: Setup and architecture context

```text
![Next.js with MongoDB and Better Auth](./public/og.png)

-> View demo: [mongodb-news-template-nextjs.vercel.app](https://mongodb-news-template-nextjs.vercel.app/)

# Next.js with MongoDB and Better Auth

A modern full-stack template for building React applications using Next.js, MongoDB, and Better Auth for authentication. Features a Hacker News-style post submission and voting system with optimistic updates, server actions, and email/password authentication.

## Features

- **🔐 Authentication**: Email/password authentication with Better Auth
- **📝 Post System**: Hacker News-style post submission and voting
- **⚡ Optimistic Updates**: Real-time UI updates with React's useOptimistic
- **🎨 Modern UI**: Built with shadcn/ui and Tailwind CSS
- **📱 Responsive Design**: Mobile-first design with dark mode support
- **🗄️ MongoDB Integration**: Native MongoDB driver with optimized queries
- **🔄 Server Actions**: Form handling without client-side API calls
- **📊 Real-time Status**: Database connection monitoring
- **🚀 Production Ready**: TypeScript, ESLint, and Vercel deployment optimized

## Getting Started

Click the "Deploy" button to clone this repo, create a new Vercel project, setup the MongoDB integration, and provision a new MongoDB database:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmongodb-developer%2Fnextjs-news-template-mongodb&project-name=mongodb-news-nextjs&repository-name=mongodb-news-nextjs&demo-title=MongoDB%20%26%20Next.js%20Auth%20Starter%20Template&demo-description=A%20minimal%20template%20for%20building%20full-stack%20React%20applications%20using%20Next.js%2C%20Vercel%2C%2C%20Better%20Auth%20and%20MongoDB.&demo-url=https%3A%2F%2Fnews.mongodb.com&demo-image=https%3A%2F%2Fnews.mongodb.com%2Fog.png&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22mongodbatlas%22%2C%22productSlug%22%3A%22atlas%22%2C%22protocol%22%3A%22storage%22%7D%5D&env=BETTER_AUTH_SECRET&envDescription=Generate%20a%20random%20secret%20by%20clicking%20here%20%E2%86%92%20&envLink=https%3A%2F%2Fgenerate-secret.vercel.app%2F32)

## Local Setup

### Installation

Install the dependencies:

```bash
npm install
```

### Development

#### Create a .env file in the project root

```bash
cp .env.example .env
```

#### Configure envi

// ... truncated
```
