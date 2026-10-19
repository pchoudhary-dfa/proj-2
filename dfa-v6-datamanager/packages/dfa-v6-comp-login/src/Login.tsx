"use client";

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Toaster, toast } from "sonner";
import "sonner/dist/styles.css";
import {
  solveCaptchaChallenge,
  parseApiError,
  CaptchaApiError,
  terminateCaptchaWorkers,
  type CaptchaSolution,
} from "./captcha";

function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  );
}

// Internal API path constants
const AUTH_PATH_LOGIN = "/login";
const AUTH_PATH_REGISTER = "/register";
const AUTH_PATH_PASSWORD_RESET_REQUEST = "/password/reset-request";
const AUTH_PATH_PASSWORD_RESET_CONFIRM = "/password/reset-confirm";

// Password validation rules
interface PasswordRule {
  key: string;
  labelKey: keyof LoginStrings;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: "min_length", labelKey: "pwdRuleMinLength", test: (pw) => pw.length >= 8 },
  { key: "uppercase", labelKey: "pwdRuleUppercase", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lowercase", labelKey: "pwdRuleLowercase", test: (pw) => /[a-z]/.test(pw) },
  { key: "number", labelKey: "pwdRuleNumber", test: (pw) => /[0-9]/.test(pw) },
  { key: "special", labelKey: "pwdRuleSpecial", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

// API Response types
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  api_keys?: string[];
  roles?: { dw_id: number | null; role_id: number; role: string; role_name: string }[];
  permissions?: Record<string, unknown>;
}

export interface RegisterResponse {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  password_auto_generated: boolean;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginStrings {
  signIn?: string;
  createAccount?: string;
  forgotPassword?: string;
  alreadyHaveAccountPrompt?: string;
  signInLinkText?: string;
  dontHaveAccountPrompt?: string;
  registerHereLinkText?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  emailId?: string;
  password?: string;
  confirmPassword?: string;
  language?: string;
  enterUsername?: string;
  enterPassword?: string;
  reEnterPassword?: string;
  enterFirstName?: string;
  enterLastName?: string;
  enterEmail?: string;
  signInError?: string;
  passwordsDoNotMatch?: string;
  registrationNotAvailable?: string;
  /** Tagline under app name (e.g. "Explore. Visualize. Share."). From translation LOGIN_TITLE. */
  loginTitle?: string;
  /** Description under tagline. From translation LOGIN_DESCRIPTION. */
  loginDescription?: string;
  /** Label after the back arrow icon (e.g. "Back"). */
  back?: string;
  /** Forgot Password card title. */
  forgotPasswordTitle?: string;
  /** Forgot Password card description. */
  forgotPasswordDescription?: string;
  /** Send button label in forgot password form. */
  send?: string;
  /** Sending… label while submitting forgot password. */
  sending?: string;
  /** Success banner after password reset request. */
  passwordResetSuccessMessage?: string;
  /** Countdown prefix text (e.g. "Redirecting to login page in"). */
  redirectingToLogin?: string;
  /** Back to Sign In button label. */
  backToSignIn?: string;
  /** Fallback error message for login API failure. */
  loginFailed?: string;
  /** Fallback error message for registration API failure. */
  registrationFailed?: string;
  /** Fallback error message for password reset API failure. */
  passwordResetFailed?: string;
  /** Password validation rule: minimum length. */
  pwdRuleMinLength?: string;
  /** Password validation rule: uppercase letter. */
  pwdRuleUppercase?: string;
  /** Password validation rule: lowercase letter. */
  pwdRuleLowercase?: string;
  /** Password validation rule: number. */
  pwdRuleNumber?: string;
  /** Password validation rule: special character. */
  pwdRuleSpecial?: string;
  /** Toast title when password validation fails. */
  passwordValidationTitle?: string;
  /** Error message for required fields. */
  requiredFieldsError?: string;
  /** Reset-confirm card title (e.g. "Set New Password"). */
  resetPasswordTitle?: string;
  /** Reset-confirm card description. */
  resetPasswordDescription?: string;
  /** Label for new password field in reset-confirm. */
  newPassword?: string;
  /** Placeholder for new password field in reset-confirm. */
  enterNewPassword?: string;
  /** Label/placeholder text for confirming new password in reset-confirm. */
  confirmNewPassword?: string;
  /** Submit button label in reset-confirm form. */
  setPassword?: string;
  /** Submitting label in reset-confirm form. */
  settingPassword?: string;
  /** Success message after password reset confirm. */
  passwordResetConfirmSuccessMessage?: string;
  /** Error message for reset-confirm API failure. */
  passwordResetConfirmFailed?: string;
  /** Error shown when reset link token is missing or invalid. */
  invalidResetToken?: string;
  /** Strength label: Weak. */
  strengthWeak?: string;
  /** Strength label: Fair. */
  strengthFair?: string;
  /** Strength label: Good. */
  strengthGood?: string;
  /** Strength label: Strong. */
  strengthStrong?: string;
  /** Strength label: Excellent. */
  strengthExcellent?: string;
  /** Bot-check / captcha checkbox label (e.g. "I'm not a robot"). */
  notABot?: string;
  /** Shown while the captcha mock loader runs. */
  captchaVerifying?: string;
  /** Captcha badge line (decorative until real provider is wired). */
  captchaProtected?: string;
  /** Captcha legal link label. */
  captchaPrivacy?: string;
  /** Captcha legal link label. */
  captchaTerms?: string;
  /** Shown when PoW CAPTCHA expires before submit. */
  captchaExpired?: string;
  /** Footer copyright line fallback when host does not pass `copyrightText` from app-config `APP_FOOTER_NOTE`. */
  copyrightText?: string;
}

const DEFAULT_COPYRIGHT = "© 2026 DFA. All rights reserved.";

const defaultStrings: Required<LoginStrings> = {
  signIn: "Sign in",
  createAccount: "Create account",
  forgotPassword: "Forgot password?",
  alreadyHaveAccountPrompt: "Already have an account?",
  signInLinkText: "Sign in.",
  dontHaveAccountPrompt: "Don't have an account?",
  registerHereLinkText: "Register here.",
  firstName: "First name",
  lastName: "Last name",
  username: "Username",
  email: "Email",
  emailId: "Email ID",
  password: "Password",
  confirmPassword: "Confirm Password",
  language: "Language",
  enterUsername: "Enter username",
  enterPassword: "Enter password",
  reEnterPassword: "Re-enter password",
  enterFirstName: "Enter first name",
  enterLastName: "Enter last name",
  enterEmail: "Enter your email",
  signInError: "Invalid email or password",
  passwordsDoNotMatch: "Passwords do not match",
  registrationNotAvailable: "Registration is not available yet.",
  loginTitle: "Explore. Visualize. Share.",
  loginDescription: "Log in to create charts, explore indicators, and save visualisations in your personal gallery.",
  back: "Back",
  forgotPasswordTitle: "Forgot Password",
  forgotPasswordDescription: "Enter your username and we will send your new credentials to your registered email.",
  send: "Send",
  sending: "Sending\u2026",
  passwordResetSuccessMessage: "Your password has been reset. Check your email for your new credentials.",
  redirectingToLogin: "Redirecting to login page in",
  backToSignIn: "Back to Sign In",
  loginFailed: "Sign in failed",
  registrationFailed: "Registration failed",
  passwordResetFailed: "Password reset failed",
  pwdRuleMinLength: "At least 8 characters",
  pwdRuleUppercase: "At least one uppercase letter (A–Z)",
  pwdRuleLowercase: "At least one lowercase letter (a–z)",
  pwdRuleNumber: "At least one number (0–9)",
  pwdRuleSpecial: "At least one special character (!@#$%^&*…)",
  passwordValidationTitle: "Password requirements not met",
  requiredFieldsError: "Please fill in all required fields",
  resetPasswordTitle: "Set New Password",
  resetPasswordDescription: "Enter and confirm your new password. It must meet the requirements below.",
  newPassword: "New Password",
  enterNewPassword: "Enter new password",
  confirmNewPassword: "Confirm new password",
  setPassword: "Set Password",
  settingPassword: "Setting\u2026",
  passwordResetConfirmSuccessMessage: "Your password has been updated successfully.",
  passwordResetConfirmFailed: "Failed to reset password",
  invalidResetToken: "Invalid or expired reset link.",
  strengthWeak: "Weak",
  strengthFair: "Fair",
  strengthGood: "Good",
  strengthStrong: "Strong",
  strengthExcellent: "Excellent",
  notABot: "I'm not a robot",
  captchaVerifying: "Verifying…",
  captchaProtected: "Protected",
  captchaPrivacy: "Privacy",
  captchaTerms: "Terms",
  captchaExpired: "CAPTCHA expired. Please verify again.",
  copyrightText: DEFAULT_COPYRIGHT,
};

type CaptchaState = "idle" | "loading" | "verified" | "error";

function CaptchaWidget({
  label,
  verifyingLabel,
  protectedLabel,
  privacyLabel,
  termsLabel,
  disabled,
  baseUrl,
  headers,
  onSolutionChange,
  onError,
}: {
  label: string;
  verifyingLabel: string;
  protectedLabel: string;
  privacyLabel: string;
  termsLabel: string;
  disabled?: boolean;
  baseUrl: string;
  headers?: Record<string, string>;
  onSolutionChange?: (solution: CaptchaSolution | null) => void;
  onError?: (message: string) => void;
}) {
  const [state, setState] = useState<CaptchaState>("idle");

  useEffect(() => {
    return () => terminateCaptchaWorkers();
  }, []);

  const start = useCallback(async () => {
    if (disabled || state === "loading" || state === "verified") return;
    setState("loading");
    onSolutionChange?.(null);
    try {
      const solution = await solveCaptchaChallenge(baseUrl, headers);
      setState("verified");
      onSolutionChange?.(solution);
    } catch (err) {
      setState("error");
      onSolutionChange?.(null);
      onError?.(err instanceof Error ? err.message : "CAPTCHA verification failed");
    }
  }, [baseUrl, disabled, headers, onError, onSolutionChange, state]);

  const statusLabel =
    state === "loading" ? verifyingLabel : state === "verified" ? label : label;

  return (
    <div className="dtk-signin-captcha" role="group" aria-label={label}>
      <button
        type="button"
        className="dtk-signin-captcha-panel"
        data-state={state === "error" ? "idle" : state}
        onClick={() => {
          if (state === "verified" || state === "loading") return;
          void start();
        }}
        disabled={disabled || state === "loading" || state === "verified"}
        aria-busy={state === "loading"}
        aria-pressed={state === "verified"}
      >
        <span className="dtk-signin-captcha-main">
          <span className="dtk-signin-captcha-check-area" aria-hidden>
            {state === "loading" ? (
              <span className="dtk-signin-captcha-spinner" />
            ) : state === "verified" ? (
              <span className="dtk-signin-captcha-check">✓</span>
            ) : null}
          </span>
          <span className="dtk-signin-captcha-label">{statusLabel}</span>
        </span>
        <span className="dtk-signin-captcha-brand" aria-hidden>
          <span className="dtk-signin-captcha-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 12.2l1.8 1.8 3.7-3.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="dtk-signin-captcha-legal-title">{protectedLabel}</span>
          <span className="dtk-signin-captcha-legal-links">
            {privacyLabel} - {termsLabel}
          </span>
        </span>
      </button>
    </div>
  );
}

const FP_REDIRECT_SECONDS = 5;

function toCaptchaInput(solution: CaptchaSolution | null | undefined) {
  if (!solution) return undefined;
  return {
    challenge_id: solution.challenge_id,
    solution: solution.solution,
  };
}

// Internal API functions
async function loginApiInternal(
  baseUrl: string,
  credentials: { username: string; password: string; captcha?: CaptchaSolution | null },
  headers?: Record<string, string>,
  errorMessage?: string
): Promise<LoginResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}${AUTH_PATH_LOGIN}`;
  const body: Record<string, unknown> = {
    username: credentials.username,
    password: credentials.password,
  };
  const captcha = toCaptchaInput(credentials.captcha);
  if (captcha) body.captcha = captcha;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = parseApiError(data, errorMessage ?? "Invalid username or password");
    throw err;
  }
  return data as LoginResponse;
}

async function registerApiInternal(
  baseUrl: string,
  payload: {
    first_name: string;
    last_name?: string;
    username: string;
    email?: string;
    password?: string;
    captcha?: CaptchaSolution | null;
  },
  headers?: Record<string, string>,
  errorMessage?: string
): Promise<RegisterResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}${AUTH_PATH_REGISTER}`;
  const body: Record<string, unknown> = {
    first_name: payload.first_name,
    last_name: payload.last_name ?? null,
    username: payload.username,
    email: payload.email ?? null,
    password: payload.password ?? null,
  };
  const captcha = toCaptchaInput(payload.captcha);
  if (captcha) body.captcha = captcha;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw parseApiError(data, errorMessage ?? "Registration failed");
  }
  return data as RegisterResponse;
}

