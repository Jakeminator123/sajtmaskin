# README.md

Reason: Setup and architecture context

```text
# NextJs SaaS Starter Template

<img width="1122" alt="image" src="https://github.com/user-attachments/assets/63e761c4-aece-47c2-a320-f1cc18bf916b">

<img width="920" alt="image" src="https://github.com/user-attachments/assets/55384d22-cd09-46e4-b92d-e535b7d948fd">
<img width="1115" alt="image" src="https://github.com/user-attachments/assets/9ec724e6-d46f-4849-a790-efca329d1102">
<img width="1115" alt="image" src="https://github.com/user-attachments/assets/c5c1a61b-7ff3-49fd-9dea-8104026dd1e6">
<img width="1141" alt="image" src="https://github.com/user-attachments/assets/06559a5a-ca19-40bb-bf00-d3d2cbd94ee1">


This is the ultimate [Next.js](https://nextjs.org/) SAAS starter kit that includes a landing page, integrations with Supabase auth(Oauth, forget password, etc), PostgresDB with DrizzleORM and Stripe to collect payments, setup subscriptions and allow users to edit subscriptions/payment options.

- Full sign up/ sign in/ logout/ forget password/ password reset flow
- Oauth with Google and Github
- Utilize Stripe Pricing Table and Stripe Checkout to setup customer billing
- Integration with Stripe Customer Portal to allow users to manage billing settings
- Protected routes under /dashboard
- Drizzle ORM/Postgres integration
- Tailwind CSS/shadcn
- Stripe webhooks/ API hook to get customer current plan

## Getting Started

As we will be setting up both dev and prod environments, simply use `.env.local` to develop locally and `.env` for production environments

### Setup Supabase
1. Create a new project on [Supabase](https://app.supabase.io/)
2. ADD `SUPABASE_URL` and `SUPABASE_ANON_KEY` to your .env file
3.
![image](https://github.com/user-attachments/assets/c8eb5236-96f1-4824-9998-3c54a4bcce12)
4. Add `NEXT_PUBLIC_WEBSITE_URL` to let Supabase know where to redirect the user after the Oauth flow(if using oauth).

#### Setup Google OAUTH Social Auth
You can easily set up social auth with this template. First navigate to google cloud and create a new project. All code is written. You just need to add the `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to your `.env` file.

1. Follow these [instructions](https://supabase.com/docs/guides/auth/social-login/auth-google?queryGroups=environment&environment=server) to set up Google OAuth.

#### Setup Github OAUTH Social Auth
You can easily set up social auth with th

// ... truncated
```
