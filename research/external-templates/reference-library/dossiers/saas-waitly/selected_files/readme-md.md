# README.md

Reason: Setup and architecture context

```text
<h1>Next.js + Notion Waitlist Template</h1>

![Waitly](/src/app/opengraph-image.png)

<p>
  Quickly launch a sleek waitlist page for your next project! This template leverages the power of Next.js, uses Notion as a simple CMS, incorporates Upstash Redis for rate limiting, and sends emails via Resend with your custom domain.
</p>

<p>
  <strong>Live Demo:</strong> <a href="https://waitly.revoks.dev" target="_blank" rel="noopener noreferrer">waitly.revoks.dev</a>
</p>

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FIdee8%2FWaitly&env=UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,NOTION_SECRET,NOTION_DB,RESEND_API_KEY,RESEND_FROM_EMAIL&envDescription=Environment%20variables%20needed%20for%20the%20Waitly%20template.&project-name=my-waitlist&repository-name=my-waitlist-app&template=Waitly)

## Core Features

- **Next.js 16**: Built with the latest features of the leading React framework for performance and developer experience.
- **Notion as CMS**: Seamlessly manage your waitlist entries directly within a Notion database.
- **Upstash Redis**: Implement robust rate limiting for signups using serverless Redis.
- **Resend Integration**: Send transactional emails (e.g., confirmation emails) through Resend using your custom domain.
- **One-Click Vercel Deploy**: Get your waitlist live in minutes.
- **Tailwind CSS & React**: Modern, responsive UI built with utility-first CSS and React components.
- **TypeScript**: Type safety for a more robust codebase.

## Why Notion as a CMS?

Notion is a versatile tool renowned for its content management capabilities and user-friendly interface. This template demonstrates how to leverage Notion as a lightweight, free, and effective Content Management System (CMS) for your waitlist.

**Key Advantages:**

- **Simplicity**: Manage your waitlist data in a familiar Notion database.
- **No Backend Needed**: Fetches data directly via Notion's API, reducing complexity.
- **Flexibility**: Easily extendable to manage other types of content beyond a waitlist.
- **Collaboration**: Utilize Notion's collaborative features if working with a team.

## Prerequisites: Setting Up External Services

Before you can run this project, you'll need to configure a few external services:

### 1. Upstash Redis

Upstash pr

// ... truncated
```