async function resetPasswordApiInternal(
  baseUrl: string,
  username: string,
  captcha?: CaptchaSolution | null,
  headers?: Record<string, string>,
  errorMessage?: string
): Promise<{ success: boolean; message: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${AUTH_PATH_PASSWORD_RESET_REQUEST}`;
  const body: Record<string, unknown> = { username };
  const captchaInput = toCaptchaInput(captcha);
  if (captchaInput) body.captcha = captchaInput;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw parseApiError(data, errorMessage ?? "Password reset failed");
  }
  return { success: true, message: data.message ?? "" };
}

async function resetConfirmApiInternal(
  baseUrl: string,
  token: string,
  newPassword: string,
  headers?: Record<string, string>,
  errorMessage?: string
): Promise<{ success: boolean; message: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${AUTH_PATH_PASSWORD_RESET_CONFIRM}`;
  // Spread headers first, then override Authorization to ensure reset token takes precedence
  // over any existing auth token that might be in the passed headers
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.err_message ?? data.message ?? errorMessage ?? "Failed to reset password");
  }
  return { success: true, message: data.message ?? "" };
}

export interface LoginProps {
  // API configuration
  baseUrl: string;
  headers?: Record<string, string>;
  
  // Success callbacks
  onLoginSuccess: (response: LoginResponse, credentials: { username: string }) => void | Promise<void>;
  onRegisterSuccess?: (response: RegisterResponse) => void | Promise<void>;
  onPasswordResetSuccess?: (message: string) => void | Promise<void>;
  onResetConfirmSuccess?: (message: string) => void | Promise<void>;
  
