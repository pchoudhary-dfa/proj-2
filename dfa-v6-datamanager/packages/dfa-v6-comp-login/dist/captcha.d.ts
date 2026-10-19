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
export declare class CaptchaApiError extends Error {
    code?: string;
    constructor(message: string, code?: string);
}
export declare function isCaptchaExpiredError(data: unknown): boolean;
export declare function parseApiError(data: unknown, fallback: string): CaptchaApiError;
/** Terminate any in-flight PoW workers (e.g. on captcha widget unmount). */
export declare function terminateCaptchaWorkers(): void;
export declare function fetchCaptchaChallenge(baseUrl: string, headers?: Record<string, string>): Promise<CaptchaChallenge>;
export declare function solveCaptchaWithWorker(challenge: CaptchaChallenge): Promise<CaptchaSolution>;
/** Fetch a challenge and solve it off the main thread. */
export declare function solveCaptchaChallenge(baseUrl: string, headers?: Record<string, string>): Promise<CaptchaSolution>;
