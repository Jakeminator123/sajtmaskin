const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function normalizeKey(secret: string): Uint8Array {
  const raw = textEncoder.encode(secret);
  if (raw.length === 32) return raw;
  return crypto.subtle.digest ? new Uint8Array() : raw;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveAesKey(secret);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, textEncoder.encode(plaintext));

  return JSON.stringify({
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const parsed = JSON.parse(payload) as { iv: string; data: string };
  const key = await deriveAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: base64ToBytes(parsed.iv) },
    key,
    base64ToBytes(parsed.data),
  );

  return textDecoder.decode(plaintext);
}
