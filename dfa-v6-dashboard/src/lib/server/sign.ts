/**
 * Server-only request signing for the BFF -> DFA Toolkit API.
 * string_to_sign = "METHOD \n PATH_WITH_QUERY \n TIMESTAMP"
 */
import { createPrivateKey, sign } from "node:crypto";

import { normalizePathForApiSigning } from "@/lib/auth/signature";

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
  const path = normalizePathForApiSigning(pathWithQuery);
  const stringToSign = buildToolkitStringToSign(method, path, timestamp);
  const key = createPrivateKey({
    key: normalizePem(privateKeyPem),
    format: "pem",
  });
  const signature = sign(null, Buffer.from(stringToSign, "utf8"), key).toString(
    "base64"
  );
  return { timestamp, signature };
}
