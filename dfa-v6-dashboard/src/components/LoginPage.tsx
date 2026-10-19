"use client";

import { useAppConfig } from "@/contexts/AppConfigContext";
import { useCore, useSystemLanguagesFromServer } from "@/contexts/CoreContext";
import { buildAuthHeaders } from "@/lib/api/client";
import { SELECTED_LOCALE_STORAGE_KEY } from "@/lib/api/core";
import { clearLegacyAuthCookies } from "@/lib/auth/cookie";
import { setStoredAuthUserFromLoginResponse } from "@/lib/auth/user";
import {
  AUTH_SESSION_BFF_BASE,
  buildLocaleAppPath,
  getLocaleFromPathname,
  DEFAULT_LOGIN_LOGO,
} from "@/lib/constants";
import {
  Login,
  type LoginResponse,
  type LoginStrings,
  type RegisterResponse,
} from "dfa-v6-comp-login";
import "dfa-v6-comp-login/styles.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const ROUTE_TO_MODE: Record<
  string,
  "signin" | "register" | "forgotpassword" | "resetconfirm"
> = {
  signin: "signin",
  register: "register",
  "forgot-password": "forgotpassword",
  "reset-password": "resetconfirm",
};

const MODE_TO_ROUTE: Record<string, string> = {
  signin: "signin",
  register: "register",
  forgotpassword: "forgot-password",
  resetconfirm: "reset-password",
};

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const loginPath = `/${locale}`;
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [languages, setLanguages] = useState<{ value: string; label: string }[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(locale);
  const systemLanguages = useSystemLanguagesFromServer();
  const {t} = useCore();
  const {appVersion} = useAppConfig();
  const LOGIN_STRINGS: LoginStrings = {
    signIn: t("SIGN_IN"),
    createAccount: t("CREATE_ACCOUNT"),
    forgotPassword: t("FORGOT_PASSWORD"),
    alreadyHaveAccountPrompt: t("ALREADY_HAVE_ACCOUNT"),
    signInLinkText: t("SIGN_IN"),
    dontHaveAccountPrompt: t("NO_ACCOUNT"),
    registerHereLinkText: t("REGISTER_HERE"),
    firstName: t("FIRST_NAME"),
    lastName: t("LAST_NAME"),
    username: t("USERNAME"),
    email: t("EMAIL"),
    emailId: t("EMAIL_ID"),
    password: t("PASSWORD"),
    confirmPassword: t("CONFIRM_PASSWORD"),
    language: t("LANGUAGE"),
    enterUsername: t("USERNAME_PLACEHOLDER"),
    enterPassword: t("PASSWORD_PLACEHOLDER"),
    reEnterPassword: t("CONFIRM_PASSWORD_PLACEHOLDER"),
    enterFirstName: t("FIRST_NAME_PLACEHOLDER"),
    enterLastName: t("LAST_NAME_PLACEHOLDER"),
    enterEmail: t("EMAIL_PLACEHOLDER"),
    signInError: t("SIGN_IN_ERROR"),
    passwordsDoNotMatch: t("PASSWORDS_DO_NOT_MATCH"),
    registrationNotAvailable: t("REGISTRATION_NOT_AVAILABLE"),
    loginTitle: t("LOGIN_TITLE"),
    loginDescription: t("LOGIN_DESCRIPTION"),
    forgotPasswordTitle: t("FORGOT_PASSWORD"),
    forgotPasswordDescription: t("FORGOT_PASSWORD_DESCRIPTION"),
    send: t("SEND"),
    sending: t("SENDING"),
    passwordResetSuccessMessage: t("PASSWORD_RESET_SUCCESS"),
    redirectingToLogin: t("REDIRECTING_TO_LOGIN"),
    backToSignIn: t("BACK"),
    loginFailed: t("LOGIN_SIGN_IN_FAILED"),
    registrationFailed: t("LOGIN_REGISTRATION_FAILED"),
    passwordResetFailed: t("PASSWORD_RESET_FAILED"),
    resetPasswordTitle: t("RESET_PASSWORD_TITLE"),
    resetPasswordDescription: t("RESET_PASSWORD_DESCRIPTION"),
    newPassword: t("NEW_PASSWORD"),
    enterNewPassword: t("NEW_PASSWORD_PLACEHOLDER"),
    confirmNewPassword: t("CONFIRM_PASSWORD_PLACEHOLDER"),
    setPassword: t("SET_PASSWORD"),
    settingPassword: t("SETTING_PASSWORD"),
    passwordResetConfirmSuccessMessage: t("PASSWORD_RESET_CONFIRM_SUCCESS"),
    passwordResetConfirmFailed: t("PASSWORD_RESET_CONFIRM_FAILED"),
    invalidResetToken: t("INVALID_RESET_TOKEN"),
    pwdRuleMinLength: t("PWD_RULE_MIN_LENGTH"),
    pwdRuleUppercase: t("PWD_RULE_UPPERCASE"),
    pwdRuleLowercase: t("PWD_RULE_LOWERCASE"),
    pwdRuleNumber: t("PWD_RULE_NUMBER"),
    pwdRuleSpecial: t("PWD_RULE_SPECIAL"),
    strengthWeak: t("WEAK"),
    strengthFair: t("FAIR"),
    strengthGood: t("GOOD"),
    strengthStrong: t("STRONG"),
    strengthExcellent: t("EXCELLENT"),
  };
  useEffect(() => {
    setLanguages(systemLanguages.map((language) => ({ value: language.locale, label: language.name ?? "" })));
    setSelectedLanguage(locale);
  }, [systemLanguages]);

  const tokenFromQuery = searchParams.get("token")?.trim() ?? "";
  const routeFromQuery = searchParams.get("route");
  const isResetPasswordRoute =
    routeFromQuery === "reset-password" || tokenFromQuery.length > 0;

  const resolvedInitialMode = isResetPasswordRoute
    ? ("resetconfirm" as const)
    : (routeFromQuery && ROUTE_TO_MODE[routeFromQuery]) || "signin";

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const handleModeChange = useCallback(
    (newMode: "signin" | "register" | "forgotpassword" | "resetconfirm") => {
      const slug = MODE_TO_ROUTE[newMode] ?? "signin";
      const params = new URLSearchParams(searchParamsRef.current.toString());

      if (slug === "signin") {
        if (typeof window !== "undefined") {
          const fromRouter = searchParamsRef.current.get("token")?.trim();
          const fromWindow = new URLSearchParams(window.location.search)
            .get("token")
            ?.trim();
          if (!fromRouter && fromWindow) return;
        }
        params.delete("route");
      } else {
        params.set("route", slug);
      }

      if (slug !== "reset-password") {
        params.delete("token");
      }

      const qs = params.toString();
      const next = qs ? `${loginPath}?${qs}` : loginPath;
      if (typeof window !== "undefined") {
        const current = `${window.location.pathname}${window.location.search}`;
        if (current === next) return;
      }
      router.replace(next, { scroll: false });
    },
    [loginPath, router]
  );

  const handleSignIn = async (
    response: LoginResponse,
    _credentials: { username: string }
  ) => {
    setError(null);
    try {
      clearLegacyAuthCookies();
      setStoredAuthUserFromLoginResponse(
        response as unknown as Record<string, unknown>
      );
      router.push(buildLocaleAppPath(locale, "dashboard"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : LOGIN_STRINGS.loginFailed!);
    }
  };

  const handleRegister = async (_response: RegisterResponse) => {
    setError(null);
    toast.success("Registration successful. Please sign in.");
  };

  const handlePasswordReset = async (message: string) => {
    toast.success(message || LOGIN_STRINGS.passwordResetSuccessMessage!);
  };

  const handleResetConfirmSuccess = async (message: string) => {
    toast.success(
      message || LOGIN_STRINGS.passwordResetConfirmSuccessMessage!
    );
  };

  const onLanguageChange = useCallback((value: string) => {
    setSelectedLanguage(value);
    window.localStorage.setItem(SELECTED_LOCALE_STORAGE_KEY, value);
    const seg = encodeURIComponent(value);
    const qs =
      typeof window !== "undefined" ? window.location.search ?? "" : "";
    router.replace(`/${seg}${qs}`, { scroll: false });
  }, [router]);

  const appName = 
      process.env.NEXT_PUBLIC_APP_TITLE ??
      process.env.NEXT_PUBLIC_APP_NAME ??
      "DFA Dashboard";

  return (
    <Login
      baseUrl={AUTH_SESSION_BFF_BASE}
      headers={buildAuthHeaders()}
      onLoginSuccess={handleSignIn}
      onRegisterSuccess={handleRegister}
      onPasswordResetSuccess={handlePasswordReset}
      onResetConfirmSuccess={handleResetConfirmSuccess}
      initialMode={resolvedInitialMode}
      initialResetToken={tokenFromQuery}
      onModeChange={handleModeChange}
      appName={appName}
      error={error}
      languages={languages}
      selectedLanguage={selectedLanguage}
      onLanguageChange={onLanguageChange}
      strings={LOGIN_STRINGS}
      version={appVersion}
      logoUrl={DEFAULT_LOGIN_LOGO}
      showRegisterPrompt={false}
    />
  );
}
