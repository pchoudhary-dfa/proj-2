/**
 * Server-only request signing for the BFF → DFA Toolkit API (matches middleware:
 * METHOD \n PATH_WITH_QUERY \n TIMESTAMP).
 */
import "server-only";
import { createPrivateKey, sign } from "node:crypto";

function normalizePem(pem: string): string {
  const normalized = pem.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/;/g, "").trim();
  if (/-----BEGIN [A-Z ]+-----/.test(normalized)) {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return normalized;
  }

  if (compact.startsWith("MCow")) {
    throw new Error(
      "API_SIGNING_PRIVATE_KEY is an Ed25519 public key, not a private key. " +
        "Set it to the client's PKCS#8 private key (starts with MC4CAQAw…), supplied out of band via a secret store, never committed."
    );
  }

  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

export function buildToolkitStringToSign(
  method: string,
  pathWithQuery: string,
  timestampSec: string
): string {
  return `${method.toUpperCase()}\n${pathWithQuery}\n${timestampSec}`;
}

export function signToolkitAppRequest(
  method: string,
  pathWithQuery: string,
  privateKeyPem: string
): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = buildToolkitStringToSign(method, pathWithQuery, timestamp);
  const key = createPrivateKey({
    key: normalizePem(privateKeyPem),
    format: "pem",
  });
  const signature = sign(null, Buffer.from(stringToSign, "utf8"), key).toString("base64");
  return { timestamp, signature };
}
