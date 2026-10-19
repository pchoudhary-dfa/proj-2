"use client";

import {
  APP_FOOTER_NOTE_CONFIG_KEY,
  APP_ID_CONFIG_KEY,
  fetchSystemLanguages,
  getAppConfigValue,
  LANGUAGE_ENABLED_CONFIG_KEY,
  languageDisplayName,
  pickDefaultLocale,
  SELECTED_LOCALE_STORAGE_KEY,
  systemLanguagesToOptions,
  type SystemLanguageRow,
} from "@/lib/api/core";
import { buildAuthHeaders } from "@/lib/api/client";
import { clearLegacyAuthCookies } from "@/lib/auth/cookie";
import { setStoredAuthUserFromLoginResponse } from "@/lib/auth/user";
import { useAppConfig } from "@/contexts/AppConfigContext";
import {
  useCore,
  useSystemLanguagesFromServer,
} from "@/contexts/CoreContext";
import {
  FALLBACK_DEFAULT_LOCALE,
  buildLocaleAppPath,
  AUTH_SESSION_BFF_BASE,
  API_BASE_URL,
} from "@/lib/constants";
import { Login, type LoginResponse, type RegisterResponse } from "dfa-v6-comp-login";
import "dfa-v6-comp-login/styles.css";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildSsoRedirectUrl,
  persistReturnUrl,
  resolveSsoReturnPath,
  validateReturnUrl,
} from "@/lib/auth/returnUrl";
import { fetchSsoProvidersOnce } from "@/lib/auth/ssoProviders";
import { getAppVersion } from "@/lib/version";


/** Shown in the login language dropdown if the API returns no languages (offline / error). */
function loginLanguageFallback(displayLocale: string): { value: string; label: string }[] {
  return [{ value: "en", label: languageDisplayName("en", displayLocale) }];
}

const ROUTE_TO_MODE: Record<string, "signin" | "register" | "forgotpassword" | "resetconfirm"> = {
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

/** Locale segment from `[locale]`; `isFromUrl` is false only when param is missing or invalid (then `locale` is fallback). */
function usePathLocale(): { locale: string; isFromUrl: boolean } {
  const params = useParams();
  const raw = params?.locale;
  const s =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] ?? "" : "";
  const isFromUrl = !!(
    s && /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(s)
  );
  return {
    locale: isFromUrl ? s : FALLBACK_DEFAULT_LOCALE,
    isFromUrl,
  };
}

