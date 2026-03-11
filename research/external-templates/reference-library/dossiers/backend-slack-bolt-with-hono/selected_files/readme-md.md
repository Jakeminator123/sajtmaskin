# README.md

Reason: Setup and architecture context

```text
# Slack Bolt with Hono Template

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=This%20is%20a%20generic%20Bolt%20for%20JavaScript%20(TypeScript)%20template%20app%20used%20to%20build%20out%20Slack%20apps%20with%20Hono&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2F4mFKp6eACjCbvFPkDznhWC%2F2bfc6348e41905140d09678db0d90e26%2FFrame__1_.png&demo-title=Slack%20Bolt%20with%20Hono&demo-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-bolt-with-hono&env=SLACK_SIGNING_SECRET%2CSLACK_BOT_TOKEN&envDescription=These%20environment%20variables%20are%20required%20to%20deploy%20your%20Slack%20app%20to%20Vercel&envLink=https%3A%2F%2Fapi.slack.com%2Fapps&from=templates&project-name=Slack%20Bolt%20with%20Hono&project-names=Comma%20separated%20list%20of%20project%20names%2Cto%20match%20the%20root-directories&repository-name=slack-bolt-with-hono&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-bolt-with-hono&root-directories=List%20of%20directory%20paths%20for%20the%20directories%20to%20clone%20into%20projects&skippable-integrations=1&teamSlug=vercel-partnerships)

This is a generic Bolt for JavaScript (TypeScript) template app used to build Slack apps with Hono

Before getting started, make sure you have a development workspace where you have permissions to install apps. You can use a [developer sandbox](https://api.slack.com/developer-program) or [create a workspace](https://slack.com/create)

## Installation

### Clone and install dependencies
```bash
git clone https://github.com/vercel-partner-solutions/slack-bolt-with-hono.git && cd slack-bolt-with-hono && pnpm install
```

### Create a Slack App

1. Open https://api.slack.com/apps/new and choose "From an app manifest"
2. Choose the workspace you want to use
3. Copy the contents of [`manifest.json`](./manifest.json) into the text box that says "Paste your manifest code here" (JSON tab) and click Next
4. Review the configuration and click Create
5. On the Install App tab, click Install to <Workspace_Name>. 
      - You will be redirected to the App Configuration dashboard
6. Copy the Bot User OAuth Token into your environment as `SLACK_BOT_TOKEN`
7. On the Basic Information tab, copy your Signing Secret into your environment as `SLACK_SIGNING_SECRET`

### Prepare for Local Development

1. Add your `NG

// ... truncated
```
