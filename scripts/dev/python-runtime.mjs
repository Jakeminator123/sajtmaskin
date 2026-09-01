import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { spawnSync } from "node:child_process";

export function managedVenvPython(root, platform = process.platform) {
  const pathApi = platform === "win32" ? win32 : posix;
  return platform === "win32"
    ? pathApi.resolve(root, ".venv", "Scripts", "python.exe")
    : pathApi.resolve(root, ".venv", "bin", "python");
}

export function systemPythonCandidates(platform = process.platform) {
  return [
    { command: "python3", args: [] },
    { command: "python", args: [] },
    ...(platform === "win32"
      ? [
          { command: "py", args: ["-3"] },
          { command: "py", args: [] },
        ]
      : []),
  ];
}

export function pythonCandidates({
  root,
  platform = process.platform,
  forced = process.env.SAJTMASKIN_PYTHON?.trim(),
  includeManaged = true,
  pathExists = existsSync,
}) {
  if (forced) return [{ command: forced, args: [] }];
  const managed = managedVenvPython(root, platform);
  return [
    ...(includeManaged && pathExists(managed) ? [{ command: managed, args: [] }] : []),
    ...systemPythonCandidates(platform),
  ];
}

export function probePython(candidate, spawnCommand = spawnSync) {
  try {
    const result = spawnCommand(
      candidate.command,
      [...candidate.args, "-c", "import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)"],
      { stdio: "ignore", windowsHide: true },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

export function resolvePython(options = {}) {
  const candidates = pythonCandidates(options);
  return candidates.find((candidate) => probePython(candidate, options.spawnCommand));
}
