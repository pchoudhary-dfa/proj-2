"use client";

import { useAppConfig } from "@/contexts/AppConfigContext";
import { useCoreOptional, useSystemLanguagesFromServer } from "@/contexts/CoreContext";
import {
  fetchSystemLanguages,
  fetchSystemApplications,
  languageDisplayName,
  pickDefaultLocale,
  SELECTED_LOCALE_STORAGE_KEY,
  systemLanguagesToOptions,
  type SystemLanguageRow,
  type SystemApplication,
  ENABLED_PRODUCTS_CONFIG_KEY,
  LANGUAGE_ENABLED_CONFIG_KEY,
  getAppConfigValue,
} from "@/lib/api/core";
import { NotificationBell } from "@/components/NotificationBell";
import { useSidebarOptional } from "@/contexts/SidebarContext";
import {
  buildLocaleAppPath,
  DEFAULT_DM_LOGO,
  FALLBACK_DEFAULT_LOCALE,
  SELECTED_DW_STORAGE_KEY,
} from "@/lib/constants";
import { clearLegacyAuthCookies } from "@/lib/auth/cookie";
import {
  clearStoredAuthUser,
  getDisplayInitials,
  getDisplayName,
  getStoredAuthUser,
} from "@/lib/auth/user";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HeaderProps = {
  userName?: string | null;
};

function readStoredDwId(): string {
  if (typeof window === "undefined") return "";
  try {
    const v = window.localStorage.getItem(SELECTED_DW_STORAGE_KEY);
    return v?.trim() ?? "";
  } catch {
    return "";
  }
}

/** DW id for `/{locale}/{dw_id}/…` app pages: sidebar state, then URL, then localStorage. */
function resolveDwIdForWarehouseScopedPage(pathname: string | null, sidebarDwId: string): string {
  const fromSidebar = sidebarDwId.trim();
  if (fromSidebar) return fromSidebar;
  const parts = pathname?.split("/").filter(Boolean) ?? [];
  if (parts.length >= 3 && parts[1] !== "datawarehouse") {
    return parts[1]?.trim() ?? "";
  }
  return readStoredDwId();
}

function headerLanguageFallback(displayLocale: string): { value: string; label: string }[] {
  return [{ value: "en", label: languageDisplayName("en", displayLocale) }];
}

