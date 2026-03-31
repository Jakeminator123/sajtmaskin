#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REFS_ROOT = resolve(ROOT, "_template_refs");

const REFS = [
  {
    id: "vercel-vercel",
    repo: "https://github.com/vercel/vercel.git",
    branch: "main",
    sparsePaths: ["examples/nextjs"],
    notes: "base-nextjs technical reference",
  },
  {
    id: "vercel-commerce",
    repo: "https://github.com/vercel/commerce.git",
    branch: "main",
    notes: "ecommerce structure reference",
  },
  {
    id: "vercel-platforms",
    repo: "https://github.com/vercel/platforms.git",
    branch: "main",
    notes: "platform reference for sajtmaskin itself",
  },
  {
    id: "vercel-examples",
    repo: "https://github.com/vercel/examples.git",
    branch: "main",
    sparsePaths: ["solutions/blog"],
    notes: "portfolio/blog reference",
  },
  {
    id: "nextjs-examples",
    repo: "https://github.com/vercel/next.js.git",
    branch: "canary",
    sparsePaths: ["examples/blog-starter"],
    notes: "blog reference",
  },
  {
    id: "nextjs-with-cloudinary",
    repo: "https://github.com/vercel/next.js.git",
    branch: "canary",
    sparsePaths: ["examples/with-cloudinary"],
    notes: "image-heavy portfolio/gallery reference",
  },
  {
    id: "next-email-client",
    repo: "https://github.com/leerob/next-email-client.git",
    branch: "main",
    notes: "app layout and master-detail reference",
  },
  {
    id: "makeswift-basic-typescript",
    repo: "https://github.com/makeswift/makeswift.git",
    branch: "main",
    sparsePaths: ["examples/basic-typescript"],
    notes: "builder/editor integration reference",
  },
  {
    id: "nextjs-saas-starter",
    repo: "https://github.com/nextjs/saas-starter.git",
    branch: "main",
    notes: "saas, auth, pricing, dashboard reference",
  },
  {
    id: "auth0-b2b-saas-starter",
    repo: "https://github.com/auth0-developer-hub/auth0-b2b-saas-starter.git",
    branch: "main",
    notes: "b2b auth and saas flow reference",
  },
  {
    id: "stripe-supabase-saas-template",
    repo: "https://github.com/dzlau/stripe-supabase-saas-template.git",
    branch: "main",
    notes: "payments/auth/database saas reference",
  },
  {
    id: "saasfly",
    repo: "https://github.com/nextify-limited/saasfly.git",
    branch: "main",
    sparsePaths: ["apps/nextjs"],
    notes: "saas marketing and app reference",
  },
  {
    id: "next-enterprise",
    repo: "https://github.com/Blazity/next-enterprise.git",
    branch: "main",
    notes: "engineering quality reference",
  },
  {
    id: "payload-website-starter",
    repo: "https://github.com/payloadcms/payload.git",
    branch: "main",
    sparsePaths: ["templates/with-vercel-website"],
    notes: "cms-heavy blog/website reference",
  },
  {
    id: "ibelick-nim",
    repo: "https://github.com/ibelick/nim.git",
    branch: "main",
    notes: "minimalist portfolio reference",
  },
  {
    id: "vercel-labs-slacker",
    repo: "https://github.com/vercel-labs/slacker.git",
    branch: "main",
    notes: "integration-heavy bot reference",
  },
];

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const onlySet = only ? new Set(only.split(",").map((item) => item.trim()).filter(Boolean)) : null;

function run(command, commandArgs, options = {}) {
  const label = `${command} ${commandArgs.join(" ")}`;
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${label}`);
  }
}

function cloneRef(ref) {
  const targetDir = resolve(REFS_ROOT, ref.id);
  const isSparse = Array.isArray(ref.sparsePaths) && ref.sparsePaths.length > 0;

  if (existsSync(targetDir)) {
    if (!force) {
      console.log(`[scaffold-refs] Skip ${ref.id} (already exists)`);
      return;
    }

    console.log(`[scaffold-refs] Remove ${ref.id} (--force)`);
    rmSync(targetDir, { recursive: true, force: true });
  }

  console.log(`[scaffold-refs] Clone ${ref.id}`);
  const cloneArgs = ["clone", "--depth", "1", "--single-branch", "--branch", ref.branch];

  if (isSparse) {
    cloneArgs.push("--filter=blob:none", "--sparse");
  }

  cloneArgs.push(ref.repo, targetDir);
  run("git", cloneArgs);

  if (isSparse) {
    run("git", ["sparse-checkout", "set", ...ref.sparsePaths], { cwd: targetDir });
  }

  // Keep reference repos as plain folders inside this repo, not embedded git repos.
  rmSync(resolve(targetDir, ".git"), { recursive: true, force: true });
}

function main() {
  const refs = onlySet ? REFS.filter((ref) => onlySet.has(ref.id)) : REFS;

  if (refs.length === 0) {
    throw new Error("No scaffold refs selected.");
  }

  console.log(`[scaffold-refs] Target root: ${REFS_ROOT}`);
  for (const ref of refs) {
    console.log(`[scaffold-refs] ${ref.id} — ${ref.notes}`);
    cloneRef(ref);
  }
  console.log("[scaffold-refs] Done.");
}

main();
