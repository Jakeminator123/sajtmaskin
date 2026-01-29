import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const env = { ...process.env };

if (env.NODE_OPTIONS) {
  const tokens = env.NODE_OPTIONS.split(/\s+/).filter(Boolean);
  const filtered = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === "--localstorage-file") {
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) {
        i += 1;
      }
      continue;
    }

    if (token.startsWith("--localstorage-file=")) {
      continue;
    }

    filtered.push(token);
  }

  if (filtered.length > 0) {
    env.NODE_OPTIONS = filtered.join(" ");
  } else {
    delete env.NODE_OPTIONS;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const nextBin = resolve(__dirname, "..", "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, ...args], { stdio: "inherit", env });

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
