# README.md

Reason: Setup and architecture context

```text
This is a reference showing how to run durable background tasks on Vercel using DBOS. To learn more, check out the [integration guide](https://docs.dbos.dev/integrations/vercel).

## How it Works

This app contains a Next.js frontend and a serverless Vercel Functions "backend" that runs durable background workflows.

The Next.js frontend uses a [DBOS Client](https://docs.dbos.dev/typescript/reference/client) (backed by Postgres) to enqueue workflows and display workflow status.

Periodically, a worker running in a Vercel Function checks if there are any enqueued workflows and executes them.
This worker is triggered automatically by a Vercel cron, but can also be triggered through a button in the app.

Note that the cron schedule is set to once a day because of free tier limitations, but on non-free plans you can set it to run as often as you want (We'd recommend once a minute).

## How to Run

Deploy the app and its Supabase integration in one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdbos-inc%2Fdbos-vercel-integration&demo-title=dbos.dev&demo-description=A%20free%20and%20open-source%20template%20for%20running%20durable%20background%20jobs%20on%20Vercel&demo-url=https%3A%2F%2Fdbos.dev&demo-image=https%3A%2F%2Fdbos-blog-posts.s3.us-west-1.amazonaws.com%2Flogos%2Fwhite_logotype_square%252Bblack_bg_h500px.png&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)
```
