import { z } from "zod";
import { createMcpHandler } from "mcp-handler";

const handler = createMcpHandler(
  async (server) => {
    server.tool(
      "echo",
      "Echo back a short message",
      {
        message: z.string().min(1).max(500),
      },
      async ({ message }) => {
        return {
          content: [{ type: "text", text: `Echo: ${message}` }],
        };
      }
    );
  },
  {},
  {
    basePath: "/api/mcp",
    verboseLogs: process.env.NODE_ENV !== "production",
  }
);

export { handler as GET, handler as POST, handler as DELETE };