export default function LocaleLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale: pathLocale, isFromUrl } = usePathLocale();
  const { appName, appTitle, logo, favicon, ssoEnabled, config } = useAppConfig();
  const appKey = getAppConfigValue(config, APP_ID_CONFIG_KEY);
  const languageEnabled = getAppConfigValue(config, LANGUAGE_ENABLED_CONFIG_KEY);
  const isLanguageSelectorEnabled = languageEnabled?.toLowerCase() === "yes";
  const { t, locale: uiLocale } = useCore();
  const systemLanguageRowsFromServer = useSystemLanguagesFromServer();

  const [appVersion, setAppVersion] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ssoProviders, setSsoProviders] = useState<
    { provider_code: string; display_name: string | null }[]
  >([]);
  const tokenFromQueryEarly = searchParams.get("token")?.trim() ?? "";
  const routeFromQueryEarly = searchParams.get("route");
  const isResetPasswordRouteEarly =
    routeFromQueryEarly === "reset-password" || tokenFromQueryEarly.length > 0;
  const isResetConfirmFlow = isResetPasswordRouteEarly;

  const ssoOnlyMode = ssoEnabled && !isResetConfirmFlow;
  const [ssoLoading, setSsoLoading] = useState(ssoOnlyMode);
  const [languages, setLanguages] = useState<
    { value: string; label: string }[] | undefined
  >(undefined);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    pathLocale || FALLBACK_DEFAULT_LOCALE
  );

  const homeUrl = useMemo(
    () => buildLocaleAppPath(pathLocale || FALLBACK_DEFAULT_LOCALE, "datawarehouse"),
    [pathLocale]
  );
  const returnUrl = useMemo(() => {
    const fromQuery = searchParams.get("returnUrl");
    if (fromQuery) return validateReturnUrl(fromQuery, homeUrl);
    return homeUrl;
  }, [searchParams, homeUrl]);

  const ssoReturnPath = useMemo(
    () => resolveSsoReturnPath(returnUrl, homeUrl),
    [returnUrl, homeUrl]
  );

  useEffect(() => {
    if (ssoReturnPath) persistReturnUrl(ssoReturnPath);
  }, [ssoReturnPath]);

  useEffect(() => {
    if (!isLanguageSelectorEnabled) return;

    let cancelled = false;

    const applyRows = (rows: SystemLanguageRow[]) => {
      const displayLocale =
        uiLocale || pathLocale || FALLBACK_DEFAULT_LOCALE;
      const opts = systemLanguagesToOptions(rows, displayLocale);
      const list =
        opts.length > 0 ? opts : loginLanguageFallback(displayLocale);
      setLanguages(list);
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(SELECTED_LOCALE_STORAGE_KEY)
          : null;
      const browser =
        typeof navigator !== "undefined" ? navigator.language : null;
      // URL wins over saved preference so `/en` stays English (previously `stored` flipped UI to Arabic after hydration).
      const preferred = isFromUrl
        ? pathLocale
        : (stored ?? pathLocale ?? browser);
      const initial = pickDefaultLocale(rows, preferred);
      setSelectedLanguage(
        initial ?? list[0]?.value ?? pathLocale ?? FALLBACK_DEFAULT_LOCALE
      );
    };

    if (systemLanguageRowsFromServer.length > 0) {
      applyRows(systemLanguageRowsFromServer);
      return;
    }

    (async () => {
      try {
        const rows = await fetchSystemLanguages();
        if (cancelled) return;
        applyRows(rows);
      } catch {
        if (!cancelled) {
          const displayLocale =
            uiLocale || pathLocale || FALLBACK_DEFAULT_LOCALE;
          setLanguages(loginLanguageFallback(displayLocale));
          setSelectedLanguage(pathLocale || FALLBACK_DEFAULT_LOCALE);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathLocale, isFromUrl, systemLanguageRowsFromServer, uiLocale, isLanguageSelectorEnabled]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getAppVersion();
        if (!cancelled) setAppVersion(v);
      } catch {
        if (!cancelled) setAppVersion("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionExpired = searchParams.get("expired");

  useEffect(() => {
    if (!ssoEnabled) {
      setSsoLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const items = await fetchSsoProvidersOnce();
      if (cancelled || !items) {
        if (!cancelled) setSsoLoading(false);
        return;
      }
      setSsoProviders(items);

      // Skip SSO auto-redirect when arriving from a cross-app SLO logout
      // to prevent silent re-auth via a still-alive IdP session.
      if (ssoOnlyMode && items.length === 1 && !sessionExpired) {
        const p = items[0];
        const returnPath = resolveSsoReturnPath(returnUrl, homeUrl);
        if (returnPath) persistReturnUrl(returnPath);
        window.location.href = buildSsoRedirectUrl(
          API_BASE_URL,
          p.provider_code,
          appKey,
          returnPath
        );
        return;
      }
      setSsoLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount; fetchSsoProvidersOnce dedupes Strict Mode remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnUrl, homeUrl, sessionExpired]);

  const onLanguageChange = useCallback(
    (value: string) => {
      setSelectedLanguage(value);
      try {
        window.localStorage.setItem(SELECTED_LOCALE_STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      if (returnUrl !== homeUrl) {
        const localizedReturn = returnUrl.replace(
          /^\/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(\/|$)/,
          `/${value}$1`
        );
        params.set("returnUrl", localizedReturn);
      }
      const qs = params.toString();
      const seg = encodeURIComponent(value);
      router.replace(`/${seg}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, returnUrl, homeUrl, searchParams]
  );

  const handleSignIn = async (response: LoginResponse, _credentials: { username: string }) => {
    setError(null);
    try {
      clearLegacyAuthCookies();
      setStoredAuthUserFromLoginResponse(response as unknown as Record<string, unknown>);
      const locale =
        selectedLanguage ?? pathLocale ?? FALLBACK_DEFAULT_LOCALE;
      const localizedReturnUrl = returnUrl.replace(
        /^\/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(\/|$)/,
        `/${locale}$1`
      );
      router.push(localizedReturnUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("LOGIN_SIGN_IN_FAILED"));
    }
  };

  const handleRegister = async (response: RegisterResponse) => {
    // Registration already handled auto-login in the component
    // This callback is only called if auto-login failed but registration succeeded
    setError(null);
    toast.success(t("REGISTRATION_SUCCESS"));
  };

  const handlePasswordReset = async (message: string) => {
    toast.success(message || t("PASSWORD_RESET_SUCCESS"));
  };
  const handleResetConfirmSuccess = async (message: string) => {
    toast.success(message || t("PASSWORD_RESET_CONFIRM_SUCCESS"));
  };

  const tokenFromQuery = searchParams.get("token")?.trim() ?? "";
  const routeFromQuery = searchParams.get("route");
  const isResetPasswordRoute =
    routeFromQuery === "reset-password" || tokenFromQuery.length > 0;

  const resolvedInitialMode = isResetPasswordRoute
    ? ("resetconfirm" as const)
    : (routeFromQuery && ROUTE_TO_MODE[routeFromQuery]) || "signin";

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const selectedLanguageRef = useRef(selectedLanguage);
  selectedLanguageRef.current = selectedLanguage;
  const pathLocaleRef = useRef(pathLocale);
  pathLocaleRef.current = pathLocale;

  const handleModeChange = useCallback(
    (newMode: "signin" | "register" | "forgotpassword" | "resetconfirm") => {
      const slug = MODE_TO_ROUTE[newMode] ?? "signin";
      const params = new URLSearchParams(searchParamsRef.current.toString());

      if (slug === "signin") {
        // Router searchParams can briefly lag `window.location` on first paint; do not strip a token that only exists on the real URL yet.
        if (typeof window !== "undefined") {
          const fromRouter = searchParamsRef.current.get("token")?.trim();
          const fromWindow = new URLSearchParams(window.location.search).get("token")?.trim();
          if (!fromRouter && fromWindow) {
            return;
          }
        }
        params.delete("route");
        if (returnUrl !== homeUrl) {
          params.set("returnUrl", returnUrl);
        }
      } else {
        params.set("route", slug);
        if (slug === "register" && returnUrl !== homeUrl) {
          params.set("returnUrl", returnUrl);
        }
      }

      // Keep token only on the reset-password route; strip it everywhere else.
      if (slug !== "reset-password") {
        params.delete("token");
      }

      const qs = params.toString();
      const seg = encodeURIComponent(
        selectedLanguageRef.current ||
          pathLocaleRef.current ||
          FALLBACK_DEFAULT_LOCALE
      );
      const next = `/${seg}${qs ? `?${qs}` : ""}`;
      if (typeof window !== "undefined") {
        const current = `${window.location.pathname}${window.location.search}`;
        if (current === next) return;
      }
      router.replace(next, { scroll: false });
    },
    [router, returnUrl, homeUrl]
  );

  const languageOptions = isLanguageSelectorEnabled
    ? languages ??
      loginLanguageFallback(uiLocale || pathLocale || FALLBACK_DEFAULT_LOCALE)
    : undefined;
  const defaultLoginLogoUrl = "/images/dfa_fsv_dm.png";
  const logoUrl = logo ?? favicon ?? defaultLoginLogoUrl;

  const showLocalLoginForm = !ssoEnabled || isResetConfirmFlow;

  // SSO-only + loading: spinner while providers are fetched
  if (ssoOnlyMode && ssoLoading) {
    return (
      <div className="dtk-signin-sso-redirect">
        <div className="dtk-signin-sso-spinner" />
        <p>{t("LOADING") || "Loading…"}</p>
      </div>
    );
  }

  // SSO-only + multiple providers: provider selector (no local form)
  if (ssoOnlyMode && ssoProviders.length > 1) {
    return (
      <div className="dtk-signin-sso-selector">
        <div className="dtk-signin-sso-selector-card">
          {logoUrl && (
            <img src={logoUrl} alt="" className="dtk-signin-sso-logo" />
          )}
          <h2 className="dtk-signin-sso-title">
            {appName ?? appTitle ?? t("LOGIN_APP_NAME")}
          </h2>
          <p className="dtk-signin-sso-subtitle">
            {t("SSO_SELECT_PROVIDER") || "Select a sign-in provider"}
          </p>
          <div className="dtk-signin-sso-provider-list">
            {ssoProviders.map((p) => (
              <a
                key={p.provider_code}
                href={buildSsoRedirectUrl(
                  API_BASE_URL,
                  p.provider_code,
                  appKey,
                  ssoReturnPath
                )}
                onClick={() => {
                  if (ssoReturnPath) persistReturnUrl(ssoReturnPath);
                }}
                className="dtk-signin-sso-button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                {t("LOGIN_WITH_SSO")
                  ? `${t("LOGIN_WITH_SSO")} ${p.display_name ?? p.provider_code}`
                  : `Login with ${p.display_name ?? p.provider_code}`}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // SSO-only + 1 provider: auto-redirect in flight
  if (ssoOnlyMode && ssoProviders.length === 1) {
    const p = ssoProviders[0];
    return (
      <div className="dtk-signin-sso-redirect">
        <div className="dtk-signin-sso-spinner" />
        <p>
          {t("SSO_REDIRECTING") || "Redirecting to"}{" "}
          {p.display_name ?? p.provider_code}…
        </p>
      </div>
    );
  }

  // SSO-only but no providers configured
  if (ssoOnlyMode && ssoProviders.length === 0 && !ssoLoading) {
    return (
      <div className="dtk-signin-sso-selector">
        <div className="dtk-signin-sso-selector-card">
          {logoUrl && (
            <img src={logoUrl} alt="" className="dtk-signin-sso-logo" />
          )}
          <p className="dtk-signin-sso-subtitle">
            {t("SSO_NO_PROVIDERS") ||
              "SSO is enabled but no active providers are configured."}
          </p>
        </div>
      </div>
    );
  }

  if (!showLocalLoginForm) {
    return null;
  }

  // Local-only mode: username + password login form
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
      appName={appName ?? appTitle ?? t("LOGIN_APP_NAME")}
      version={appVersion}
      copyrightText={getAppConfigValue(config, APP_FOOTER_NOTE_CONFIG_KEY) ?? undefined}
      error={error}
      languages={languageOptions}
      selectedLanguage={isLanguageSelectorEnabled ? selectedLanguage : undefined}
      onLanguageChange={isLanguageSelectorEnabled ? onLanguageChange : undefined}
      strings={{
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
        notABot: t("CAPTCHA_NOT_A_BOT", "I'm not a robot"),
        captchaVerifying: t("CAPTCHA_VERIFYING", "Verifying…"),
        captchaProtected: t("CAPTCHA_PROTECTED", "Protected"),
        captchaPrivacy: t("CAPTCHA_PRIVACY", "Privacy"),
        captchaTerms: t("CAPTCHA_TERMS", "Terms"),
        captchaExpired: t("CAPTCHA_EXPIRED", "CAPTCHA expired. Please verify again."),
      }}
      logoUrl={logoUrl}
      showRegisterPrompt={false}
      enableCaptcha={true}
    />
  );
}
