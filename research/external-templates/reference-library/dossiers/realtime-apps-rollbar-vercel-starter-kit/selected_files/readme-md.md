# README.md

Reason: Setup and architecture context

```text
# Rollbar Next.js Starter Kit

**Ship faster with confidence** — A complete starter kit for integrating Rollbar error monitoring into your Next.js App Router application. Kickstart your error monitoring in minutes and ship with no worries.

**🌐 Public Demo**: This app can be deployed as a public demo where users can configure their own Rollbar tokens via the UI (stored in localStorage). Perfect for live demos, workshops, or self-service trials!

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frollbar%2Frollbar-vercel&repository-name=rollbar-vercel&demo-title=Rollbar%20Next.js%20Starter%20Kit&demo-description=A%20complete%20Next.js%20starter%20template%20with%20Rollbar%20error%20monitoring%20integration.%20Track%20errors%2C%20warnings%2C%20and%20events%20in%20real-time%20with%20an%20interactive%20demo%20interface%20powered%20by%20the%20App%20Router.&demo-image=https%3A%2F%2Fgithub.com%2Fuser-attachments%2Fassets%2F69dad8b0-85d5-4805-b956-c7579f2ac2aa&demo-url=https%3A%2F%2Frollbar-vercel.vercel.app&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22observability%22%2C%22productSlug%22%3A%22error-tracking%22%2C%22integrationSlug%22%3A%22rollbar%22%7D%5D)


<img width="1148" height="819" alt="Screenshot 2025-11-06 at 10 26 08 AM" src="https://github.com/user-attachments/assets/69dad8b0-85d5-4805-b956-c7579f2ac2aa" />

## What This Demonstrates

This demo app shows how to:
- Integrate Rollbar's browser SDK with Next.js App Router
- Send different types of events (info, warning, error, exception) to Rollbar
- Track sent events with item UUIDs, status, and timestamps
- Display event history in an interactive slideout panel
- Use client-side only event tracking (in-memory storage)
- Allow users to configure their own Rollbar tokens (for public demos)

**Note:** This app is designed to work as a **public demo** where users can configure their own Rollbar tokens without requiring environment variables or deployment configuration.

## Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager
- A Rollbar account with a client access token (post_client_item scope)

## Local Setup

### 1. Install Dependencies

```bash
cd rollbar-vercel
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

// ... truncated
```
