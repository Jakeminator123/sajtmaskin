/**
 * OpenAI Agent for Code Editing
 * =============================
 *
 * Uses OpenAI's Responses API with function calling to edit code
 * in GitHub repositories. This replaces v0 refinement for "taken over" projects.
 *
 * Features:
 * - Read files from GitHub
 * - Update files on GitHub
 * - List all files in repo
 * - Multi-turn conversation support
 *
 * Cost: 1 diamond per edit request
 */

import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types
export interface AgentFile {
  path: string;
  content: string;
}

export interface AgentContext {
  githubToken: string;
  repoFullName: string; // e.g. "username/repo-name"
  previousResponseId?: string; // For multi-turn conversations
}

export interface AgentResult {
  success: boolean;
  message: string;
  updatedFiles: AgentFile[];
  responseId: string; // For continuing conversation
  tokensUsed?: number;
}

// Tool definitions for the agent
const AGENT_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "read_file",
    description: "Read the contents of a file from the repository",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The file path relative to repository root (e.g. 'src/app/page.tsx')",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_file",
    description: "Update or create a file in the repository",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path relative to repository root",
        },
        content: {
          type: "string",
          description: "The new content for the file",
        },
        commitMessage: {
          type: "string",
          description: "Git commit message for the change",
        },
      },
      required: ["path", "content", "commitMessage"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_files",
    description: "List all files in the repository",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional subdirectory path to list (default: root)",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

// System instructions for the agent
const SYSTEM_INSTRUCTIONS = `Du är en expert på React, Next.js, TypeScript och Tailwind CSS.

Din uppgift är att hjälpa användaren redigera sin webbplats-kod baserat på deras instruktioner.

REGLER:
1. Läs alltid relevanta filer innan du gör ändringar
2. Behåll befintlig kodstil och struktur
3. Gör minimala, fokuserade ändringar
4. Använd TypeScript och Tailwind CSS
5. Skriv clean, läsbar kod
6. Committa med tydliga meddelanden på engelska

VIKTIGT:
- Ändra BARA det som användaren ber om
- Lägg inte till onödiga funktioner
- Förklara kort vad du ändrar

Börja alltid med att läsa de relevanta filerna för att förstå kontexten.`;

/**
 * Read a file from GitHub
 */
async function readGitHubFile(
  context: AgentContext,
  path: string
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${context.repoFullName}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${context.githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`File not found: ${path}`);
  }

  const data = await response.json();
  return Buffer.from(data.content, "base64").toString("utf-8");
}

/**
 * Update a file on GitHub
 */
async function updateGitHubFile(
  context: AgentContext,
  path: string,
  content: string,
  commitMessage: string
): Promise<void> {
  // First, try to get the current file to get its SHA (needed for updates)
  let sha: string | undefined;
  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${context.repoFullName}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${context.githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (getResponse.ok) {
      const data = await getResponse.json();
      sha = data.sha;
    }
  } catch {
    // File doesn't exist, that's fine for new files
  }

  // Create or update the file
  const response = await fetch(
    `https://api.github.com/repos/${context.repoFullName}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${context.githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to update file: ${error.message}`);
  }
}

/**
 * List files in a GitHub repository
 */
async function listGitHubFiles(
  context: AgentContext,
  path: string = ""
): Promise<string[]> {
  const url = path
    ? `https://api.github.com/repos/${context.repoFullName}/contents/${path}`
    : `https://api.github.com/repos/${context.repoFullName}/contents`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${context.githubToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list files in: ${path || "root"}`);
  }

  const data = await response.json();
  const files: string[] = [];

  for (const item of data) {
    if (item.type === "file") {
      files.push(item.path);
    } else if (item.type === "dir") {
      // Recursively get files in subdirectories
      const subFiles = await listGitHubFiles(context, item.path);
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Execute a tool call from the agent
 */
async function executeTool(
  context: AgentContext,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`[Agent] Executing tool: ${toolName}`, args);

  switch (toolName) {
    case "read_file": {
      const content = await readGitHubFile(context, args.path as string);
      return content;
    }

    case "update_file": {
      await updateGitHubFile(
        context,
        args.path as string,
        args.content as string,
        args.commitMessage as string
      );
      return `File updated: ${args.path}`;
    }

    case "list_files": {
      const files = await listGitHubFiles(context, (args.path as string) || "");
      return files.join("\n");
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Run the agent to process a user instruction
 */
export async function runAgent(
  instruction: string,
  context: AgentContext
): Promise<AgentResult> {
  console.log(
    "[Agent] Starting with instruction:",
    instruction.substring(0, 100)
  );

  const updatedFiles: AgentFile[] = [];

  try {
    // Create initial response
    let response = await openai.responses.create({
      model: "gpt-4.1", // Use latest model with good code capabilities
      instructions: SYSTEM_INSTRUCTIONS,
      input: instruction,
      tools: AGENT_TOOLS,
      store: true, // Enable stateful conversations
      ...(context.previousResponseId
        ? { previous_response_id: context.previousResponseId }
        : {}),
    });

    console.log("[Agent] Initial response ID:", response.id);

    // Process tool calls in a loop until the agent is done
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Check if there are any function calls to execute
      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call"
      );

      if (functionCalls.length === 0) {
        // No more function calls, agent is done
        break;
      }

      console.log(`[Agent] Processing ${functionCalls.length} function calls`);

      // Execute all function calls and collect results
      const functionResults: OpenAI.Responses.ResponseInputItem[] = [];

      for (const call of functionCalls) {
        try {
          const args = JSON.parse(call.arguments);
          const result = await executeTool(context, call.name, args);

          // Track updated files
          if (call.name === "update_file") {
            updatedFiles.push({
              path: args.path,
              content: args.content,
            });
          }

          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: result,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: `Error: ${errorMessage}`,
          });
        }
      }

      // Continue the conversation with function results
      response = await openai.responses.create({
        model: "gpt-4.1",
        input: functionResults,
        previous_response_id: response.id,
        tools: AGENT_TOOLS,
        store: true,
      });
    }

    // Extract final message from response
    const messageItem = response.output.find(
      (item): item is OpenAI.Responses.ResponseOutputMessage =>
        item.type === "message"
    );

    const finalMessage =
      messageItem?.content
        .filter(
          (c): c is OpenAI.Responses.ResponseOutputText =>
            c.type === "output_text"
        )
        .map((c) => c.text)
        .join("\n") || "Ändringar genomförda.";

    return {
      success: true,
      message: finalMessage,
      updatedFiles,
      responseId: response.id,
      tokensUsed: response.usage?.total_tokens,
    };
  } catch (error) {
    console.error("[Agent] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      success: false,
      message: `Fel vid redigering: ${errorMessage}`,
      updatedFiles: [],
      responseId: "",
    };
  }
}

/**
 * Continue a previous conversation
 */
export async function continueConversation(
  instruction: string,
  context: AgentContext,
  previousResponseId: string
): Promise<AgentResult> {
  return runAgent(instruction, {
    ...context,
    previousResponseId,
  });
}
