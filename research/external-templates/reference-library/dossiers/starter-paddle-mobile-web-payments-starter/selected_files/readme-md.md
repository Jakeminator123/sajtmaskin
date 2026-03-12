# README.md

Reason: Setup and architecture context

```text
# Paddle Mobile Web Payments Starter

[Paddle Billing](https://www.paddle.com/solutions/web-stores?utm_source=dx&utm_medium=paddle-in-app-checkout-starter) is the developer-first merchant of record. We take care of payments, tax, subscriptions, and metrics with one unified API that does it all.

This is a Next.js starter project for implementing marketing pages, including a pricing page, and Paddle checkout on Web for an iOS app.

As of April 30, 2025, Apple's updated App Store rules allow app developers to use third-party payment processors like Paddle for in-app purchases. This starter shows you how to implement a web-based checkout that can be opened from iOS apps.

Even though you're redirecting users to Web to complete their purchase, **Apple pay is still supported**.

## ⚡️ Instantly clone & deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPaddleHQ%2Fpaddle-mobile-web-payments-starter&env=APPLE_TEAM_ID,NEXT_PUBLIC_BUNDLE_IDENTIFIER,NEXT_PUBLIC_APP_REDIRECT_URL,NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,NEXT_PUBLIC_PADDLE_ENV)

## 🔦 About

This starter project provides a fully functional implementation of a Paddle checkout within a Next.js application that can be easily embedded into iOS apps.

## ✨ Features

- Global tax compliance — As a merchant of record, Paddle handles all tax calculations, collections, and remittances so you don't have to.
- Chargeback protection — Paddle manages chargebacks, combats fraud, and prevents card attacks, keeping your business secure.
- Lower fees than IAPs — Connect directly with your users to reduce fees while increasing customer lifetime value.
- Integrated with Paddle Retain — Minimize churn and maximize revenue with our comprehensive suite of retention tools.
- Buyer support included — Customers can self-serve through our portal, while Paddle handles all order inquiries.
- All-in-one payment platform — Enable new payment methods instantly without additional code or merchant accounts.

## 📦 Included packages

- Next.js 15
- `@paddle/paddle-js` for launching a checkout
- React 19
- TypeScript
- Tailwind CSS

## 🏁 Getting started

### Development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:30

// ... truncated
```
