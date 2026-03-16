# README.md

Reason: Setup and architecture context

```text
# Multi-tenant AI-native todo list app with Nile and NextJS 13

This template shows how to use Nile with NextJS 13 for a multi-tenant AI-native todo list application.

- [Live demo](https://nextjs-quickstart-omega.vercel.app)
- [Video guide](https://www.youtube.com/watch?v=Eo0dDROnJGg)
- [Step by step guide](https://thenile.dev/docs/getting-started/languages/nextjs)

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/niledatabase/niledatabase/tree/main/examples/quickstart/nextjs&project-name=nile-todo&repository-name=nile-todo&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22nile%22%2C%22productSlug%22%3A%22nile%22%7D%5D)

## Getting Started

### 1. Create a new database

Sign up for an invite to [Nile](https://thenile.dev) if you don't have one already and choose "Yes, let's get started". Follow the prompts to create a new workspace and a database.

### 2. Create todo table

After you created a database, you will land in Nile's query editor. Since our application requires a table for storing all the "todos" this is a good time to create one:

```sql
    create table todos (id uuid DEFAULT (gen_random_uuid()), tenant_id uuid, title varchar(256), estimate varchar(256), embedding vector(768), complete boolean);
```

If all went well, you'll see the new table in the panel on the left hand side of the query editor. You can also see Nile's built-in tenant table next to it.

### 3. Getting credentials

In the left-hand menu, click on "Settings" and then select "Credentials". Generate credentials and keep them somewhere safe. These give you access to the database.

### 4. 3rd party credentials

This example uses AI chat and embedding models to generate automated time estimates for each task in the todo list. In order to use this functionality, you will
need access to models from a vendor with OpenAI compatible APIs. Make sure you have an API key, API base URL and the [names of the models you'll want to use](https://www.thenile.dev/docs/ai-embeddings/embedding_models).

### 5. Setting the environment

If you haven't cloned this project yet, now will be an excellent time to do so. Since it uses NextJS, we can use `create-next-app` for this:

```bash
npx create-next-app -e https://github.com/niledatabase/niledatabase/tree

// ... truncated
```
