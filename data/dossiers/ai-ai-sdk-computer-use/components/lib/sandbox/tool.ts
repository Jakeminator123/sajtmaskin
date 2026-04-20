import { tool } from "ai";
import { z } from "zod";
import { getSandbox } from "@/lib/sandbox/utils";

export function computerTool(sandboxId: string) {
  return tool({
    description:
      "Control a remote browser/desktop session: click, type, scroll, navigate, wait, and capture screenshots.",
    inputSchema: z.object({
      action: z.enum([
        "screenshot",
        "click",
        "double_click",
        "right_click",
        "type",
        "key",
        "scroll",
        "move",
        "drag",
        "wait",
        "goto"
      ]),
      x: z.number().optional(),
      y: z.number().optional(),
      text: z.string().optional(),
      key: z.string().optional(),
      url: z.string().url().optional(),
      deltaX: z.number().optional(),
      deltaY: z.number().optional(),
      ms: z.number().int().positive().max(30000).optional()
    }),
    execute: async (input) => {
      const sandbox = await getSandbox(sandboxId);
      const page = await sandbox.getPage();

      switch (input.action) {
        case "screenshot": {
          const image = await page.screenshot({ type: "png" });
          return {
            type: "image",
            mediaType: "image/png",
            data: image.toString("base64")
          };
        }
        case "click": {
          await page.mouse.click(input.x ?? 0, input.y ?? 0);
          return { ok: true };
        }
        case "double_click": {
          await page.mouse.dblclick(input.x ?? 0, input.y ?? 0);
          return { ok: true };
        }
        case "right_click": {
          await page.mouse.click(input.x ?? 0, input.y ?? 0, { button: "right" });
          return { ok: true };
        }
        case "type": {
          if (!input.text) throw new Error("text is required for type");
          await page.keyboard.type(input.text);
          return { ok: true };
        }
        case "key": {
          if (!input.key) throw new Error("key is required for key");
          await page.keyboard.press(input.key);
          return { ok: true };
        }
        case "scroll": {
          await page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 0);
          return { ok: true };
        }
        case "move": {
          await page.mouse.move(input.x ?? 0, input.y ?? 0);
          return { ok: true };
        }
        case "drag": {
          await page.mouse.move(input.x ?? 0, input.y ?? 0, { steps: 10 });
          return { ok: true };
        }
        case "wait": {
          await page.waitForTimeout(input.ms ?? 1000);
          return { ok: true };
        }
        case "goto": {
          if (!input.url) throw new Error("url is required for goto");
          await page.goto(input.url, { waitUntil: "domcontentloaded" });
          return { ok: true, url: page.url() };
        }
        default:
          throw new Error("Unsupported computer action");
      }
    }
  });
}

export function bashTool(sandboxId: string) {
  return tool({
    description:
      "Run shell commands in the sandboxed environment. Use for file creation, editing, package inspection, and scripted tasks.",
    inputSchema: z.object({
      command: z.string().min(1)
    }),
    execute: async ({ command }) => {
      const sandbox = await getSandbox(sandboxId);
      const result = await sandbox.runCommand(command);

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
      };
    }
  });
}
