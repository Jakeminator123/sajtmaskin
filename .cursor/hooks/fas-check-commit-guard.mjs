#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readInput() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const input = readInput();
const command = String(input.command ?? "");

if (!/\bgit\s+commit\b/.test(command)) {
  respond({ permission: "allow" });
  process.exit(0);
}

const staged = git(["diff", "--cached", "--name-only"]);
const includeTrackedWorkingTree = /\s(?:-a|--all)\b/.test(command);
const trackedWorkingTree = includeTrackedWorkingTree ? git(["diff", "--name-only"]) : [];
const files = Array.from(new Set([...staged, ...trackedWorkingTree]));

if (files.length === 0) {
  respond({ permission: "allow" });
  process.exit(0);
}

const riskyPatterns = [
  /^src\/lib\/gen\//,
  /^src\/lib\/api\/engine\//,
  /^src\/lib\/providers\/own-engine\//,
  /^src\/lib\/models\//,
  /^src\/lib\/builder\//,
  /^data\/dossiers\//,
  /^config\/(?:ai_models|prompt-core|scaffold-variants|integrations)\//,
  /^docs\/(?:schemas|architecture)\//,
  /^backoffice\//,
  /^scripts\//,
  /^sajtmaskin_backoffice\.py$/,
];

const riskyFiles = files.filter((file) => riskyPatterns.some((pattern) => pattern.test(file)));

if (riskyFiles.length === 0) {
  respond({ permission: "allow" });
  process.exit(0);
}

const sample = riskyFiles.slice(0, 12).map((file) => `- ${file}`).join("\n");
const extra = riskyFiles.length > 12 ? `\n- ... +${riskyFiles.length - 12} fler` : "";

respond({
  permission: "ask",
  user_message:
    "Den här committen rör riskytor där `/post-review` bör köras först.\n\n" +
    `${sample}${extra}\n\n` +
    "Kör `/post-review` om det här är en fas/större agentändring. Om du redan har gjort review + verifiering kan du godkänna commiten.",
  agent_message:
    "Commit guard flagged risky Sajtmaskin surfaces. Remind the user to run /post-review before committing larger phase work.",
});
