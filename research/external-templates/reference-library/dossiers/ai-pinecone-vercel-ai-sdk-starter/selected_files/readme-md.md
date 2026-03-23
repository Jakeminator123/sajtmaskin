# README.md

Reason: Setup and architecture context

```text
In this example, we'll build a full-stack application that uses Retrieval Augmented Generation (RAG) powered by [Pinecone](https://pinecone.io) to deliver accurate and contextually relevant responses in a chatbot.

RAG is a powerful tool that combines the benefits of retrieval-based models and generative models. Unlike traditional chatbots that can struggle with maintaining up-to-date information or accessing domain-specific knowledge, a RAG-based chatbot uses a knowledge base created from crawled URLs to provide contextually relevant responses.

Incorporating Vercel's AI SDK into our application will allow us easily set up the chatbot workflow and utilize streaming more efficiently, particularly in edge environments, enhancing the responsiveness and performance of our chatbot.

By the end of this tutorial, you'll have a context-aware chatbot that provides accurate responses without hallucination, ensuring a more effective and engaging user experience. Let's get started on building this powerful tool ([Full code listing](https://github.com/pinecone-io/pinecone-vercel-example/blob/main/package.json)).

## Step 1: Setting Up Your Next.js Application

Next.js is a powerful JavaScript framework that enables us to build server-side rendered and static web applications using React. It's a great choice for our project due to its ease of setup, excellent performance, and built-in features such as routing and API routes.

To create a new Next.js app, run the following command:

### npx

```bash
npx create-next-app chatbot
```

Next, we'll add the `ai` package:

```bash
npm install ai
```

You can use the [full list](https://github.com/pinecone-io/pinecone-vercel-example/blob/main/package.json) of dependencies if you'd like to build along with the tutorial.

## Step 2: Create the Chatbot

In this step, we're going to use the Vercel SDK to establish the backend and frontend of our chatbot within the Next.js application. By the end of this step, our basic chatbot will be up and running, ready for us to add context-aware capabilities in the following stages. Let's get started.

### Chatbot frontend component

Now, let's focus on the frontend component of our chatbot. We're going to build the user-facing elements of our bot, creating the interface through which users will interact with our application. This will involve crafting the desig

// ... truncated
```
