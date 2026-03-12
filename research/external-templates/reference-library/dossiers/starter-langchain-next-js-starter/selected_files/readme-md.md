# README.md

Reason: Setup and architecture context

```text
# 🦜️🔗 LangChain + Next.js Starter Template

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/langchain-ai/langchain-nextjs-template)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain-nextjs-template)

This template scaffolds a LangChain.js + Next.js starter app. It showcases how to use and combine LangChain modules for several
use cases. Specifically:

- [Simple chat](/app/api/chat/route.ts)
- [Returning structured output from an LLM call](/app/api/chat/structured_output/route.ts)
- [Answering complex, multi-step questions with agents](/app/api/chat/agents/route.ts)
- [Retrieval augmented generation (RAG) with a chain and a vector store](/app/api/chat/retrieval/route.ts)
- [Retrieval augmented generation (RAG) with an agent and a vector store](/app/api/chat/retrieval_agents/route.ts)

Most of them use Vercel's [AI SDK](https://github.com/vercel-labs/ai) to stream tokens to the client and display the incoming messages.

The agents use [LangGraph.js](https://langchain-ai.github.io/langgraphjs/), LangChain's framework for building agentic workflows. They use preconfigured helper functions to minimize boilerplate, but you can replace them with custom graphs as desired.

https://github.com/user-attachments/assets/e389e4e4-4fb9-4223-a4c2-dc002c8f20d3

It's free-tier friendly too! Check out the [bundle size stats below](#-bundle-size).

You can check out a hosted version of this repo here: https://langchain-nextjs-template.vercel.app/

## 🚀 Getting Started

First, clone this repo and download it locally.

Next, you'll need to set up environment variables in your repo's `.env.local` file. Copy the `.env.example` file to `.env.local`.
To start with the basic examples, you'll just need to add your OpenAI API key.

Because this app is made to run in serverless Edge functions, make sure you've set the `LANGCHAIN_CALLBACKS_BACKGROUND` environment variable to `false` to ensure tracing finishes if you are using [LangSmith tracing](https://docs.smith.langchain.com/).

Next, install the required packages using your preferred package manager (e.g. `yarn`).

Now you're ready to run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your brow

// ... truncated
```
