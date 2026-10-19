/**
 * Request signing for DFA Toolkit API (SIGNATURE app client auth).
 * string_to_sign = "<METHOD>\n<PATH_WITH_QUERY>\n<X-Api-Timestamp value>"
 * Signature = Ed25519 sign(privateKey, string_to_sign), base64-encoded.
 * Backend verifies with stored public key (system_application_client.client_public_key).
 *
 * Uses Web Crypto (browser + Edge middleware). Proxy mode uses `@/lib/server/vizAppSign` (node:crypto)
 * with server-only `API_SIGNING_PRIVATE_KEY` on `/api/proxy`.
 */

let cachedSigningKey: CryptoKey | null = null;

function normalizePem(pem: string): string {
  const normalized = pem.replace(/\\n/g, "\n").replace(/;/g, "").trim();
  if (/-----BEGIN [A-Z ]+-----/.test(normalized)) {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return normalized;
  }

  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

function pemToBinary(pem: string): ArrayBuffer {
  const normalized = normalizePem(pem);
  const trimmed = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/i, "")
    .replace(/-----END PRIVATE KEY-----/i, "")
    .replace(/\s/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function getSigningKey(pem: string): Promise<CryptoKey> {
  if (cachedSigningKey) return cachedSigningKey;
  const pkcs8 = pemToBinary(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  cachedSigningKey = key;
  return key;
}

export function buildStringToSign(
  method: string,
  pathWithQuery: string,
  timestamp: number
): string {
  return `${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}`;
}

export async function signRequest(
  method: string,
  pathWithQuery: string,
  signingKeyPem: string,
  _apiSignature?: string,
  timestampOverride?: string
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = timestampOverride ?? String(Math.floor(Date.now() / 1000));
  const stringToSign = buildStringToSign(method, pathWithQuery, Number(timestamp));
  const data = new TextEncoder().encode(stringToSign);
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, await getSigningKey(signingKeyPem), data)
  );
  return { timestamp, signature: bytesToBase64(raw) };
}
