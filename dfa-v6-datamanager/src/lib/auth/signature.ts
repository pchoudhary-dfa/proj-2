/**
 * Request signing for DFA Toolkit API (SIGNATURE app client auth).
 * string_to_sign = "<METHOD>\n<PATH_WITH_QUERY>\n<X-Api-Timestamp value>"
 * Signature = Ed25519 sign(privateKey, string_to_sign), base64-encoded.
 * Backend verifies with stored public key (system_application_client.client_public_key).
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

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    typeof process.versions.node === "string"
  );
}

/**
 * Decode PEM private key to raw bytes (PKCS8).
 * Strips -----BEGIN PRIVATE KEY----- / -----END PRIVATE KEY----- and base64-decodes.
 * Normalizes literal \n from .env (so "\\n" in env becomes a real newline).
 */
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

async function signWithNodeCrypto(
  data: Uint8Array,
  signingKeyPem: string
): Promise<string> {
  const { createPrivateKey, sign: nodeSign } = await import(
    /* webpackIgnore: true */ "node:crypto"
  );
  const normalizedPem = normalizePem(signingKeyPem);
  const keyObject = createPrivateKey({ key: normalizedPem, format: "pem" });
  const signature = nodeSign(null, Buffer.from(data), keyObject);
  return signature.toString("base64");
}

/**
 * Import Ed25519 private key from PEM string. Caches the result.
 */
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

/**
 * FastAPI/ASGI expose a URL-decoded path for signing; Next.js `URL.pathname`
 * keeps percent-encoding (e.g. `%7C` for `|` in IUS GIDs).
 */
export function normalizePathForApiSigning(pathWithQuery: string): string {
  const q = pathWithQuery.indexOf("?");
  const pathOnly = q >= 0 ? pathWithQuery.slice(0, q) : pathWithQuery;
  const query = q >= 0 ? pathWithQuery.slice(q) : "";
  try {
    return decodeURIComponent(pathOnly) + query;
  } catch {
    return pathWithQuery;
  }
}

/**
 * Build the exact string the backend expects for verification.
 * Backend: string_to_sign = "<METHOD>\n<PATH_WITH_QUERY>\n<X-Api-Timestamp value>"
 */
export function buildStringToSign(
  method: string,
  pathWithQuery: string,
  timestamp: number
): string {
  return `${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}`;
}

/**
 * Sign a toolkit API request (must match FastAPI middleware string_to_sign exactly).
 * `apiSignature` is accepted for call-site compatibility but is not part of the signed payload.
 */
export async function signRequest(
  method: string,
  pathWithQuery: string,
  signingKeyPem: string,
  apiSignature?: string,
  timestampOverride?: string
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = timestampOverride ?? String(Math.floor(Date.now() / 1000));
  const base = buildStringToSign(method, pathWithQuery, Number(timestamp));
  const stringToSign = `${base}\n${apiSignature}`;
  const data = new TextEncoder().encode(stringToSign);

  const signature = isNodeRuntime()
    ? await signWithNodeCrypto(data, signingKeyPem)
    : btoa(
        String.fromCharCode(
          ...new Uint8Array(
            await crypto.subtle.sign(
              { name: "Ed25519" },
              await getSigningKey(signingKeyPem),
              data
            )
          )
        )
      );

  return { timestamp, signature };
}
