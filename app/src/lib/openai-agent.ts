/**
 * OpenAI Agent for Code Editing
 * =============================
 *
 * Uses OpenAI's Responses API with function calling to edit code
 * in taken-over projects. Supports TWO storage modes:
 *
 * 1. REDIS (default) - Simple, no GitHub required
 *    - Files stored in Redis
 *    - Fast reads/writes
 *    - User can download as ZIP
 *
 * 2. GITHUB - Full ownership for developers
 *    - Files on user's GitHub
 *    - Full version control
 *    - Can clone/deploy
 *
 * Cost: 1 diamond per edit request
 */

import OpenAI from "openai";
import {
  getProjectFiles,
  updateProjectFile,
  getProjectMeta,
  ProjectFile,
} from "./redis";

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
  projectId: string;
  storageType: "redis" | "github";
  // GitHub-specific
  githubToken?: string;
  repoFullName?: string; // e.g. "username/repo-name"
  // Conversation continuity
  previousResponseId?: string;
}

export interface AgentResult {
  success: boolean;
  message: string;
  updatedFiles: AgentFile[];
  responseId: string;
  tokensUsed?: number;
}

// Tool definitions for the agent
const AGENT_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "read_file",
    description: "Read the contents of a file from the project",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The file path relative to project root (e.g. 'src/app/page.tsx')",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_file",
    description: "Update or create a file in the project",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path relative to project root",
        },
        content: {
          type: "string",
          description: "The new content for the file",
        },
        commitMessage: {
          type: "string",
          description:
            "Description of the change (used for Git commit if GitHub mode)",
        },
      },
      required: ["path", "content", "commitMessage"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_files",
    description: "List all files in the project",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Optional subdirectory path to filter (default: all files)",
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
6. Beskriv ändringar tydligt

VIKTIGT:
- Ändra BARA det som användaren ber om
- Lägg inte till onödiga funktioner
- Förklara kort vad du ändrar

Börja alltid med att läsa de relevanta filerna för att förstå kontexten.`;

// ============ REDIS Storage Functions ============

async function readRedisFile(projectId: string, path: string): Promise<string> {
  const files = await getProjectFiles(projectId);
  if (!files) {
    throw new Error("Projektet hittades inte");
  }

  const file = files.find((f) => f.path === path);
  if (!file) {
    throw new Error(`Filen hittades inte: ${path}`);
  }

  return file.content;
}

async function updateRedisFile(
  projectId: string,
  path: string,
  content: string
): Promise<void> {
  const success = await updateProjectFile(projectId, path, content);
  if (!success) {
    throw new Error(`Kunde inte uppdatera fil: ${path}`);
  }
}

async function listRedisFiles(
  projectId: string,
  subPath?: string
): Promise<string[]> {
  const files = await getProjectFiles(projectId);
  if (!files) {
    throw new Error("Projektet hittades inte");
  }

  let paths = files.map((f) => f.path);

  // Filter by subpath if provided
  if (subPath) {
    paths = paths.filter((p) => p.startsWith(subPath));
  }

  return paths;
}

// ============ GitHub Storage Functions ============

async function readGitHubFile(
  token: string,
  repoFullName: string,
  path: string
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Filen hittades inte: ${path}`);
  }

  const data = await response.json();
  return Buffer.from(data.content, "base64").toString("utf-8");
}

async function updateGitHubFile(
  token: string,
  repoFullName: string,
  path: string,
  content: string,
  commitMessage: string
): Promise<void> {
  // Get current file SHA if it exists
  let sha: string | undefined;
  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
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

  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
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
    throw new Error(`Kunde inte uppdatera fil: ${error.message}`);
  }
}

async function listGitHubFiles(
  token: string,
  repoFullName: string,
  path: string = ""
): Promise<string[]> {
  const url = path
    ? `https://api.github.com/repos/${repoFullName}/contents/${path}`
    : `https://api.github.com/repos/${repoFullName}/contents`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kunde inte lista filer i: ${path || "root"}`);
  }

  const data = await response.json();
  const files: string[] = [];

  for (const item of data) {
    if (item.type === "file") {
      files.push(item.path);
    } else if (item.type === "dir") {
      const subFiles = await listGitHubFiles(token, repoFullName, item.path);
      files.push(...subFiles);
    }
  }

  return files;
}

// ============ Unified Tool Executor ============

async function executeTool(
  context: AgentContext,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`[Agent] Executing tool: ${toolName}`, args);

  const { projectId, storageType, githubToken, repoFullName } = context;

  switch (toolName) {
    case "read_file": {
      const path = args.path as string;
      if (storageType === "github" && githubToken && repoFullName) {
        return await readGitHubFile(githubToken, repoFullName, path);
      } else {
        return await readRedisFile(projectId, path);
      }
    }

    case "update_file": {
      const path = args.path as string;
      const content = args.content as string;
      const commitMessage = args.commitMessage as string;

      if (storageType === "github" && githubToken && repoFullName) {
        await updateGitHubFile(
          githubToken,
          repoFullName,
          path,
          content,
          commitMessage
        );
        // Also update Redis cache
        await updateRedisFile(projectId, path, content);
      } else {
        await updateRedisFile(projectId, path, content);
      }
      return `Fil uppdaterad: ${path}`;
    }

    case "list_files": {
      const subPath = (args.path as string) || "";
      if (storageType === "github" && githubToken && repoFullName) {
        const files = await listGitHubFiles(githubToken, repoFullName, subPath);
        return files.join("\n");
      } else {
        const files = await listRedisFiles(projectId, subPath);
        return files.join("\n");
      }
    }

    default:
      throw new Error(`Okänt verktyg: ${toolName}`);
  }
}

// ============ Main Agent Function ============

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
  console.log("[Agent] Storage type:", context.storageType);

  const updatedFiles: AgentFile[] = [];

  try {
    // Create initial response
    let response = await openai.responses.create({
      model: "gpt-4.1",
      instructions: SYSTEM_INSTRUCTIONS,
      input: instruction,
      tools: AGENT_TOOLS,
      store: true,
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
            error instanceof Error ? error.message : "Okänt fel";
          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: `Fel: ${errorMessage}`,
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
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";

    return {
      success: false,
      message: `Fel vid redigering: ${errorMessage}`,
      updatedFiles: [],
      responseId: "",
    };
  }
}

/**
 * Helper function to create agent context from project ID
 * Automatically determines storage type from project metadata
 */
export async function createAgentContext(
  projectId: string,
  githubToken?: string
): Promise<AgentContext | null> {
  const meta = await getProjectMeta(projectId);
  if (!meta) {
    console.error("[Agent] Project metadata not found:", projectId);
    return null;
  }

  const context: AgentContext = {
    projectId,
    storageType: meta.storageType,
  };

  if (meta.storageType === "github" && meta.githubOwner && meta.githubRepo) {
    context.githubToken = githubToken;
    context.repoFullName = `${meta.githubOwner}/${meta.githubRepo}`;
  }

  return context;
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