export default function Header({ userName }: HeaderProps) {
  const { appName, appTitle, logo, config } = useAppConfig();
  const core = useCoreOptional();
  const t = core?.t ?? ((code: string, fb?: string) => fb ?? code);
  const router = useRouter();
  const pathname = usePathname();
  const sidebar = useSidebarOptional();
  
  const enabledProducts = getAppConfigValue(config, ENABLED_PRODUCTS_CONFIG_KEY);
  const isProductsEnabled = enabledProducts?.toLowerCase() === "yes";
  const languageEnabled = getAppConfigValue(config, LANGUAGE_ENABLED_CONFIG_KEY);
  const isLanguageSelectorEnabled = languageEnabled?.toLowerCase() === "yes";
  
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [storedName, setStoredName] = useState<string>("User");
  
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  
  const appsMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false);
  const [applications, setApplications] = useState<SystemApplication[]>([]);
  const systemLanguageRowsFromServer = useSystemLanguagesFromServer();
  const uiLocale = core?.locale;
  const pathLocale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
  const isFromUrl = !!pathname;
  const [languages, setLanguages] = useState<{ value: string; label: string }[] | undefined>(undefined);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(pathLocale || FALLBACK_DEFAULT_LOCALE);

  const headerTitle = appTitle ?? appName ?? t("DATA_MANAGER");
  const fallbackLogo = DEFAULT_DM_LOGO;
  const logoSrc = logo ?? fallbackLogo;
  const resolvedUserName = useMemo(() => {
    const explicit = userName?.trim();
    return explicit ? explicit : storedName;
  }, [userName, storedName]);
  const userInitials = useMemo(
    () => getDisplayInitials(resolvedUserName),
    [resolvedUserName]
  );

  const selectedLanguageLabel = useMemo(() => {
    const sel = (selectedLanguage ?? "").trim();
    const norm = (s: string) => s.replace(/_/g, "-").toLowerCase();
    if (!languages?.length) return sel || pathLocale;
    const direct = languages.find((l) => l.value === sel);
    if (direct) return direct.label;
    const ci = languages.find((l) => norm(l.value) === norm(sel));
    if (ci) return ci.label;
    return sel || pathLocale;
  }, [languages, selectedLanguage, pathLocale]);

  useEffect(() => {
    setStoredName(getDisplayName(getStoredAuthUser()));

    const onStorage = (e: StorageEvent) => {
      if (e.key === "dfa-auth-user" || e.key === null) {
        setStoredName(getDisplayName(getStoredAuthUser()));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!isLanguageSelectorEnabled) return;
    let cancelled = false;

    const applyRows = (rows: SystemLanguageRow[]) => {
      const displayLocale = uiLocale || pathLocale || FALLBACK_DEFAULT_LOCALE;
      const opts = systemLanguagesToOptions(rows, displayLocale);
      const list = opts.length > 0 ? opts : headerLanguageFallback(displayLocale);
      setLanguages(list);
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(SELECTED_LOCALE_STORAGE_KEY)
          : null;
      const browser = typeof navigator !== "undefined" ? navigator.language : null;
      const preferred = isFromUrl ? pathLocale : (stored ?? pathLocale ?? browser);
      const initial = pickDefaultLocale(rows, preferred);
      setSelectedLanguage(initial ?? list[0]?.value ?? pathLocale ?? FALLBACK_DEFAULT_LOCALE);
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
          const displayLocale = uiLocale || pathLocale || FALLBACK_DEFAULT_LOCALE;
          setLanguages(headerLanguageFallback(displayLocale));
          setSelectedLanguage(pathLocale || FALLBACK_DEFAULT_LOCALE);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathLocale, isFromUrl, systemLanguageRowsFromServer, uiLocale, isLanguageSelectorEnabled]);

  const onLanguageChange = useCallback(
    (value: string) => {
      setIsLangMenuOpen(false);
      setSelectedLanguage(value);
      try {
        window.localStorage.setItem(SELECTED_LOCALE_STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
      
      const currentSegments = pathname?.split("/").filter(Boolean) ?? [];
      if (currentSegments.length > 0) {
        currentSegments[0] = encodeURIComponent(value);
      } else {
        currentSegments.push(encodeURIComponent(value));
      }
      
      const qs = typeof window !== "undefined" ? window.location.search ?? "" : "";
      const newPath = `/${currentSegments.join("/")}${qs}`;
      router.replace(newPath, { scroll: false });
    },
    [router, pathname]
  );

  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setIsMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isLangMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!langMenuRef.current) return;
      if (langMenuRef.current.contains(event.target as Node)) return;
      setIsLangMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsLangMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isLangMenuOpen]);

  useEffect(() => {
    if (isAppsMenuOpen && applications.length === 0) {
      fetchSystemApplications().then(setApplications);
    }
  }, [isAppsMenuOpen, applications.length]);

  useEffect(() => {
    if (!isAppsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!appsMenuTriggerRef.current) return;
      const target = event.target as Node;
      if (appsMenuTriggerRef.current.contains(target)) return;
      const menu = document.querySelector(".app-header__menu--apps");
      if (menu?.contains(target)) return;
      setIsAppsMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAppsMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isAppsMenuOpen]);

  const onLogout = async () => {
    setIsMenuOpen(false);
    const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;

    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => null);
      const { clearApiCaches } = await import("@/lib/cacheManager");
      await clearApiCaches();
      clearLegacyAuthCookies();
      clearStoredAuthUser();
      const logoutUrl = body?.logout_url;
      if (logoutUrl) {
        window.location.href = logoutUrl;
        return;
      }
    } catch {
      /* BFF unreachable — fall through to local cleanup */
    }

    const { clearApiCaches } = await import("@/lib/cacheManager");
    await clearApiCaches();
    clearLegacyAuthCookies();
    clearStoredAuthUser();
    router.replace(`/${locale}`);
    router.refresh();
  };

  const onAbout = () => {
    setIsMenuOpen(false);
    const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
    const dwId = resolveDwIdForWarehouseScopedPage(pathname, sidebar?.dwId ?? "");
    if (!dwId) {
      router.push(buildLocaleAppPath(locale, "datawarehouse"));
      return;
    }
    router.push(buildLocaleAppPath(locale, "about", dwId));
  };

  const onPreferences = () => {
    setIsMenuOpen(false);
    const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
    router.push(buildLocaleAppPath(locale, "preferences"));
  };

  const onVersionLog = () => {
    setIsMenuOpen(false);
    const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
    router.push(buildLocaleAppPath(locale, "version-log"));
  };

  return (
    <header className="app-header app-header--brand">
      <div className="app-header__inner">
        <div className="app-header__start">
          <div className="app-header__logo-box">
            <img
              src={logoSrc}
              alt={headerTitle}
              className="h-full w-full object-contain"
              onError={(e) => {
                if (e.currentTarget.src.endsWith(fallbackLogo)) return;
                e.currentTarget.src = fallbackLogo;
              }}
            />
          </div>
          <span className="app-header__title">{headerTitle}</span>
        </div>
        <div className="app-header__end">
          {isLanguageSelectorEnabled && (
          <div className="app-header__menu-wrap" ref={langMenuRef}>
            <button
              type="button"
              aria-label={`${t("LANGUAGE")}: ${selectedLanguageLabel}`}
              title={selectedLanguageLabel}
              className="app-header__menu-trigger app-header__menu-trigger--lang"
              onClick={() => setIsLangMenuOpen((v) => !v)}
            >
              <span className="material-icons mui-icon app-header__icon shrink-0">
                language
              </span>
              <span className="app-header__lang-trigger-label">{selectedLanguageLabel}</span>
              <span
                className="material-icons mui-icon shrink-0 text-sm opacity-80"
                style={{ marginInlineStart: "-2px" }}
                aria-hidden
              >
                expand_more
              </span>
            </button>
            {isLangMenuOpen && languages && languages.length > 0 && (
              <div className="app-header__menu" style={{ minWidth: "130px" }}>
                {languages.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    className={`app-header__menu-item !text-xs !py-1.5 ${lang.value === selectedLanguage ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] text-primary font-medium" : ""}`}
                    onClick={() => onLanguageChange(lang.value)}
                  >
                    <span 
                      className="material-icons mui-icon !text-sm" 
                      style={{ visibility: lang.value === selectedLanguage ? "visible" : "hidden" }}
                    >
                      check
                    </span>
                    <span className="truncate">{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          <NotificationBell variant="header" />
          {isProductsEnabled && (
            <div className="app-header__menu-wrap">
              <button
                ref={appsMenuTriggerRef}
                type="button"
                aria-label={t("APPLICATIONS")}
                className="app-header__menu-trigger"
                onClick={() => setIsAppsMenuOpen((v) => !v)}
              >
                <span className="material-icons mui-icon app-header__icon">
                  apps
                </span>
              </button>
              {isAppsMenuOpen && (
                <div className="app-header__menu app-header__menu--apps">
                  <div className="grid grid-cols-3 gap-3 p-1">
                    {applications.length === 0 ? (
                      <div className="col-span-3 py-4 text-center">
                        <span className="text-xs text-text-muted">{t("NO_APPLICATIONS_AVAILABLE")}</span>
                      </div>
                    ) : (
                      applications.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          className="group flex flex-col items-center justify-center p-1 rounded-lg border border-border bg-surface text-center transition-colors hover:bg-surface-muted w-full"
                          onClick={() => {
                            if (app.origin_url) {
                              window.open(app.origin_url, "_blank", "noopener,noreferrer");
                            }
                            setIsAppsMenuOpen(false);
                          }}
                          title={app.description || app.app_name}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted border border-border flex-shrink-0 overflow-hidden">
                            <img
                              src={logoSrc}
                              alt={app.app_name}
                              className="h-8 w-8 object-contain pointer-events-none"
                            />
                          </div>
                          <span className="text-xs font-medium text-text leading-tight pointer-events-none break-normal line-clamp-2 w-full">
                            {app.app_name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="app-header__user">
            <span className="app-header__avatar">
              {userInitials}
            </span>
            <span className="app-header__user-name">{resolvedUserName}</span>
          </div>
          <div className="app-header__menu-wrap" ref={menuRef}>
            <button
              type="button"
              aria-label={t("OPEN_USER_MENU")}
              className="app-header__menu-trigger"
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              <span className="material-icons mui-icon app-header__icon">
                more_vert
              </span>
            </button>
            {isMenuOpen && (
              <div className="app-header__menu">
                <button
                  type="button"
                  className="app-header__menu-item"
                  onClick={onAbout}
                >
                  <span className="material-icons mui-icon !text-sm">
                    help_outline
                  </span>
                  {t("ABOUT")}
                </button>
                <button
                  type="button"
                  className="app-header__menu-item"
                  onClick={onPreferences}
                >
                  <span className="material-icons mui-icon !text-sm">
                    tune
                  </span>
                  {t("PREFERENCES")}
                </button>
                <button
                  type="button"
                  className="app-header__menu-item"
                  onClick={onVersionLog}
                >
                  <span className="material-icons mui-icon !text-sm">
                    system_update_alt
                  </span>
                  {t("VERSION_LOG")}
                </button>
                <div className="app-header__menu-separator" />
                <button
                  type="button"
                  className="app-header__menu-item app-header__menu-item--danger"
                  onClick={onLogout}
                >
                  <span className="material-icons mui-icon !text-sm">
                    logout
                  </span>
                  {t("SIGN_OUT")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
