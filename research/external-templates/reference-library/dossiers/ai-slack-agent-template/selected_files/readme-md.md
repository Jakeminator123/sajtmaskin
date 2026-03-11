# README.md

Reason: Setup and architecture context

```text
# Slack Agent Template

[![Deploy with Vercel](https://vercel.com/button)](<https://vercel.com/new/clone?demo-description=This%20is%20a%20Slack%20Agent%20template%20built%20with%20Bolt%20for%20JavaScript%20(TypeScript)%20and%20the%20Nitro%20server%20framework.&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2FSs9t7RkKlPtProrbDhZFM%2F0d11b9095ecf84c87a68fbdef6f12ad1%2FFrame__1_.png&demo-title=Slack%20Agent%20Template&demo-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-agent-template&env=SLACK_SIGNING_SECRET%2CSLACK_BOT_TOKEN&envDescription=These%20environment%20variables%20are%20required%20to%20deploy%20your%20Slack%20app%20to%20Vercel&envLink=https%3A%2F%2Fapi.slack.com%2Fapps&from=templates&project-name=Slack%20Agent%20Template&project-names=Comma%20separated%20list%20of%20project%20names%2Cto%20match%20the%20root-directories&repository-name=slack-agent-template&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-agent-template&root-directories=List%20of%20directory%20paths%20for%20the%20directories%20to%20clone%20into%20projects&skippable-integrations=1>)

A Slack Agent template built with [Workflow DevKit](https://useworkflow.dev)'s `DurableAgent`, [AI SDK](https://ai-sdk.dev) tools, [Bolt for JavaScript](https://tools.slack.dev/bolt-js/) (TypeScript), and the [Nitro](https://nitro.build) server framework.

## Features

- **[Workflow DevKit](https://useworkflow.dev)** — Make any TypeScript function durable. Build AI agents that can suspend, resume, and maintain state with ease. Reliability-as-code with automatic retries and observability built in
- **[AI SDK](https://ai-sdk.dev)** — The AI Toolkit for TypeScript. Define type-safe tools with schema validation and switch between AI providers by changing a single line of code
- **[Vercel AI Gateway](https://vercel.com/ai-gateway)** — One endpoint, all your models. Access hundreds of AI models through a centralized interface with intelligent failovers and no rate limits
- **[Slack Assistant](https://api.slack.com/docs/apps/ai)** — Integrates with Slack's Assistant API for threaded conversations with real-time streaming responses
- **[Human-in-the-Loop](./server/lib/ai/workflows/hooks.ts)** — Built-in approval workflows that pause agent execution until a user approves sensitive actions like joining channels
- **[Built-in Tools](./server/lib/ai/tools.ts)

// ... truncated
```
