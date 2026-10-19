"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCore } from "@/contexts/CoreContext";
import { Login, type LoginResponse } from "dfa-v6-comp-login";
import "dfa-v6-comp-login/styles.css";
import { toast } from "sonner";
import { DEFAULT_LOGO, AUTH_SESSION_BFF_BASE, API_BASE_URL, APP_ID } from "@/lib/constants";
import { useSignedFetchHeaders } from "@/hooks/useSignedFetchHeaders";
import { persistSessionFromBffLogin } from "@/lib/sso/client";
import {
  buildSsoRedirectUrl,
  persistReturnUrl,
  validateReturnUrl,
} from "@/lib/auth/returnUrl";
import { fetchAppVersion } from "@/lib/fetchAppVersion";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { withLocale } from "@/lib/i18n/withLocale";
import { fetchSsoProvidersOnce, type SsoProviderListItem } from "@/lib/sso";
import type { SsoBffLoginResponse } from "@/lib/sso/types";
import { Loader } from "@/components/Loader";

type AuthRoute = "signin" | "register" | "reset-password";

export default function AuthPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { isAuthenticated, setAuthFromResponse } = useAuth();
  const { t, getConfig, appConfig, ssoEnabled, systemLanguages } = useCore();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("0.0.0");
  const [ssoProviders, setSsoProviders] = useState<SsoProviderListItem[]>([]);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const locale = (pathname.split("/").filter(Boolean)[0] ?? "en") as Locale;
  const effectiveLocale = isLocale(locale) ? locale : "en";
  const authHeaders = useSignedFetchHeaders(`${AUTH_SESSION_BFF_BASE}/login`, {
    acceptLanguage: effectiveLocale,
  });
  const homeUrl = withLocale(effectiveLocale, "/");

  // Get route parameter (signin, register, reset-password)
  const routeParam = (searchParams.get("route") ?? "signin") as AuthRoute;
  
  // Password reset token from URL (e.g., /en/auth?route=reset-password&token=xxx)
  const tokenFromQuery = searchParams.get("token")?.trim() ?? "";

  // Determine initial mode based on route param and token
  const getInitialMode = (): "signin" | "register" | "forgotpassword" | "resetconfirm" => {
    if (routeParam === "reset-password") {
      return tokenFromQuery ? "resetconfirm" : "forgotpassword";
    }
    return routeParam === "register" ? "register" : "signin";
  };

  const initialMode = getInitialMode();

  const returnUrl = useMemo(() => {
    const raw = searchParams.get("returnUrl") || homeUrl;
    return validateReturnUrl(raw, homeUrl);
  }, [searchParams, homeUrl]);

  // Redirect authenticated users away from auth pages (except reset-password with token)
  useEffect(() => {
    if (isAuthenticated && !(routeParam === "reset-password" && tokenFromQuery)) {
      router.replace(returnUrl);
    }
  }, [isAuthenticated, routeParam, tokenFromQuery, router, returnUrl]);

  // Fetch SSO providers if SSO is enabled
  const sessionExpired = searchParams.get("expired");
  useEffect(() => {
    if (ssoEnabled && routeParam === "signin") {
      setSsoLoading(true);
      fetchSsoProvidersOnce().then((providers) => {
        if (providers) {
          setSsoProviders(providers);
          
          // Auto-redirect for single provider SSO-only mode.
          // Skip auto-redirect when arriving from a session-expired logout
          // to prevent silent re-auth loops via a still-alive IdP session.
          if (providers.length === 1 && !sessionExpired) {
            setSsoLoading(false);
            setIsRedirecting(true);
            const provider = providers[0];
            persistReturnUrl(returnUrl);
            window.location.href = buildSsoRedirectUrl(
              API_BASE_URL,
              provider.provider_code,
              APP_ID,
              returnUrl
            );
            return;
          }
        }
        setSsoLoading(false);
      });
    }
  }, [ssoEnabled, routeParam, returnUrl, homeUrl, sessionExpired]);

  useEffect(() => {
    let isMounted = true;

    const loadVersion = async () => {
      const appVersion = await fetchAppVersion();
      if (isMounted) {
        setVersion(appVersion);
      }
    };

    void loadVersion();
    return () => {
      isMounted = false;
    };
  }, []);

  // SSO UI: render provider buttons for multi-provider SSO
  const ssoButtons = useMemo(() => {
    if (!ssoEnabled || routeParam !== "signin" || ssoProviders.length <= 1) {
      return null;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
        {ssoProviders.map((provider) => {
          const redirectUrl = buildSsoRedirectUrl(
            API_BASE_URL,
            provider.provider_code,
            APP_ID,
            returnUrl
          );
          return (
            <a
              key={provider.provider_code}
              href={redirectUrl}
              onClick={() => {
                persistReturnUrl(returnUrl);
              }}
              style={{
                display: "block",
                padding: "0.75rem 1rem",
                backgroundColor: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                textAlign: "center",
                textDecoration: "none",
                color: "#374151",
                fontWeight: 500,
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#e5e7eb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#f3f4f6";
              }}
            >
              {provider.display_name || provider.provider_code}
            </a>
          );
        })}
      </div>
    );
  }, [ssoEnabled, routeParam, ssoProviders, returnUrl, homeUrl]);

  const handleSignIn = useCallback(
    async (response: LoginResponse) => {
      setError(null);
      try {
        const bffData: SsoBffLoginResponse = {
          token_type: response.token_type,
          user_id: response.user_id,
          username: response.username,
          email: response.email ?? "",
          auth_provider: "LOCAL",
          access_token: response.access_token || undefined,
          permissions: response.permissions as SsoBffLoginResponse["permissions"],
        };
        const user = persistSessionFromBffLogin(bffData);
        setAuthFromResponse(user, bffData.access_token ?? "");

        const localizedReturnUrl = returnUrl.replace(/^\/[a-z]{2}(\/|$)/i, `/${effectiveLocale}$1`);
        router.push(localizedReturnUrl);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("SIGN_IN_ERROR"));
      }
    },
    [returnUrl, effectiveLocale, t, setAuthFromResponse, router]
  );

  const handleRegisterSuccess = useCallback(async () => {
    setError(null);
  }, []);

  const handlePasswordResetSuccess = useCallback(async () => {
    setError(null);
  }, []);

  const handleResetConfirmSuccess = useCallback(
    async (message: string) => {
      toast.success(message || t("PASSWORD_RESET_CONFIRM_SUCCESS") || "Password updated successfully.");
      // Navigate to signin after successful password reset
      setTimeout(() => {
        const authPath = withLocale(effectiveLocale, "/auth");
        router.push(`${authPath}?route=signin`);
      }, 2000);
    },
    [router, effectiveLocale, t]
  );

  const handleModeChange = useCallback(
    (newMode: "signin" | "register" | "forgotpassword" | "resetconfirm") => {
      const authPath = withLocale(effectiveLocale as Locale, "/auth");
      const params = new URLSearchParams();
      
      // Map internal mode to route parameter
      if (newMode === "register") {
        params.set("route", "register");
        if (returnUrl !== homeUrl) {
          params.set("returnUrl", returnUrl);
        }
      } else if (newMode === "forgotpassword") {
        params.set("route", "reset-password");
      } else if (newMode === "signin") {
        params.set("route", "signin");
        if (returnUrl !== homeUrl) {
          params.set("returnUrl", returnUrl);
        }
      }
      
      const qs = params.toString();
      router.push(`${authPath}${qs ? `?${qs}` : ""}`);
    },
    [router, effectiveLocale, returnUrl, homeUrl]
  );

  const handleLanguageChange = useCallback(
    (value: string) => {
      const newLocale = isLocale(value) ? value : effectiveLocale;
      const authPath = withLocale(newLocale as Locale, "/auth");
      const params = new URLSearchParams();
      
      params.set("route", routeParam);
      
      if (tokenFromQuery) {
        params.set("token", tokenFromQuery);
      }
      
      if (returnUrl !== homeUrl) {
        const localizedReturn = returnUrl.replace(/^\/[a-z]{2}(\/|$)/i, `/${newLocale}$1`);
        params.set("returnUrl", localizedReturn);
      }
      
      const qs = params.toString();
      router.push(`${authPath}${qs ? `?${qs}` : ""}`);
    },
    [router, routeParam, tokenFromQuery, returnUrl, homeUrl, effectiveLocale]
  );

  const logoUrl = getConfig("FLAVOR_LOGO") || DEFAULT_LOGO;
  const appName = getConfig("APP_NAME");

  const languages = useMemo(
    () => systemLanguages.map((lang) => ({ value: lang.locale, label: lang.name || lang.locale })),
    [systemLanguages]
  );

  // Show redirecting message during SSO auto-redirect (takes priority over generic loading)
  if (isRedirecting && ssoProviders.length === 1) {
    const provider = ssoProviders[0];
    const label = `${t("SSO_REDIRECTING") || "Redirecting to"} ${provider.display_name || provider.provider_code}…`;
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader loadingLabel={label} />
      </div>
    );
  }

  // Show loading spinner while fetching SSO providers
  if (ssoEnabled && ssoLoading && routeParam === "signin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader loadingLabel={t("LOADING") || "Loading…"} />
      </div>
    );
  }

  const strings = {
    signIn: t("SIGN_IN"),
    createAccount: t("CREATE_ACCOUNT"),
    forgotPassword: t("FORGOT_PASSSWORD"),
    alreadyHaveAccountPrompt: t("ALREADY_HAVE_ACCOUNT"),
    signInLinkText: t("SIGN_IN_LINK"),
    dontHaveAccountPrompt: t("NO_ACCOUNT"),
    registerHereLinkText: t("REGISTER_HERE"),
    firstName: t("FIRST_NAME"),
    lastName: t("LAST_NAME"),
    username: t("USERNAME"),
    email: t("EMAIL_ADDRESS"),
    emailId: t("EMAIL_ID"),
    password: t("PASSWORD"),
    confirmPassword: t("CONFIRM_PASSWORD"),
    language: t("LANGUAGE"),
    enterUsername: t("USERNAME_PLACEHOLDER"),
    enterPassword: t("PASSWORD_PLACEHOLDER"),
    reEnterPassword: t("CONFIRM_PASSWORD_PLACEHOLDER"),
    enterFirstName: t("FIRST_NAME_PLACEHOLDER"),
    enterLastName: t("LAST_NAME_PLACEHOLDER"),
    enterEmail: t("EMAIL_ID_PLACEHOLDER"),
    signInError: t("SIGN_IN_ERROR"),
    passwordsDoNotMatch: t("PASSWORDS_DO_NOT_MATCH"),
    registrationNotAvailable: t("REGISTRATION_NOT_AVAILABLE"),
    loginTitle: t("LOGIN_SUBTITLE"),
    loginDescription: t("LOGIN_DESCRIPTION"),
    back: t("LOGIN_BACK"),
    forgotPasswordTitle: t("FORGOT_PASSWORD_TITLE"),
    forgotPasswordDescription: t("FORGOT_PASSWORD_DESCRIPTION"),
    send: t("SEND"),
    sending: t("SENDING"),
    passwordResetSuccessMessage: t("PASSWORD_RESET_SUCCESS"),
    redirectingToLogin: t("REDIRECTING_TO_LOGIN"),
    backToSignIn: t("BACK_TO_SIGN_IN"),
    loginFailed: t("LOGIN_SIGN_IN_FAILED"),
    registrationFailed: t("LOGIN_REGISTRATION_FAILED"),
    passwordResetFailed: t("PASSWORD_RESET_FAILED"),
    pwdRuleMinLength: t("PWD_RULE_MIN_LENGTH"),
    pwdRuleUppercase: t("PWD_RULE_UPPERCASE"),
    pwdRuleLowercase: t("PWD_RULE_LOWERCASE"),
    pwdRuleNumber: t("PWD_RULE_NUMBER"),
    pwdRuleSpecial: t("PWD_RULE_SPECIAL"),
    passwordValidationTitle: t("PASSWORD_VALIDATION_TITLE"),
    requiredFieldsError: t("REQUIRED_FIELDS_ERROR"),
    resetPasswordTitle: t("RESET_PASSWORD_TITLE") || "Set New Password",
    resetPasswordDescription: t("RESET_PASSWORD_DESCRIPTION") || "Enter and confirm your new password. It must meet the requirements below.",
    newPassword: t("NEW_PASSWORD") || "New Password",
    enterNewPassword: t("NEW_PASSWORD_PLACEHOLDER") || "Enter new password",
    confirmNewPassword: t("CONFIRM_PASSWORD_PLACEHOLDER"),
    setPassword: t("SET_PASSWORD") || "Set Password",
    settingPassword: t("SETTING_PASSWORD") || "Setting...",
    passwordResetConfirmSuccessMessage: t("PASSWORD_RESET_CONFIRM_SUCCESS") || "Your password has been updated successfully.",
    passwordResetConfirmFailed: t("PASSWORD_RESET_CONFIRM_FAILED") || "Failed to reset password",
    invalidResetToken: t("INVALID_RESET_TOKEN") || "Invalid or expired reset link.",
    strengthWeak: t("WEAK") || "Weak",
    strengthFair: t("FAIR") || "Fair",
    strengthGood: t("GOOD") || "Good",
    strengthStrong: t("STRONG") || "Strong",
    strengthExcellent: t("EXCELLENT") || "Excellent",
    notABot: t("CAPTCHA_NOT_A_BOT", "I'm not a robot"),
    captchaVerifying: t("CAPTCHA_VERIFYING", "Verifying…"),
    captchaProtected: t("CAPTCHA_PROTECTED", "Protected"),
    captchaPrivacy: t("CAPTCHA_PRIVACY", "Privacy"),
    captchaTerms: t("CAPTCHA_TERMS", "Terms"),
    captchaExpired: t("CAPTCHA_EXPIRED", "CAPTCHA expired. Please verify again."),
  };

  return (
    <Login
      baseUrl={AUTH_SESSION_BFF_BASE}
      headers={authHeaders}
      onLoginSuccess={handleSignIn}
      onRegisterSuccess={handleRegisterSuccess}
      onPasswordResetSuccess={handlePasswordResetSuccess}
      onResetConfirmSuccess={handleResetConfirmSuccess}
      initialMode={initialMode}
      initialResetToken={tokenFromQuery}
      onModeChange={handleModeChange}
      logoUrl={logoUrl}
      appName={appName}
      version={version}
      copyrightText={getConfig("APP_FOOTER_NOTE") || undefined}
      onBack={() => router.push(homeUrl)}
      strings={strings}
      error={error}
      languages={languages}
      selectedLanguage={effectiveLocale}
      onLanguageChange={handleLanguageChange}
      renderAfterSubmit={ssoButtons}
      showRegisterPrompt={!ssoEnabled}
      enableCaptcha={true}
    />
  );
}
