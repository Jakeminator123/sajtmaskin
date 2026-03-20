# README.md

Reason: Setup and architecture context

```text
# Turso Per User Starter

A Next.js application that demonstrates how to use the [Turso](https://turso.tech) Platforms API to create a database per user.

![Turso Per User Starter Template](/app/opengraph-image.png)

## Demo

The app below uses a database per user, and is powered by Turso.

[https://turso-per-user-starter.vercel.app](https://turso-per-user-starter.vercel.app)

## Get Started

Deploy your own Turso powered platform in a few easy steps...

- [Create a Database](https://sqlite.new?dump=https%3A%2F%2Fraw.githubusercontent.com%2Fnotrab%2Fturso-per-user-starter%2Fmain%2Fdump.sql)

  - Once the database is created, you'll be presented with details about your database, and **Connect** details
  - Note down the following (you'll need these later):
    - Database name
    - Org name
    - Group Token (**Create Group Token** -> **Create Token**)
    - Platform API Token (**Create Platform API Token** -> **Insert memorable name** -> **Create Token**))

- [Sign up to Clerk](https://clerk.com)
  - Create a new application from the dashboard
  - Note down the following (you'll need these later):
    - Public key
    - Secret key
- [Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnotrab%2Fturso-per-user-starter&env=NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY,TURSO_API_TOKEN,TURSO_ORG,TURSO_DATABASE_NAME,TURSO_GROUP_AUTH_TOKEN&demo-title=Turso%20Per%20User%20Starter&demo-description=Create%20a%20database%20per%20user&demo-image=https://raw.githubusercontent.com/notrab/turso-per-user-starter/28373b4c9c74f814e3749525ee3d53b603176834/app/opengraph-image.png&demo-url=https%3A%2F%2Fturso-per-user-starter.vercel.app)
  - Add the following environment variables (from the details you noted down earlier):
    - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
    - `CLERK_SECRET_KEY` - Clerk secret key
    - `TURSO_API_TOKEN` - Platform API Token
    - `TURSO_ORG` - Org name
    - `TURSO_DATABASE_NAME` - Database name
    - `TURSO_GROUP_AUTH_TOKEN` - Group Token
  - Click **Deploy** and you're done!

_You may optionally set up webhooks to automate the creation of databases in the background &mdash; [learn more](https://github.com/notrab/turso-per-user-starter/wiki/Webhooks#using-webhooks-in-production)._

## Local Development

Start building your Turso powered platform

// ... truncated
```
