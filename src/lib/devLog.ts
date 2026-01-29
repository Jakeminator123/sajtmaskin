import fs from 'node:fs';
import path from 'node:path';

type DevLogTarget = 'in-progress' | 'latest';
type DevLogEntry = Record<string, unknown>;

function isDevLoggingEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

function truncate(value: unknown, max = 500): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function getLogDir(): string {
  const override = (process.env.SAJTMASKIN_LOG_DIR || '').trim();
  return override ? path.resolve(override) : path.join(process.cwd(), 'manual_log');
}

function getLogPath(target: DevLogTarget): string {
  const dir = getLogDir();
  const file =
    target === 'in-progress' ? 'latest_generation.in_progress.log' : 'latest_generation.log';
  return path.join(dir, file);
}

function ensureLogDir(): void {
  fs.mkdirSync(getLogDir(), { recursive: true });
}

function safeWriteFile(filePath: string, content: string): void {
  try {
    ensureLogDir();
    fs.writeFileSync(filePath, content, 'utf8');
  } catch {
    // Best-effort. Never break API routes due to dev logging.
  }
}

function safeAppendFile(filePath: string, content: string): void {
  try {
    ensureLogDir();
    fs.appendFileSync(filePath, content, 'utf8');
  } catch {
    // Best-effort. Never break API routes due to dev logging.
  }
}

export function devLogStartNewSite(params: {
  message: string;
  modelId?: string;
  thinking?: boolean;
  imageGenerations?: boolean;
  projectId?: string;
}): void {
  if (!isDevLoggingEnabled()) return;

  const entry = {
    type: 'site.start',
    message: truncate(params.message),
    modelId: params.modelId ?? null,
    thinking: typeof params.thinking === 'boolean' ? params.thinking : null,
    imageGenerations:
      typeof params.imageGenerations === 'boolean' ? params.imageGenerations : null,
    projectId: params.projectId ?? null,
  } satisfies DevLogEntry;

  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  safeWriteFile(getLogPath('in-progress'), `${line}\n`);
}

export function devLogAppend(target: DevLogTarget, entry: DevLogEntry): void {
  if (!isDevLoggingEnabled()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  safeAppendFile(getLogPath(target), `${line}\n`);
}

export function devLogFinalizeSite(): void {
  if (!isDevLoggingEnabled()) return;

  try {
    ensureLogDir();
    const src = getLogPath('in-progress');
    const dst = getLogPath('latest');
    if (!fs.existsSync(src)) return;

    fs.copyFileSync(src, dst);

    try {
      fs.unlinkSync(src);
    } catch {
      // ignore
    }
  } catch {
    // Best-effort. Never break API routes due to dev logging.
  }
}
