# README.md

Reason: Setup and architecture context

```text
# Next.js Auth Starter Template

## Motivation

Implementing authentication in Next.js, especially Email+Password authentication, can be challenging. NextAuth intentionally limits email password functionality to discourage the use of passwords due to security risks and added complexity. However, in certain projects, clients may require user password authentication. Lucia offers a flexible alternative to NextAuth.js, providing more customization options without compromising on security. This template serves as a starting point for building a Next.js app with Lucia authentication.

## Lucia vs. NextAuth.js

Lucia is less opinionated than NextAuth, offering greater flexibility for customization. While Lucia involves more setup, it provides a higher degree of flexibility, making it a suitable choice for projects requiring unique authentication configurations.

## Key Features

- **Authentication:** 💼 Support for Credential and OAuth authentication.
- **Authorization:** 🔒 Easily manage public and protected routes within the `app directory`.
- **Email Verification:** 📧 Verify user identities through email.
- **Password Reset:** 🔑 Streamline password resets by sending email password reset links.
- **Lucia + tRPC:** 🔄 Similar to NextAuth with tRPC, granting access to sessions and user information through tRPC procedures.
- **E2E tests:** 🧪 Catch every issue before your users do with comprehensive E2E testing.
- **Stripe Payment:** 💳 Setup user subscriptions seamlessly with stripe.
- **Email template with react-email:** ✉️ Craft your email templates using React.
- **PostgreSQL Database:** 🛢️ Utilize a PostgreSQL database set up using Drizzle for enhanced performance and type safety.
- **Database Migration:** 🚀 Included migration script to extend the database schema according to your project needs.

## Tech Stack

- [Next.js](https://nextjs.org)
- [Lucia](https://lucia-auth.com/)
- [tRPC](https://trpc.io)
- [Drizzle ORM](https://orm.drizzle.team/)
- [PostgreSQL](https://www.postgresql.org/)
- [Stripe](https://stripe.com/)
- [Tailwind CSS](https://tailwindcss.com)
- [Shadcn UI](https://ui.shadcn.com/)
- [React Hook Form](https://www.react-hook-form.com/)
- [React Email](https://react.email/)
- [Playwright](https://playwright.dev/)

## Get Started

1. Clone this repository to your local machine.
2. Copy `.env.example` to

// ... truncated
```
