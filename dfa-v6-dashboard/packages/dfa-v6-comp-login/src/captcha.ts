export interface CaptchaChallenge {
  challenge_id: string;
  nonce: string;
  difficulty: number;
  expires_in: number;
}

export interface CaptchaSolution {
  challenge_id: string;
  solution: number;
}

export interface CaptchaInput {
  challenge_id: string;
  solution: number;
}

interface ApiEnvelope {
  success?: boolean;
  err_message?: string;
  message?: string;
  errors?: { code?: string; [key: string]: unknown };
  data?: unknown;
}

export class CaptchaApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "CaptchaApiError";
    this.code = code;
  }
}

export function isCaptchaExpiredError(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const errors = (data as ApiEnvelope).errors;
  return errors?.code === "CAPTCHA_EXPIRED";
}

export function parseApiError(data: unknown, fallback: string): CaptchaApiError {
  if (!data || typeof data !== "object") {
    return new CaptchaApiError(fallback);
  }
  const body = data as ApiEnvelope;
  const message = body.err_message ?? body.message ?? fallback;
  const code = body.errors?.code;
  return new CaptchaApiError(message, code);
}

const AUTH_PATH_CAPTCHA_CHALLENGE = "/captcha/challenge";

function resolveCaptchaChallengeUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}${AUTH_PATH_CAPTCHA_CHALLENGE}`;
}

/** Inline PoW solver — no host public/ worker file required. */
const CAPTCHA_WORKER_SOURCE = `async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hasLeadingZeroBits(hexHash, difficulty) {
  const bitsNeeded = Math.ceil(difficulty / 4);
  const prefix = hexHash.slice(0, bitsNeeded);
  const binary = parseInt(prefix, 16).toString(2).padStart(bitsNeeded * 4, "0");
  return binary.startsWith("0".repeat(difficulty));
}
self.onmessage = async ({ data }) => {
  const { nonce, difficulty, challenge_id } = data;
  let solution = 0;
  while (true) {
    const hash = await sha256Hex(nonce + ":" + solution);
    if (hasLeadingZeroBits(hash, difficulty)) {
      self.postMessage({ challenge_id, solution });
      return;
    }
    solution++;
  }
};`;

let cachedWorkerBlobUrl: string | null = null;
const activeWorkers = new Set<Worker>();

function getCaptchaWorkerUrl(): string {
  if (cachedWorkerBlobUrl) return cachedWorkerBlobUrl;
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("CAPTCHA worker is not available in this environment");
  }
  const blob = new Blob([CAPTCHA_WORKER_SOURCE], { type: "application/javascript" });
  cachedWorkerBlobUrl = URL.createObjectURL(blob);
  return cachedWorkerBlobUrl;
}

/** Terminate any in-flight PoW workers (e.g. on captcha widget unmount). */
export function terminateCaptchaWorkers(): void {
  for (const worker of activeWorkers) {
    worker.terminate();
  }
  activeWorkers.clear();
}

export async function fetchCaptchaChallenge(
  baseUrl: string,
  headers?: Record<string, string>
): Promise<CaptchaChallenge> {
  const url = resolveCaptchaChallengeUrl(baseUrl);
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...headers,
    },
  });
  const json = (await res.json()) as ApiEnvelope;
  if (!res.ok || !json.success) {
    throw parseApiError(json, "Failed to load CAPTCHA challenge");
  }
  return json.data as CaptchaChallenge;
}

export function solveCaptchaWithWorker(challenge: CaptchaChallenge): Promise<CaptchaSolution> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(getCaptchaWorkerUrl());
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to start CAPTCHA worker"));
      return;
    }

    activeWorkers.add(worker);

    const cleanup = () => {
      activeWorkers.delete(worker);
      worker.terminate();
    };

    worker.onmessage = ({ data }: MessageEvent<CaptchaSolution>) => {
      cleanup();
      resolve(data);
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "CAPTCHA worker failed"));
    };

    worker.postMessage(challenge);
  });
}

/** Fetch a challenge and solve it off the main thread. */
export async function solveCaptchaChallenge(
  baseUrl: string,
  headers?: Record<string, string>
): Promise<CaptchaSolution> {
  const challenge = await fetchCaptchaChallenge(baseUrl, headers);
  return solveCaptchaWithWorker(challenge);
}
