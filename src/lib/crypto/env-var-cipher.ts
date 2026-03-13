import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { SECRETS } from "@/lib/config";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = "enc:";
const DISABLED_KEY_VALUES = new Set(["0", "false", "n", "no", "off", "disabled"]);

function getConfiguredEncryptionKey(): string | null {
  const raw = SECRETS.envVarEncryptionKey;
  if (!raw) return null;

  const normalized = raw.trim();
  if (!normalized) return null;
  if (DISABLED_KEY_VALUES.has(normalized.toLowerCase())) {
    return null;
  }

  return normalized;
}

export function hasEnvVarEncryptionKey(): boolean {
  return Boolean(getConfiguredEncryptionKey());
}

function deriveKey(): Buffer | null {
  const raw = getConfiguredEncryptionKey();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function encryptValue(plaintext: string): string {
  const key = deriveKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, tag, encrypted]);
  return `${PREFIX}${payload.toString("base64")}`;
}

export function decryptValue(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;

  const key = deriveKey();
  if (!key) return stored;

  try {
    const payload = Buffer.from(stored.slice(PREFIX.length), "base64");
    if (payload.length < IV_BYTES + TAG_BYTES) return stored;

    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = payload.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  } catch {
    return stored;
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