  // UI/Branding props
  logoUrl?: string;
  appName?: string;
  /** Version number only (e.g. "5.4.12"). Component displays "Version {version}". */
  version?: string;
  /** Optional override for footer copyright; defaults to app-config `APP_FOOTER_NOTE` via `copyrightText` prop or `strings.copyrightText`. */
  copyrightText?: string;
  /** When set, the sign-in card shows a back control at the bottom (e.g. `router.back()`). Not shown on register. */
  onBack?: () => void;
  /** Optional hook called after the post-success countdown reaches 0 (e.g. to show a toast in the host). */
  onForgotPasswordSuccess?: () => void;
  initialMode?: "signin" | "register" | "forgotpassword" | "resetconfirm";
  /** JWT token from the password-reset email link. When provided, the component starts in resetconfirm mode. */
  initialResetToken?: string;
  /** Called whenever the internal view mode changes (e.g. signin → forgotpassword). Lets the host sync the URL. */
  onModeChange?: (mode: "signin" | "register" | "forgotpassword" | "resetconfirm") => void;
  /** Rendered inside the sign-in card between the submit button and the bottom row (e.g. SSO buttons). Only shown in signin mode. */
  renderAfterSubmit?: React.ReactNode;
  strings?: LoginStrings;
  error?: string | null;
  languages?: { value: string; label: string }[];
  selectedLanguage?: string;
  onLanguageChange?: (value: string) => void;
  /** Controls visibility of "Don't have an account? Register here." prompt on sign-in view. */
  showRegisterPrompt?: boolean;
  /** PoW CAPTCHA on sign-in, register, and forgot-password. Defaults to true; pass false to disable. */
  enableCaptcha?: boolean;
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function Login({
  baseUrl,
  headers,
  onLoginSuccess,
  onRegisterSuccess,
  onPasswordResetSuccess,
  onResetConfirmSuccess,
  logoUrl,
  appName,
  version,
  copyrightText: copyrightTextProp,
  onBack,
  onForgotPasswordSuccess,
  initialMode = "signin",
  initialResetToken,
  onModeChange,
  renderAfterSubmit,
  strings: stringsProp,
  error: externalError,
  languages,
  selectedLanguage,
  onLanguageChange,
  showRegisterPrompt = true,
  enableCaptcha = true,
}: LoginProps) {
  const strings = { ...defaultStrings, ...stringsProp };
  const footerCopyright = copyrightTextProp ?? strings.copyrightText;

  const backRow =
    onBack != null ? (
      <div className="dtk-signin-back-row">
        <button
          type="button"
          className="dtk-signin-link dtk-signin-back"
          onClick={onBack}
          aria-label={strings.back}
        >
          <span className="dtk-signin-back-inner">
            <BackArrowIcon className="dtk-signin-back-icon" />
            {strings.back}
          </span>
        </button>
      </div>
    ) : null;

  const [mode, setMode] = useState<"signin" | "register" | "forgotpassword" | "resetconfirm">(
    initialResetToken ? "resetconfirm" : initialMode
  );

  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;

  /** Avoid calling onModeChange on first mount: Next `useSearchParams` can lag one frame; signin sync would strip ?token from the URL. */
  const skipNextHostNotifyRef = useRef(true);

  // Sync mode when the parent changes initialMode or token (e.g. deep link or client searchParams hydration).
  // useLayoutEffect so mode matches props before paint and before the passive notify effect runs.
  useLayoutEffect(() => {
    if (initialResetToken) {
      setMode((m) => (m === "resetconfirm" ? m : "resetconfirm"));
      return;
    }
    setMode((m) => (m === initialMode ? m : initialMode));
  }, [initialMode, initialResetToken]);

  // Notify the host when mode changes. Callback is read from a ref so a new parent function identity
  // does not retrigger this effect (which would otherwise call router.replace in a loop).
  useEffect(() => {
    if (skipNextHostNotifyRef.current) {
      skipNextHostNotifyRef.current = false;
      return;
    }
    onModeChangeRef.current?.(mode);
  }, [mode]);

  const [signInUsername, setSignInUsername] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captchaSolution, setCaptchaSolution] = useState<CaptchaSolution | null>(null);
  const [captchaEpoch, setCaptchaEpoch] = useState(0);

