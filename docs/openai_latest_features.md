# OpenAI API Latest Features - Documentation for AI Assistants

**Purpose**: This document summarizes the latest OpenAI API features and architectural changes. Use this when prompting AI models (like those in Cursor) that may not be aware of recent API updates.

**Last Updated**: 2025-12-05

**⚠️ Important**: Always verify details against official docs before shipping to production. API details change over time.

---

## Table of Contents

1. [API Evolution: Responses API](#api-evolution-responses-api)
2. [Agents SDK & AgentKit](#agents-sdk--agentkit)
3. [Model Families](#model-families)
   - [GPT-5 Family](#gpt-5-family-latest)
   - [GPT-5.1 Family](#gpt-51-family-incremental-upgrade)
   - [GPT-5.1-Codex Family](#gpt-51-codex-family-codex-specific-models)
   - [GPT-4.1 Family](#gpt-41-family-excellent-priceperformance)
   - [Reasoning Models (O-series)](#reasoning-models-o-series)
   - [Embeddings Models](#embeddings-models)
   - [GPT Image Models](#gpt-image-models)
   - [Video Generation Models (Sora)](#video-generation-models-sora)
   - [Audio & Moderation Models](#audio--moderation-models)
4. [Pricing & Costs (High-Level)](#pricing--costs-high-level)
5. [Built-in Tools](#built-in-tools)
6. [Key Differences: Responses vs Chat Completions](#key-differences-responses-vs-chat-completions)
7. [Migration Guide](#migration-guide)
8. [Reasoning Models](#reasoning-models)
9. [Authentication & API Keys](#authentication--api-keys)
10. [Best Practices](#best-practices)
11. [Additional Resources](#additional-resources)
12. [Quick Reference: Common Patterns](#quick-reference-common-patterns)
13. [Important Notes for AI Assistants](#important-notes-for-ai-assistants)

---

## API Evolution: Responses API

### Overview

**The Responses API (`/v1/responses`) is the new recommended API** for all new projects. While Chat Completions (`/v1/chat/completions`) remains supported, Responses API is the future direction.

### Key Benefits

- **Better performance**: 3% improvement in SWE-bench with reasoning models
- **Agentic by default**: Models can call multiple tools in one request
- **Lower costs**: 40-80% improvement in cache utilization
- **Stateful context**: Use `store: true` to maintain state between turns
- **Flexible inputs**: Pass string or array of messages
- **Encrypted reasoning**: Support for Zero Data Retention (ZDR) organizations
- **Future-proof**: Designed for upcoming models

### Endpoint

```text
POST https://api.openai.com/v1/responses
```

### Basic Usage

```python
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
    model="gpt-5",
    input="Hello! How are you?",
    instructions="You are a helpful assistant."
)

print(response.output_text)
```

```javascript
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-5",
  input: "Hello! How are you?",
  instructions: "You are a helpful assistant.",
});

console.log(response.output_text);
```

---

## Agents SDK & AgentKit

### Overview

OpenAI now provides **AgentKit** - a modular toolkit for building, deploying, and optimizing agents.

### Components

1. **Agent Builder**: Visual canvas for creating agent workflows

   - Drag-and-drop nodes
   - Templates for common patterns
   - Preview and debug capabilities

2. **ChatKit**: Embed agent workflows in your frontend

   - Customizable UI component
   - Pass workflow ID to embed

3. **Agents SDK**: Programmatic agent building
   - Python and TypeScript SDKs
   - Build agentic applications with tools and orchestration
   - Available on GitHub

### Agent Workflow Structure

Workflows consist of:

- **Start nodes**: Define inputs
- **Agent nodes**: Define instructions, tools, model configuration
- **Tool nodes**: File search, guardrails, MCP
- **Logic nodes**: If/else, while loops, human approval
- **Data nodes**: Transform outputs, set state

### Agent Use Cases

Agents are systems that intelligently accomplish tasks through:

- **Multi-step workflows**: Breaking down complex tasks into steps
- **Tool orchestration**: Using multiple tools in sequence or parallel
- **Decision making**: Routing between different agents based on conditions
- **Human-in-the-loop**: Requesting approval for sensitive operations
- **State management**: Maintaining context across multiple interactions

### Common Agent Patterns

1. **Research Agents**: Use web_search, file_search, code_interpreter
2. **Coding Agents**: Use code_interpreter, file operations, MCP servers
3. **Data Analysis Agents**: Use code_interpreter, file_search, structured outputs
4. **Customer Support Agents**: Use guardrails, human approval, MCP connectors
5. **Content Creation Agents**: Use image_generation, web_search, structured outputs

### Example: Building an Agent

```python
# Using Agents SDK
from openai import OpenAI
client = OpenAI()

# Agents SDK allows building agentic workflows programmatically
# See: https://github.com/openai/agents-sdk-python

# Example: Research agent workflow
response = client.responses.create(
    model="gpt-5",
    input="Research the latest developments in quantum computing",
    tools=[
        {"type": "web_search"},
        {"type": "code_interpreter"},
        {"type": "file_search", "vector_store_ids": ["vs_..."]}
    ],
    background=True  # For long-running tasks
)
```

### Agent Builder (Visual Tool)

Agent Builder provides a visual canvas for creating workflows:

- **Start Node**: Define workflow inputs
- **Agent Node**: Configure model, instructions, tools
- **File Search Node**: Search vector stores
- **Guardrails Node**: Input monitoring (PII, jailbreaks, hallucinations)
- **MCP Node**: Connect to third-party services
- **If/Else Node**: Conditional logic (using CEL expressions)
- **While Node**: Loop on conditions
- **Human Approval Node**: Request user confirmation
- **Transform Node**: Reshape outputs
- **Set State Node**: Define global variables

### ChatKit Integration

Embed agent workflows in your frontend:

```javascript
// Pass workflow ID to ChatKit
<ChatKit workflowId="wf_..." />
```

---

## Model Families

### GPT-5 Family (Latest)

- **gpt-5**: Complex reasoning, broad world knowledge, code-heavy tasks
- **gpt-5-mini**: Cost-optimized reasoning and chat (great default for many backends)
- **gpt-5-nano**: High-throughput, simple instruction-following
- **gpt-5-pro**: Highest reasoning capability (only supports `high` reasoning effort)

**Key Features**:

- Reasoning models (chain-of-thought)
- Custom tools support (`type: "custom"` for raw text payloads)
- Verbosity control (`low`, `medium`, `high`)
- Reasoning effort (`minimal`, `low`, `medium`, `high`)
- **Does NOT support**: `temperature`, `top_p`, `logprobs` (optimized around reasoning effort + verbosity instead)

**When to use**:

- **gpt-5**: Complex reasoning, coding, multi-step tasks
- **gpt-5-mini**: Default for typical backend/coding tasks
- **gpt-5-nano**: High-throughput, classification, simple routing
- **gpt-5-pro**: Hardest tasks where correctness matters most

### GPT-5.1 Family (Incremental Upgrade)

- **gpt-5.1**: Improved speed, reliability, reasoning defaults
- **gpt-5.1-chat**: Chat-optimized variant
- **gpt-5.1-codex-mini**: Codex-specific variant

**Recommendation**: Prefer `gpt-5.1*` where available unless you explicitly need GPT-5-specific behavior.

### GPT-4.1 Family (Excellent Price/Performance)

- **gpt-4.1**: Strong general-purpose model, large context window, great at code/data analysis/tool use
- **gpt-4.1-mini**: Faster, cost-effective (good default for many production workloads)
- **gpt-4.1-nano**: Cheapest in GPT-4.1 family

**When to use**:

- Slightly lower-cost baseline vs GPT-5
- Don't need the very latest reasoning/tool features
- Good default for general backend tasks

### Reasoning Models (O-series)

- **o3**, **o3-mini**, **o4-mini**: Fast reasoning models
- **o3-deep-research**, **o4-mini-deep-research**: Specialized for research tasks
- **o1**: Advanced reasoning (legacy)

**Key Characteristics**:

- Strong on: math, multi-step logic, complex coding, chain-of-thought reasoning
- Trade speed & cost for deep thinking
- Use `reasoning={"effort": "minimal" | "low" | "medium" | "high"}`
- Some models don't support `temperature` at all or restrict it heavily
- Work best with Responses API + tools (file search, web search, etc.)

**When to use**: Hard reasoning/research tasks where quality matters more than speed/cost

### GPT-5.1-Codex Family (Codex-Specific Models)

**Important**: These models are specifically designed for agentic coding tasks in Codex environments (Codex CLI, IDE extensions, cloud services).

- **gpt-5.1-codex**: Optimized for long-term, agentic coding tasks

  - 400,000 token context window
  - 128,000 max output tokens
  - Only available via Responses API
  - Designed for Codex CLI, IDE extensions, cloud services
  - Pricing: $1.25 per 1M input tokens, $10.00 per 1M output tokens

- **gpt-5.1-codex-mini**: Cost-effective version for less resource-intensive tasks

  - 400,000 token context window
  - 128,000 max output tokens
  - Up to 4x more usage within ChatGPT subscription limits
  - Pricing: $0.25 per 1M input tokens, $2.00 per 1M output tokens

- **gpt-5.1-codex-max**: Advanced agentic coding model for project-wide tasks
  - Faster and more capable than previous models
  - Improved token efficiency through "compaction"
  - Can handle tasks spanning millions of tokens
  - Available in Codex CLI, IDE extensions, cloud services, code review

**Key Features**:

- Supports "compaction" for handling long contexts efficiently
- Optimized for multi-step coding workflows
- Better tool usage and reasoning for coding tasks
- Supports function calling, structured outputs, web_search tool

**Note**: These models are NOT general-purpose models. Use GPT-5.1-codex only for agentic coding tasks in Codex or Codex-like environments. For other domains, use GPT-5.

### GPT Image Models

- **gpt-image-1**: Latest image generation model

  - Multimodal language model for image generation
  - Superior instruction following and text rendering
  - Supports multi-turn editing via Responses API
  - Can use File IDs as input (not just bytes)
  - Supports transparent backgrounds, high input fidelity
  - Quality options: `low`, `medium`, `high`, `auto`
  - Size options: `1024x1024`, `1536x1024`, `1024x1536`, `auto`
  - Output formats: `png`, `jpeg`, `webp`
  - Streaming support with `partial_images` parameter

- **gpt-image-1-mini**: Smaller, cost-effective version
  - Lower cost per image
  - Suitable for simpler image generation tasks

**Image Generation APIs**:

- **Image API** (`/v1/images/generations`): Single image generation/editing
- **Responses API**: Multi-turn image editing, conversational image generation

### Video Generation Models (Sora)

- **sora-2**: Fast video generation model

  - Designed for speed and flexibility
  - Good quality results quickly
  - Ideal for rapid iteration, concepting, rough cuts
  - Well-suited for social media content, prototypes
  - Faster turnaround time

- **sora-2-pro**: Production-quality video generation
  - Higher quality results than sora-2
  - Takes longer to render, more expensive
  - Best for high-resolution cinematic footage, marketing assets
  - Visual precision critical use cases

**Video API Features**:

- Asynchronous generation (job-based)
- Webhook support for completion notifications
- Remix capability (targeted adjustments to existing videos)
- Image reference support (first frame from image)
- Thumbnail and spritesheet downloads
- Status polling: `queued`, `in_progress`, `completed`, `failed`

**Video API Endpoints**:

- `POST /v1/videos` - Create video
- `GET /v1/videos/{video_id}` - Get status
- `GET /v1/videos/{video_id}/content` - Download MP4
- `POST /v1/videos/{video_id}/remix` - Remix video
- `GET /v1/videos` - List videos
- `DELETE /v1/videos/{video_id}` - Delete video

---

## Built-in Tools

The Responses API includes **native tools** that don't require custom function definitions:

### Available Tools

1. **web_search**: Search the web for current information

   ```python
   tools=[{"type": "web_search"}]
   ```

2. **file_search**: Search vector stores

   ```python
   tools=[{
       "type": "file_search",
       "vector_store_ids": ["vs_..."]
   }]
   ```

3. **image_generation**: Generate images (GPT Image)

   ```python
   tools=[{"type": "image_generation"}]
   ```

4. **code_interpreter**: Execute Python code

   ```python
   tools=[{"type": "code_interpreter"}]
   ```

5. **computer_use**: Control computer interfaces

   ```python
   tools=[{"type": "computer_use"}]
   ```

6. **MCP (Model Context Protocol)**: Connect to remote servers
   ```python
   tools=[{
       "type": "mcp",
       "server_url": "https://...",
       "server_label": "my_server"
   }]
   ```

### Custom Tools (GPT-5)

GPT-5 supports custom tools with freeform inputs:

```python
tools=[{
    "type": "custom",
    "name": "code_exec",
    "description": "Executes arbitrary python code"
}]
```

---

## Key Differences: Responses vs Chat Completions

### 1. Input Format

**Chat Completions**:

```python
messages=[
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
]
```

**Responses API**:

```python
# Option 1: String input
input="Hello!"

# Option 2: Array input (compatible with Chat Completions)
input=[
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
]

# Option 3: Separate instructions
instructions="You are helpful."
input="Hello!"
```

### 2. Output Format

**Chat Completions**:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "..."
      }
    }
  ]
}
```

**Responses API**:

```json
{
  "output": [
    {
      "type": "reasoning",
      "id": "rs_...",
      "content": []
    },
    {
      "type": "message",
      "id": "msg_...",
      "content": [
        {
          "type": "output_text",
          "text": "..."
        }
      ]
    }
  ]
}
```

**Helper**: Responses API has `output_text` property for easy access.

### 3. Function Calling

**Chat Completions**:

```python
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "...",
    "parameters": {...}
  }
}
```

**Responses API**:

```python
{
  "type": "function",
  "name": "get_weather",
  "description": "...",
  "parameters": {...}
}
```

**Note**: Functions are **strict by default** in Responses API.

### 4. Structured Outputs

**Chat Completions**:

```python
response_format={
    "type": "json_schema",
    "json_schema": {...}
}
```

**Responses API**:

```python
text={
    "format": {
        "type": "json_schema",
        "json_schema": {...}
    }
}
```

### 5. Multi-turn Conversations

**Chat Completions**: Manual context management

```python
messages.append(assistant_message)
messages.append(user_message)
```

**Responses API**: Use `previous_response_id`

```python
res1 = client.responses.create(
    model="gpt-5",
    input="What is the capital of France?",
    store=True
)

res2 = client.responses.create(
    model="gpt-5",
    input="And its population?",
    previous_response_id=res1.id,
    store=True
)
```

---

## Migration Guide

### Step 1: Update Endpoint

Change from `/v1/chat/completions` to `/v1/responses`

### Step 2: Update Input

- Replace `messages` with `input`
- Can use same array format or simplify to string

### Step 3: Update Output Handling

- Replace `choices[0].message.content` with `output_text`
- Or iterate through `output` array for Items

### Step 4: Update Function Definitions

- Remove nested `function` wrapper
- Functions are strict by default

### Step 5: Update Structured Outputs

- Move from `response_format` to `text.format`

### Step 6: Use Native Tools

- Replace custom web search functions with `{"type": "web_search"}`
- Replace custom image generation with `{"type": "image_generation"}`

---

## Reasoning Models

### Overview

Reasoning models (GPT-5, o3, o4-mini) generate **reasoning tokens** before producing output. These tokens are internal "thinking" that improves response quality.

### Key Concepts

1. **Reasoning Tokens**: Internal chain-of-thought (not visible, but billed)
2. **Reasoning Effort**: Controls how many reasoning tokens

   - `minimal`: Fastest, fewest tokens
   - `low`: Fast, economical
   - `medium`: Balanced (default)
   - `high`: Most thorough reasoning

3. **Reasoning Items**: Must be passed back in multi-turn conversations for best results

### Usage

```python
response = client.responses.create(
    model="gpt-5",
    input="Solve this complex problem...",
    reasoning={"effort": "high"}
)
```

### Keeping Reasoning in Context

**Important**: When using reasoning models with tools, pass reasoning items back:

```python
# Method 1: Use previous_response_id
res2 = client.responses.create(
    model="gpt-5",
    input="Continue...",
    previous_response_id=res1.id,
    store=True
)

# Method 2: Manually pass output items
res2 = client.responses.create(
    model="gpt-5",
    input=res1.output + [{"role": "user", "content": "Continue..."}]
)
```

### Encrypted Reasoning (ZDR)

For Zero Data Retention organizations:

```python
response = client.responses.create(
    model="o4-mini",
    input="...",
    store=False,
    include=["reasoning.encrypted_content"],
    tools=[...]
)
```

### Embeddings Models

- **text-embedding-3-small**: Very cheap per 1M tokens, good default for most apps
- **text-embedding-3-large**: Higher dimensionality and accuracy, higher cost

**Endpoint**: `POST /v1/embeddings` (not Responses API)

**When to use**: Semantic search, RAG, clustering, similarity matching

### Audio & Moderation Models

- **Audio**: STT (speech-to-text) and TTS (text-to-speech) via Audio endpoints
- **Moderation**: `omni-moderation-latest` via `/v1/moderations` endpoint
  - Currently priced very generously (sometimes free tier, check docs)

---

## Pricing & Costs (High-Level)

**⚠️ Always check the live pricing page before relying on numbers: https://openai.com/api/pricing**

This section is for relative comparisons only.

### Tokens & Billing Basics

- Billing is per **input tokens** and **output tokens**
- Different model families have different per-M-token prices
- Some features (Deep Research, background tasks with heavy tool use) can be significantly more expensive due to many internal tool calls and large reasoning traces

### Rough Pricing Patterns

- **GPT-5 / GPT-5.1 main models**: Higher price tier, especially output tokens
- **GPT-5-mini / GPT-4.1-mini**: Mid-tier pricing, good "default" for many backends
- **GPT-5-nano / GPT-4.1-nano**: Cheapest in their families, use for rephrasing/summarization at scale, classification, simple routing
- **Reasoning models** (o3, o4-mini, gpt-5-pro): More expensive per token, intended for hard problems
- **Embeddings** (text-embedding-3-small): Very cheap (tens of cents or less per million tokens), designed for scale

### Practical Guidance

When suggesting models to users:

- **Typical coding/backend**: Default to `gpt-4.1-mini` or `gpt-5-mini`
- **Hard reasoning/research**: Suggest `o3-mini`, `o4-mini`, or `gpt-5-pro` with cost warnings
- **RAG/semantic search**: Suggest `text-embedding-3-small` unless user explicitly requests best quality
- **High-throughput**: Use `gpt-5-nano` or `gpt-4.1-nano`

---

## Authentication & API Keys

### How API Keys Work

- Create API keys in the OpenAI dashboard (typically at Project level)
- One key can call: Responses API, Chat Completions, Embeddings, Audio, Moderations, Realtime, etc.
- Standard Bearer auth: `Authorization: Bearer OPENAI_API_KEY`

### Do I Need More Than One API Key?

**Technically**: One secret key per project is enough for all models/endpoints.

**Best Practice**:

- At least one key per environment: `dev`, `staging`, `production`
- Optionally: Separate keys per microservice for easier revocation and clearer monitoring

**You do NOT need**:

- Separate key per model
- Separate key per endpoint
- Separate key per tool

### Typical Setup

```python
# .env
OPENAI_API_KEY=sk-...

# Python
from openai import OpenAI
import os

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
```

```javascript
// JavaScript/TypeScript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

**Security**:

- Never commit keys to git, logs, or front-end code
- Configure as secret environment variables in hosting platform (Render, Vercel, Docker, etc.)
- Rotate keys periodically

---

## Best Practices

### 1. Use Responses API for New Projects

- Better performance with reasoning models
- Native tools support
- Improved caching

### 2. Choose Right Model

- **GPT-5**: Complex reasoning, coding, multi-step tasks
- **GPT-5-mini**: Cost-optimized general use
- **GPT-5-nano**: High-throughput, simple tasks
- **GPT-5-pro**: Highest reasoning (only `high` effort)
- **GPT-5.1-codex**: Agentic coding tasks in Codex environments
- **GPT-5.1-codex-mini**: Cost-effective coding tasks
- **GPT-5.1-codex-max**: Project-wide coding tasks
- **GPT-4.1**: Fast, general purpose
- **O-series**: Heavy reasoning tasks
- **gpt-image-1**: Image generation and editing
- **sora-2**: Fast video generation
- **sora-2-pro**: Production-quality video generation

### 3. Use Native Tools When Possible

- Prefer `{"type": "web_search"}` over custom functions
- Prefer `{"type": "image_generation"}` over Image API for multi-turn flows

### 4. Manage State Properly

- Use `store: true` and `previous_response_id` for conversations
- Pass reasoning items back for reasoning models

### 5. Control Reasoning Effort

- `minimal` or `low` for fast responses
- `medium` for balanced quality/speed
- `high` for complex problems

### 6. Use Background Mode for Long Tasks

- Deep research, complex agent workflows
- Set `background: true` and use webhooks

### 7. Security Considerations

- Only connect trusted MCP servers
- Review tool calls before execution
- Log conversations and tool calls (where allowed by policy)
- Consider staging workflows (public research first, then private data)
- Use Moderation models when user-generated content may be unsafe
- For `computer_use`, put strong guardrails and human approval in front
- Keep API keys only in environment variables
- Create separate keys for dev/stage/prod

### 8. Cost Management

- Be explicit about cost trade-offs when recommending:
  - Reasoning models (more expensive)
  - Background mode with many tool calls
  - Deep research workflows
- Use `reasoning.effort` appropriately (minimal/low by default, medium/high only when needed)
- Monitor token usage and cache hit rates
- Consider using cheaper models (nano/mini variants) for simpler tasks

---

## Additional Resources

### Official Documentation Links

**Always verify details against official docs before shipping to production.**

#### Core API Documentation

- **Models Overview**: https://platform.openai.com/docs/models
- **API Reference**: https://platform.openai.com/docs/api-reference
- **Responses API Reference**: https://platform.openai.com/docs/api-reference/responses
- **Chat Completions API**: https://platform.openai.com/docs/api-reference/chat

#### Migration & Guides

- **Migration to Responses**: https://platform.openai.com/docs/guides/migrate-to-responses
- **Reasoning Models Guide**: https://platform.openai.com/docs/guides/reasoning
- **Function Calling**: https://platform.openai.com/docs/guides/function-calling
- **GPT-5 Guide**: https://platform.openai.com/docs/guides/gpt-5

#### Tools & Features

- **Tools Overview**: https://platform.openai.com/docs/guides/tools
- **Web Search**: https://platform.openai.com/docs/guides/tools-web-search
- **File Search**: https://platform.openai.com/docs/guides/tools-file-search
- **Code Interpreter**: https://platform.openai.com/docs/guides/tools-code-interpreter
- **Computer Use**: https://platform.openai.com/docs/guides/tools-computer-use
- **MCP (Model Context Protocol)**: https://platform.openai.com/docs/guides/tools-connectors-mcp
- **Image Generation**: https://platform.openai.com/docs/guides/image-generation
- **Video Generation (Sora)**: https://platform.openai.com/docs/guides/video-generation
- **Deep Research**: https://platform.openai.com/docs/guides/deep-research

#### Agents & SDKs

- **Agents Overview**: https://platform.openai.com/docs/guides/agents
- **Agent Builder**: https://platform.openai.com/docs/guides/agent-builder
- **ChatKit**: https://platform.openai.com/docs/guides/chatkit
- **Agents SDK**: https://platform.openai.com/docs/guides/agents-sdk
- **Agents SDK Python**: https://github.com/openai/openai-agents-python
- **Agents SDK TypeScript**: https://github.com/openai/openai-agents-typescript

#### Model-Specific Documentation

- **GPT-5.1-Codex**: https://platform.openai.com/docs/models/gpt-5.1-codex
- **GPT-5.1-Codex-Mini**: https://platform.openai.com/docs/models/gpt-5.1-codex-mini
- **GPT-5.1-Codex-Max**: https://openai.com/index/gpt-5-1-codex-max/
- **Codex Models**: https://developers.openai.com/codex/models

#### Other Resources

- **Pricing**: https://openai.com/api/pricing
- **Rate Limits**: https://platform.openai.com/docs/guides/rate-limits
- **Authentication**: https://platform.openai.com/docs/guides/authentication
- **Error Handling**: https://platform.openai.com/docs/guides/error-codes
- **Best Practices**: https://platform.openai.com/docs/guides/production-best-practices
- **Your Data & Privacy**: https://platform.openai.com/docs/guides/your-data
- **Cookbook Examples**: https://cookbook.openai.com

#### Platform & Tools

- **OpenAI Platform Dashboard**: https://platform.openai.com
- **Agent Platform**: https://openai.com/agent-platform
- **Codex Cloud**: https://developers.openai.com/codex/cloud
- **Codex CLI**: https://developers.openai.com/codex/cli

---

## Quick Reference: Common Patterns

### Simple Chat

```python
response = client.responses.create(
    model="gpt-5",
    input="Hello!"
)
```

### With Web Search

```python
response = client.responses.create(
    model="gpt-5",
    input="What are the latest AI news?",
    tools=[{"type": "web_search"}]
)
```

### Multi-turn Conversation

```python
res1 = client.responses.create(
    model="gpt-5",
    input="What is Python?",
    store=True
)

res2 = client.responses.create(
    model="gpt-5",
    input="Give me an example",
    previous_response_id=res1.id,
    store=True
)
```

### With Custom Functions

```python
response = client.responses.create(
    model="gpt-5",
    input="What's the weather in Paris?",
    tools=[{
        "type": "function",
        "name": "get_weather",
        "description": "Get weather",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string"}
            },
            "required": ["location"]
        }
    }]
)
```

### Image Generation

```python
response = client.responses.create(
    model="gpt-5",
    input="Generate an image of a cat",
    tools=[{"type": "image_generation"}]
)

# Extract image
image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
]
```

### Video Generation

```python
# Create video job
video = client.videos.create(
    model="sora-2",
    prompt="A video of a cat playing with a ball in a sunny garden",
    size="1280x720",
    seconds=8
)

# Poll for completion (or use webhooks)
while video.status in ("queued", "in_progress"):
    video = client.videos.retrieve(video.id)
    time.sleep(2)

# Download video
if video.status == "completed":
    content = client.videos.download_content(video.id)
    content.write_to_file("video.mp4")
```

### GPT-5.1-Codex Usage

```python
# Using GPT-5.1-Codex for agentic coding tasks
response = client.responses.create(
    model="gpt-5.1-codex",
    input="Refactor this React component to use hooks",
    tools=[
        {"type": "code_interpreter"},
        {"type": "file_search", "vector_store_ids": ["vs_..."]}
    ],
    reasoning={"effort": "medium"}
)
```

### Background Mode (Long-running Tasks)

```python
# Start background job
res = client.responses.create(
    model="gpt-4.1",
    input="Do a deep research summary on the history of poker solvers.",
    tools=[{"type": "web_search"}],
    background=True,
)

print(res.id, res.status)  # e.g. "queued"

# Poll for completion (or use webhooks)
while res.status in ("queued", "in_progress"):
    time.sleep(5)
    res = client.responses.retrieve(res.id)

if res.status == "completed":
    print(res.output_text)
```

### With Embeddings (RAG)

```python
# Generate embeddings
embeddings = client.embeddings.create(
    model="text-embedding-3-small",
    input="Your text to embed"
)

# Use for semantic search, RAG, etc.
vector = embeddings.data[0].embedding
```

### GPT-5 Custom Tool (Raw Text)

```python
# GPT-5 supports custom tools with freeform text input
response = client.responses.create(
    model="gpt-5",
    input="Use the code_exec tool to print numbers 1–5 in Python.",
    tools=[{
        "type": "custom",
        "name": "code_exec",
        "description": "Executes arbitrary python code",
    }],
)

# Extract custom tool payload from response.output
for item in response.output:
    if item.type == "custom_tool_call":
        print(item.payload)  # Raw Python code
```

---

## Important Notes for AI Assistants

When you (the AI assistant) are writing code or giving API advice:

### API Selection & Usage

1. **Always recommend Responses API** for new projects and samples
2. **Use `output_text`** helper when available instead of manually parsing nested `output` arrays
3. **Remember**: Functions are strict by default in Responses API
4. **Remember**: GPT-5 reasoning models may ignore or restrict `temperature`, `top_p`, `logprobs`
5. **Use `previous_response_id`** + `store: true` for multi-turn conversations where convenient
6. **For stateless services**: Manage history in your own DB and send minimal required context

### Reasoning Models

7. **Use `reasoning={"effort": "minimal" | "low" | "medium" | "high"}`** instead of only tweaking temperature
8. **Pass reasoning items** back when using reasoning models with tools
9. **Be explicit about cost trade-offs** when recommending reasoning models (they're more expensive)

### Tools & Features

10. **Prefer native tools** (`web_search`, `file_search`, `image_generation`, `code_interpreter`, `computer_use`, `mcp`) over re-implementing them in user code
11. **Use GPT-5.1-codex** only for Codex/agentic coding tasks, NOT general purpose
12. **Video generation is asynchronous** - use polling or webhooks, not synchronous waiting
13. **Image generation**: Use Image API for single images, Responses API for multi-turn editing
14. **Agents**: Best built with Agent Builder or Agents SDK for complex workflows
15. **Use compaction** (GPT-5.1-codex-max) for handling very long contexts efficiently

### Model Selection Guidance

16. **Default recommendations**:
    - General backend/coding: `gpt-4.1-mini` or `gpt-5-mini`
    - Hard reasoning: `o3-mini`, `o4-mini`, or `gpt-5-pro` with warnings
    - High-throughput: `gpt-5-nano` or `gpt-4.1-nano`
    - RAG/semantic search: `text-embedding-3-small`

### Security & Best Practices

17. **Encourage developers to**:
    - Keep API keys only in environment variables
    - Create separate keys for dev/stage/prod
    - Verify pricing, model names, deprecation timelines against official docs
18. **Always remind users** that API details change over time - verify against official OpenAI docs before shipping to production

### Verification Checklist

When providing code examples or recommendations, remind users to verify:

- ✅ Current pricing (https://openai.com/api/pricing)
- ✅ Model names and availability (https://platform.openai.com/docs/models)
- ✅ Deprecation timelines (https://platform.openai.com/docs/deprecations)
- ✅ Latest API changes (check changelog/release notes)

---

**End of Document**