  // Forgot password state
  const [fpUsername, setFpUsername] = useState("");
  const [fpSubmitting, setFpSubmitting] = useState(false);
  const [fpSuccess, setFpSuccess] = useState(false);
  const [fpCountdown, setFpCountdown] = useState(FP_REDIRECT_SECONDS);

  // Reset-confirm state
  const [rcToken] = useState<string>(initialResetToken ?? "");
  const [rcNewPassword, setRcNewPassword] = useState("");
  const [rcConfirmPassword, setRcConfirmPassword] = useState("");
  const [showRcNew, setShowRcNew] = useState(false);
  const [showRcConfirm, setShowRcConfirm] = useState(false);
  const [rcNewTouched, setRcNewTouched] = useState(false);
  const [rcSubmitting, setRcSubmitting] = useState(false);
  const [rcSuccess, setRcSuccess] = useState(false);

  // Countdown effect: tick down after success, then return to signin
  useEffect(() => {
    if (!fpSuccess) return;
    if (fpCountdown <= 0) {
      onForgotPasswordSuccess?.();
      setFpSuccess(false);
      setFpUsername("");
      setFpCountdown(FP_REDIRECT_SECONDS);
      setMode("signin");
      return;
    }
    const timer = setTimeout(() => setFpCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [fpSuccess, fpCountdown, onForgotPasswordSuccess]);

  const resetCaptcha = useCallback(() => {
    setCaptchaSolution(null);
    setCaptchaEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    resetCaptcha();
  }, [mode, resetCaptcha]);

  const reportError = useCallback(
    (message: string) => {
      toast.error(message, { duration: 8000 });
      resetCaptcha();
    },
    [resetCaptcha]
  );

  const prevExternalErrorRef = useRef<string | null>(null);
  const invalidResetTokenNotifiedRef = useRef(false);
  useEffect(() => {
    if (externalError && externalError !== prevExternalErrorRef.current) {
      reportError(externalError);
    }
    prevExternalErrorRef.current = externalError ?? null;
  }, [externalError, reportError]);

  useEffect(() => {
    if (mode === "resetconfirm" && !rcToken && !invalidResetTokenNotifiedRef.current) {
      invalidResetTokenNotifiedRef.current = true;
      reportError(strings.invalidResetToken ?? "Invalid or expired reset link.");
    }
  }, [mode, rcToken, reportError, strings.invalidResetToken]);

  const handleCaptchaExpired = useCallback(() => {
    toast.error(strings.captchaExpired, { duration: 8000 });
    resetCaptcha();
  }, [resetCaptcha, strings.captchaExpired]);

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof CaptchaApiError && err.code === "CAPTCHA_EXPIRED") {
        handleCaptchaExpired();
        return;
      }
      const message = err instanceof Error ? err.message : fallback;
      reportError(message);
    },
    [handleCaptchaExpired, reportError]
  );

  const captchaReady = !enableCaptcha || captchaSolution != null;
  const signInReady =
    signInUsername.trim().length > 0 &&
    signInPassword.length > 0 &&
    captchaReady &&
    !submitting;

  const handleSignInSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const username = signInUsername.trim();
      const password = signInPassword;
      if (!username || !password) {
        reportError(strings.signInError);
        return;
      }
      setSubmitting(true);
      try {
        const response = await loginApiInternal(
          baseUrl,
          { username, password, captcha: captchaSolution },
          headers,
          strings.loginFailed
        );
        await onLoginSuccess(response, { username });
      } catch (err) {
        handleApiError(err, strings.loginFailed);
      } finally {
        setSubmitting(false);
      }
    },
    [
      signInUsername,
      signInPassword,
      baseUrl,
      headers,
      onLoginSuccess,
      captchaSolution,
      handleApiError,
      reportError,
      strings.signInError,
      strings.loginFailed,
    ]
  );

  const handleRegisterSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!onRegisterSuccess) {
        reportError(strings.registrationNotAvailable);
        return;
      }
      if (registerPassword !== registerConfirmPassword) {
        reportError(strings.passwordsDoNotMatch);
        return;
      }
      if (
        !registerFirstName.trim() ||
        !registerUsername.trim() ||
        !registerEmail.trim() ||
        !registerPassword.trim() ||
        !registerConfirmPassword.trim()
      ) {
        reportError(strings.requiredFieldsError);
        return;
      }
      if (!validateEmail(registerEmail.trim())) {
        reportError(strings.signInError);
        return;
      }
      
      // Check password complexity rules
      const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(registerPassword)).map(
        (rule) => strings[rule.labelKey] ?? rule.key
      );
      
      if (failedRules.length > 0) {
        toast.error(strings.passwordValidationTitle, {
          description: failedRules.join("\n"),
          duration: 10000,
        });
        resetCaptcha();
        return;
      }

      setSubmitting(true);
      try {
        const registerResponse = await registerApiInternal(
          baseUrl,
          {
            first_name: registerFirstName.trim(),
            last_name: registerLastName.trim(),
            username: registerUsername.trim(),
            email: registerEmail.trim(),
            password: registerPassword,
            captcha: captchaSolution,
          },
          headers,
          strings.registrationFailed
        );
        
        // Auto-login after successful registration
        try {
          const loginCaptcha = enableCaptcha
            ? await solveCaptchaChallenge(baseUrl, headers)
            : null;
          const loginResponse = await loginApiInternal(
            baseUrl,
            { username: registerUsername.trim(), password: registerPassword, captcha: loginCaptcha },
            headers,
            strings.loginFailed
          );
          await onLoginSuccess(loginResponse, { username: registerUsername.trim() });
        } catch (loginErr) {
          // If auto-login fails, still notify about successful registration
          await onRegisterSuccess(registerResponse);
        }
      } catch (err) {
        handleApiError(err, strings.registrationFailed);
      } finally {
        setSubmitting(false);
      }
    },
    [
      onRegisterSuccess,
      onLoginSuccess,
      registerFirstName,
      registerLastName,
      registerUsername,
      registerEmail,
      registerPassword,
      registerConfirmPassword,
      baseUrl,
      headers,
      enableCaptcha,
      captchaSolution,
      handleApiError,
      reportError,
      resetCaptcha,
      strings.passwordsDoNotMatch,
      strings.registrationNotAvailable,
      strings.signInError,
      strings.registrationFailed,
      strings.loginFailed,
      strings.passwordValidationTitle,
      strings.pwdRuleMinLength,
      strings.pwdRuleUppercase,
      strings.pwdRuleLowercase,
      strings.pwdRuleNumber,
      strings.pwdRuleSpecial,
      strings.requiredFieldsError,
    ]
  );

  const handleFpSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = fpUsername.trim();
      if (!trimmed) return;
      if (!onPasswordResetSuccess) {
        reportError(strings.registrationNotAvailable);
        return;
      }
      setFpSubmitting(true);
      try {
        const result = await resetPasswordApiInternal(
          baseUrl,
          trimmed,
          captchaSolution,
          headers,
          strings.passwordResetFailed
        );
        setFpSuccess(true);
        setFpCountdown(FP_REDIRECT_SECONDS);
        if (onPasswordResetSuccess) {
          await onPasswordResetSuccess(result.message);
        }
      } catch (err) {
        handleApiError(err, strings.passwordResetFailed);
      } finally {
        setFpSubmitting(false);
      }
    },
    [
      fpUsername,
      baseUrl,
      headers,
      onPasswordResetSuccess,
      captchaSolution,
      handleApiError,
      reportError,
      strings.registrationNotAvailable,
      strings.passwordResetFailed,
    ]
  );

  const handleForgotPasswordClick = useCallback(() => {
    if (!onPasswordResetSuccess) {
      reportError(strings.registrationNotAvailable);
      return;
    }
    setFpUsername("");
    setFpSuccess(false);
    setFpCountdown(FP_REDIRECT_SECONDS);
    setMode("forgotpassword");
  }, [onPasswordResetSuccess, reportError, strings.registrationNotAvailable]);

  const handleBackToSignIn = useCallback(() => {
    setFpUsername("");
    setFpSuccess(false);
    setFpCountdown(FP_REDIRECT_SECONDS);
    setMode("signin");
  }, []);

  // --- Reset-confirm derived values ---
  const rcRuleResults = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(rcNewPassword) }));
  const rcAllRulesPass = rcRuleResults.every((r) => r.passed);
  const rcMismatch = rcConfirmPassword.length > 0 && rcNewPassword !== rcConfirmPassword;
  const rcCanSubmit =
    rcToken.length > 0 &&
    rcNewPassword.length > 0 &&
    rcConfirmPassword.length > 0 &&
    !rcMismatch &&
    rcAllRulesPass &&
    !rcSubmitting;

  const RC_STRENGTH_LEVELS = [
    { color: "" as string, label: "" as string },
    { color: "var(--color-error)", label: strings.strengthWeak ?? "Weak" },
    { color: "var(--color-warning)", label: strings.strengthFair ?? "Fair" },
    { color: "var(--color-warning)", label: strings.strengthGood ?? "Good" },
    { color: "var(--color-success)", label: strings.strengthStrong ?? "Strong" },
    { color: "var(--color-success)", label: strings.strengthExcellent ?? "Excellent" },
  ];
  const rcScore = PASSWORD_RULES.filter((r) => r.test(rcNewPassword)).length;
  const rcStrength = RC_STRENGTH_LEVELS[rcScore] ?? RC_STRENGTH_LEVELS[0];

  const handleRcSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rcCanSubmit) return;
      setRcSubmitting(true);
      try {
        const result = await resetConfirmApiInternal(
          baseUrl,
          rcToken,
          rcNewPassword,
          headers,
          strings.passwordResetConfirmFailed
        );
        setRcSuccess(true);
        await onResetConfirmSuccess?.(result.message);
      } catch (err) {
        reportError(
          err instanceof Error ? err.message : (strings.passwordResetConfirmFailed ?? "Failed to reset password")
        );
      } finally {
        setRcSubmitting(false);
      }
    },
    [rcCanSubmit, rcToken, rcNewPassword, baseUrl, headers, onResetConfirmSuccess, reportError, strings.passwordResetConfirmFailed]
  );

  const hasBranding = Boolean(logoUrl || appName || strings.loginTitle || strings.loginDescription);
  const compactSignInFooter = mode === "signin" && !showRegisterPrompt && onBack == null;

  const viewportFitRef = useRef<HTMLDivElement>(null);
  const scaleInnerRef = useRef<HTMLDivElement>(null);
  const [contentScale, setContentScale] = useState(1);

  useLayoutEffect(() => {
    const viewport = viewportFitRef.current;
    const inner = scaleInnerRef.current;
    if (!viewport || !inner) return;

    const updateScale = () => {
      const availW = viewport.clientWidth;
      const availH = viewport.clientHeight;
      if (availW < 768) {
        setContentScale(1);
        return;
      }
      const needW = inner.offsetWidth;
      if (availW <= 0 || needW <= 0) return;
      // Fit width only — tall branding copy must not shrink the whole layout.
      const next = Math.min(1, availW / needW);
      setContentScale(next);
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(viewport);
    ro.observe(inner);
    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [mode, hasBranding, enableCaptcha, languages?.length, showRegisterPrompt]);

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <div className="dtk-signin-root">
      <div className="dtk-signin-bg" aria-hidden>
        <div className="dtk-signin-bg-gray" />
        <div className="dtk-signin-bg-red" />
      </div>
      <div className={"dtk-signin-main" + (hasBranding ? " dtk-signin-main--with-branding" : "")}>
        <div className="dtk-signin-viewport-fit" ref={viewportFitRef}>
          <div
            className="dtk-signin-scale-inner"
            ref={scaleInnerRef}
            style={{ transform: `scale(${contentScale})` }}
          >
            <div className="dtk-signin-content-row">
          {hasBranding && (
            <div className="dtk-signin-branding">
              {logoUrl && (
                <div className="dtk-signin-branding-logo">
                  <img src={logoUrl} alt="" />
                </div>
              )}
              {appName && <h1 className="dtk-signin-branding-app-name">{appName}</h1>}
              {(strings.loginTitle != null && strings.loginTitle !== "") || (strings.loginDescription != null && strings.loginDescription !== "") ? (
                <div className="dtk-signin-branding-product-lines">
                  {strings.loginTitle != null && strings.loginTitle !== "" && <p className="dtk-signin-branding-tagline">{strings.loginTitle}</p>}
                  {strings.loginDescription != null && strings.loginDescription !== "" && <p className="dtk-signin-branding-desc">{strings.loginDescription}</p>}
                </div>
              ) : null}
            </div>
          )}

          <div className="dtk-signin-card-wrap">
            <div
              className={`dtk-signin-card dtk-signin-card--${mode}${compactSignInFooter ? " dtk-signin-card--compact-footer" : ""}`}
            >
              {mode === "signin" ? (
                <>
                  <h2 className="dtk-signin-card-title">{strings.signIn}</h2>
                  <form onSubmit={handleSignInSubmit} className="dtk-signin-form">
                    <div className="dtk-signin-field">
                      <label htmlFor="dtk-signin-username" className="dtk-signin-label">
                        {strings.username}
                      </label>
                      <input
                        id="dtk-signin-username"
                        type="text"
                        autoComplete="username"
                        value={signInUsername}
                        onChange={(e) => setSignInUsername(e.target.value)}
                        placeholder={strings.enterUsername}
                        className="dtk-signin-input"
                        disabled={submitting}
                      />
                    </div>
                    <div className="dtk-signin-field">
                      <label htmlFor="dtk-signin-password" className="dtk-signin-label">
                        {strings.password}
                      </label>
                      <div className="dtk-signin-input-wrap">
                        <input
                          id="dtk-signin-password"
                          type={showSignInPassword ? "text" : "password"}
                          autoComplete="current-password"
                          value={signInPassword}
                          onChange={(e) => setSignInPassword(e.target.value)}
                          placeholder={strings.enterPassword}
                          className="dtk-signin-input"
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          className="dtk-signin-password-toggle"
                          onClick={() => setShowSignInPassword((p) => !p)}
                          aria-label={showSignInPassword ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          <span className="dtk-signin-eye" aria-hidden>
                            {showSignInPassword ? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </svg>
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="dtk-signin-forgot-wrap">
                      <button
                        type="button"
                        className="dtk-signin-link"
                        onClick={handleForgotPasswordClick}
                      >
                        {strings.forgotPassword}
                      </button>
                    </div>
                    {languages && languages.length > 0 && (
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-signin-lang" className="dtk-signin-label">
                          {strings.language}
                        </label>
                        <select
                          id="dtk-signin-lang"
                          className="dtk-signin-select"
                          value={selectedLanguage ?? ""}
                          onChange={(e) => onLanguageChange?.(e.target.value)}
                          disabled={submitting}
                        >
                          {languages.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {enableCaptcha && (
                      <CaptchaWidget
                        key={`captcha-${mode}-${captchaEpoch}`}
                        baseUrl={baseUrl}
                        headers={headers}
                        label={strings.notABot}
                        verifyingLabel={strings.captchaVerifying}
                        protectedLabel={strings.captchaProtected}
                        privacyLabel={strings.captchaPrivacy}
                        termsLabel={strings.captchaTerms}
                        disabled={submitting}
                        onSolutionChange={setCaptchaSolution}
                        onError={reportError}
                      />
                    )}
                    <div className="dtk-signin-form-actions">
                      <button type="submit" className="dtk-signin-submit" disabled={!signInReady}>
                        {strings.signIn}
                      </button>
                      {renderAfterSubmit}
                      {showRegisterPrompt && (
                        <div className="dtk-signin-bottom-row">
                          <p className="dtk-signin-switch">
                            {strings.dontHaveAccountPrompt}{" "}
                            <button
                              type="button"
                              className="dtk-signin-link"
                              onClick={() => setMode("register")}
                            >
                              {strings.registerHereLinkText}
                            </button>
                          </p>
                        </div>
                      )}
                      {backRow}
                    </div>
                  </form>
                </>
              ) : mode === "register" ? (
                <>
                  <h2 className="dtk-signin-card-title">{strings.createAccount}</h2>
                  <form onSubmit={handleRegisterSubmit} className="dtk-signin-form">
                    <div className="dtk-signin-row">
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-signin-first" className="dtk-signin-label">
                          {strings.firstName}
                        </label>
                        <input
                          id="dtk-signin-first"
                          type="text"
                          autoComplete="given-name"
                          value={registerFirstName}
                          onChange={(e) => setRegisterFirstName(e.target.value)}
                          placeholder={strings.enterFirstName}
                          className="dtk-signin-input"
                          disabled={submitting}
                        />
                      </div>
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-signin-last" className="dtk-signin-label">
                          {strings.lastName}
                        </label>
                        <input
                          id="dtk-signin-last"
                          type="text"
                          autoComplete="family-name"
                          value={registerLastName}
                          onChange={(e) => setRegisterLastName(e.target.value)}
                          placeholder={strings.enterLastName}
                          className="dtk-signin-input"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <div className="dtk-signin-field">
                      <label htmlFor="dtk-signin-reg-username" className="dtk-signin-label">
                        {strings.username}
                      </label>
                      <input
                        id="dtk-signin-reg-username"
                        type="text"
                        autoComplete="username"
                        value={registerUsername}
                        onChange={(e) => setRegisterUsername(e.target.value)}
                        placeholder={strings.enterUsername}
                        className="dtk-signin-input"
                        disabled={submitting}
                      />
                    </div>
                    <div className="dtk-signin-field">
                      <label htmlFor="dtk-signin-reg-email" className="dtk-signin-label">
                        {strings.emailId}
                      </label>
                      <input
                        id="dtk-signin-reg-email"
                        type="email"
                        autoComplete="email"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        placeholder={strings.enterEmail}
                        className="dtk-signin-input"
                        disabled={submitting}
                      />
                    </div>
                    <div className="dtk-signin-field">
                      <label htmlFor="dtk-signin-reg-password" className="dtk-signin-label">
                        {strings.password}
                      </label>
                      <div className="dtk-signin-input-wrap">
                        <input
                          id="dtk-signin-reg-password"
                          type={showRegisterPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                          placeholder={strings.enterPassword}
                          className="dtk-signin-input"
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          className="dtk-signin-password-toggle"
                          onClick={() => setShowRegisterPassword((p) => !p)}
                          aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          <span className="dtk-signin-eye" aria-hidden>
                            {showRegisterPassword ? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </svg>
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="dtk-signin-field">
                      <label htmlFor="dtk-signin-reg-confirm" className="dtk-signin-label">
                        {strings.confirmPassword}
                      </label>
                      <div className="dtk-signin-input-wrap">
                        <input
                          id="dtk-signin-reg-confirm"
                          type={showRegisterConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={registerConfirmPassword}
                          onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                          placeholder={strings.reEnterPassword}
                          className="dtk-signin-input"
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          className="dtk-signin-password-toggle"
                          onClick={() => setShowRegisterConfirmPassword((p) => !p)}
                          aria-label={showRegisterConfirmPassword ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          <span className="dtk-signin-eye" aria-hidden>
                            {showRegisterConfirmPassword ? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </svg>
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                    {languages && languages.length > 0 && (
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-signin-reg-lang" className="dtk-signin-label">
                          {strings.language}
                        </label>
                        <select
                          id="dtk-signin-reg-lang"
                          className="dtk-signin-select"
                          value={selectedLanguage ?? ""}
                          onChange={(e) => onLanguageChange?.(e.target.value)}
                          disabled={submitting}
                        >
                          {languages.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {enableCaptcha && (
                      <CaptchaWidget
                        key={`captcha-${mode}-${captchaEpoch}`}
                        baseUrl={baseUrl}
                        headers={headers}
                        label={strings.notABot}
                        verifyingLabel={strings.captchaVerifying}
                        protectedLabel={strings.captchaProtected}
                        privacyLabel={strings.captchaPrivacy}
                        termsLabel={strings.captchaTerms}
                        disabled={submitting}
                        onSolutionChange={setCaptchaSolution}
                        onError={reportError}
                      />
                    )}
                    <div className="dtk-signin-form-actions">
                      <button type="submit" className="dtk-signin-submit" disabled={submitting || !captchaReady}>
                        {strings.createAccount}
                      </button>
                      <div className="dtk-signin-bottom-row">
                        <p className="dtk-signin-switch">
                          {strings.alreadyHaveAccountPrompt}{" "}
                          <button
                            type="button"
                            className="dtk-signin-link"
                            onClick={() => setMode("signin")}
                          >
                            {strings.signInLinkText}
                          </button>
                        </p>
                      </div>
                    </div>
                  </form>
                </>
              ) : mode === "forgotpassword" ? (
                <>
                  <h2 className="dtk-signin-card-title">{strings.forgotPasswordTitle}</h2>
                  <p className="dtk-signin-fp-desc">{strings.forgotPasswordDescription}</p>

                  {fpSuccess ? (
                    <div className="dtk-signin-fp-success-wrap">
                      <div className="dtk-signin-fp-success" role="status">
                        {strings.passwordResetSuccessMessage}
                      </div>
                      <div className="dtk-signin-fp-countdown" aria-live="polite">
                        <span className="dtk-signin-fp-countdown-text">
                          {strings.redirectingToLogin}
                        </span>
                        <span className="dtk-signin-fp-badge" aria-label={String(fpCountdown)}>
                          {fpCountdown}
                        </span>
                      </div>
                      <div className="dtk-signin-form-actions">
                        <button
                          type="button"
                          className="dtk-signin-submit"
                          onClick={handleBackToSignIn}
                        >
                          {strings.backToSignIn}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleFpSubmit} className="dtk-signin-form">
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-fp-username" className="dtk-signin-label">
                          {strings.username}
                        </label>
                        <input
                          id="dtk-fp-username"
                          type="text"
                          autoComplete="username"
                          value={fpUsername}
                          onChange={(e) => setFpUsername(e.target.value)}
                          placeholder={strings.enterUsername}
                          className="dtk-signin-input"
                          disabled={fpSubmitting}
                          autoFocus
                        />
                      </div>
                      {enableCaptcha && (
                        <CaptchaWidget
                          key={`captcha-${mode}-${captchaEpoch}`}
                          baseUrl={baseUrl}
                          headers={headers}
                          label={strings.notABot}
                          verifyingLabel={strings.captchaVerifying}
                          protectedLabel={strings.captchaProtected}
                          privacyLabel={strings.captchaPrivacy}
                          termsLabel={strings.captchaTerms}
                          disabled={fpSubmitting}
                          onSolutionChange={setCaptchaSolution}
                          onError={reportError}
                        />
                      )}
                      <div className="dtk-signin-form-actions">
                        <button
                          type="submit"
                          className="dtk-signin-submit"
                          disabled={!fpUsername.trim() || fpSubmitting || !captchaReady}
                        >
                          {fpSubmitting ? strings.sending : strings.send}
                        </button>
                        <div className="dtk-signin-back-row">
                          <button
                            type="button"
                            className="dtk-signin-link dtk-signin-back"
                            onClick={handleBackToSignIn}
                            aria-label={strings.back}
                          >
                            <span className="dtk-signin-back-inner">
                              <BackArrowIcon className="dtk-signin-back-icon" />
                              {strings.back}
                            </span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </>
              ) : (
                /* resetconfirm mode */
                <>
                  <h2 className="dtk-signin-card-title">{strings.resetPasswordTitle}</h2>
                  <p className="dtk-signin-fp-desc">{strings.resetPasswordDescription}</p>

                  {!rcToken ? null : rcSuccess ? (
                    <div className="dtk-signin-fp-success-wrap">
                      <div className="dtk-signin-fp-success" role="status">
                        {strings.passwordResetConfirmSuccessMessage}
                      </div>
                      <div className="dtk-signin-form-actions" style={{ marginTop: "1rem" }}>
                        <button
                          type="button"
                          className="dtk-signin-submit"
                          onClick={handleBackToSignIn}
                        >
                          {strings.backToSignIn}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRcSubmit} className="dtk-signin-form">
                      {/* New Password */}
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-rc-new-password" className="dtk-signin-label">
                          {strings.newPassword}
                        </label>
                        <div className="dtk-signin-input-wrap">
                          <input
                            id="dtk-rc-new-password"
                            type={showRcNew ? "text" : "password"}
                            autoComplete="new-password"
                            value={rcNewPassword}
                            onChange={(e) => {
                              setRcNewPassword(e.target.value);
                              if (!rcNewTouched) setRcNewTouched(true);
                            }}
                            placeholder={strings.enterNewPassword}
                            className="dtk-signin-input"
                            disabled={rcSubmitting}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="dtk-signin-password-toggle"
                            onClick={() => setShowRcNew((p) => !p)}
                            aria-label={showRcNew ? "Hide password" : "Show password"}
                            tabIndex={-1}
                          >
                            <span className="dtk-signin-eye" aria-hidden>
                              {showRcNew ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              )}
                            </span>
                          </button>
                        </div>

                        {/* Strength bar — only shown once user starts typing */}
                        {rcNewTouched && rcNewPassword.length > 0 && (
                          <div className="dtk-signin-pwd-strength">
                            <div className="dtk-signin-pwd-strength-bars">
                              {[1, 2, 3, 4, 5].map((seg) => (
                                <div
                                  key={seg}
                                  className="dtk-signin-pwd-strength-seg"
                                  style={{
                                    backgroundColor: seg <= rcScore ? rcStrength.color : undefined,
                                  }}
                                />
                              ))}
                            </div>
                            {rcStrength.label && (
                              <p
                                className="dtk-signin-pwd-strength-label"
                                style={{ color: rcStrength.color }}
                              >
                                {rcStrength.label}
                              </p>
                            )}
                          </div>
                        )}

                        {rcNewTouched && (
                          <ul className="dtk-signin-pwd-rules">
                            {rcRuleResults.map((rule) => (
                              <li
                                key={rule.key}
                                className={`dtk-signin-pwd-rule ${rule.passed ? "dtk-signin-pwd-rule--pass" : "dtk-signin-pwd-rule--fail"}`}
                              >
                                <span className="dtk-signin-pwd-rule-icon" aria-hidden>
                                  {rule.passed ? "✓" : "✗"}
                                </span>
                                {strings[rule.labelKey as keyof typeof strings] as string ?? rule.key}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Confirm Password */}
                      <div className="dtk-signin-field">
                        <label htmlFor="dtk-rc-confirm-password" className="dtk-signin-label">
                          {strings.confirmPassword}
                        </label>
                        <div className="dtk-signin-input-wrap">
                          <input
                            id="dtk-rc-confirm-password"
                            type={showRcConfirm ? "text" : "password"}
                            autoComplete="new-password"
                            value={rcConfirmPassword}
                            onChange={(e) => setRcConfirmPassword(e.target.value)}
                            placeholder={strings.confirmNewPassword}
                            className="dtk-signin-input"
                            disabled={rcSubmitting}
                          />
                          <button
                            type="button"
                            className="dtk-signin-password-toggle"
                            onClick={() => setShowRcConfirm((p) => !p)}
                            aria-label={showRcConfirm ? "Hide password" : "Show password"}
                            tabIndex={-1}
                          >
                            <span className="dtk-signin-eye" aria-hidden>
                              {showRcConfirm ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              )}
                            </span>
                          </button>
                        </div>
                        {rcMismatch && (
                          <p className="dtk-signin-field-error">
                            {strings.passwordsDoNotMatch}
                          </p>
                        )}
                      </div>

                      <div className="dtk-signin-form-actions">
                        <button
                          type="submit"
                          className="dtk-signin-submit"
                          disabled={!rcCanSubmit}
                        >
                          {rcSubmitting ? strings.settingPassword : strings.setPassword}
                        </button>
                        <div className="dtk-signin-back-row">
                          <button
                            type="button"
                            className="dtk-signin-link dtk-signin-back"
                            onClick={handleBackToSignIn}
                            aria-label={strings.back}
                          >
                            <span className="dtk-signin-back-inner">
                              <BackArrowIcon className="dtk-signin-back-icon" />
                              {strings.back}
                            </span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="dtk-signin-footer">
        {version != null && version !== "" && (
          <span className="dtk-signin-footer-version">Version {version}</span>
        )}
        <span className="dtk-signin-footer-copy">{footerCopyright}</span>
      </footer>
    </div>
    </>
  );
}
