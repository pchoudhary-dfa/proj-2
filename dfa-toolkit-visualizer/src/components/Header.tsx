"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { stripGalleryTextFromSessionVizConfig } from "@/lib/visualizer/sessionAdapter";
import { DEFAULT_LOGO, SESSION_STORAGE_KEYS } from "@/lib/constants";
import { parseAppConfigBoolean } from "@/lib/appConfig/utils";
import type { Locale } from "@/lib/i18n/config";
import { VisualizerHeaderSearch } from "@/components/VisualizerHeaderSearch";
import { SignInRequiredModal } from "@/components/SignInRequiredModal";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import LoginIcon from "@mui/icons-material/Login";
import PersonIcon from "@mui/icons-material/Person";
import LogoutIcon from "@mui/icons-material/Logout";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SettingsIcon from "@mui/icons-material/Settings";
import SyncIcon from "@mui/icons-material/Sync";
import TranslateIcon from "@mui/icons-material/Translate";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { AppSettingsDialog } from "@/components/settings/AppSettingsDialog";
import { MapConfigurationPanel } from "@/components/settings/MapConfigurationPanel";
import { AboutPanel } from "@/components/about/AboutPanel";
import { TranslationsPanel } from "@/components/TranslationsPanel";
import { syncSearchData } from "@/lib/api/core";
import { useSearchSyncPoll } from "@/hooks/useSearchSyncPoll";


function withLocale(locale: Locale, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalized === "/" ? "" : normalized}`;
}

function replaceLocaleInPath(pathname: string, nextLocale: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return `/${nextLocale}`;
  // First segment is always the locale in this app's routing structure.
  parts[0] = nextLocale;
  return `/${parts.join("/")}`;
}

export function Header({ locale }: { locale: Locale }) {
  const { t, getConfig, systemLanguages, dataWarehouseId } = useCore();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const isVisualizerPage = pathname.includes("/visualizer");
  const [langOpen, setLangOpen] = useState(false);
  const [signInRequiredOpen, setSignInRequiredOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const [mapsConfigOpen, setMapsConfigOpen] = useState(false);
  const langContainerRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const canSyncSearch = Boolean(user?.isSuperAdmin);
  const { isRunning: syncingSearch, startJob } = useSearchSyncPoll(
    dataWarehouseId,
    canSyncSearch
  );

  const galleryReturnUrl = withLocale(locale, "/gallery");
  const GALLERY_FROM_VISUALIZER_KEY = "galleryFromVisualizer";
  const handleGalleryClick = useCallback(() => {
    if (typeof window !== "undefined") {
      if (pathname.includes("/visualizer")) {
        sessionStorage.setItem(GALLERY_FROM_VISUALIZER_KEY, "true");
        sessionStorage.setItem(
          SESSION_STORAGE_KEYS.VISUALIZER_GALLERY_RETURN,
          window.location.pathname + window.location.search
        );
      } else {
        sessionStorage.removeItem(GALLERY_FROM_VISUALIZER_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_GALLERY_RETURN);
      }
    }
    if (user) {
      router.push(galleryReturnUrl);
    } else {
      setSignInRequiredOpen(true);
    }
  }, [user, router, galleryReturnUrl, pathname]);

  const handleSignInClick = useCallback(() => {
    const returnUrl = pathname || withLocale(locale, "/");
    const authUrl = withLocale(locale, "/auth") + `?route=signin&returnUrl=${encodeURIComponent(returnUrl)}`;
    router.push(authUrl);
  }, [pathname, locale, router]);

  const homeUrl = withLocale(locale, "/");
  const handleSignOut = useCallback(async () => {
    // Clean up session storage first
    if (typeof window !== "undefined") {
      if (pathname.includes("/visualizer")) {
        stripGalleryTextFromSessionVizConfig();
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_GALLERY_RETURN);
          sessionStorage.removeItem(GALLERY_FROM_VISUALIZER_KEY);
          sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_PENDING_VIZ_CONFIG);
        } catch {
          // ignore
        }
      }
    }
    
    // Call signOut (handles cookie clearing and IdP logout redirect for SSO users)
    await signOut();
    
    // For local users (no IdP redirect), manually redirect to home
    if (typeof window !== "undefined") {
      // If we reach here, it means no IdP redirect happened (local auth)
      if (pathname.includes("/gallery")) {
        window.location.replace(homeUrl);
      } else if (pathname.includes("/visualizer")) {
        const nextUrl = new URL(window.location.href);
        if (nextUrl.searchParams.has("gid")) {
          nextUrl.searchParams.delete("gid");
          const path = nextUrl.pathname + (nextUrl.search ? nextUrl.search : "") + (nextUrl.hash || "");
          window.location.replace(path);
        }
      }
    }
  }, [signOut, pathname, homeUrl]);

  const logoUrl = getConfig("FLAVOR_LOGO") || DEFAULT_LOGO;

  const languageEnabled = parseAppConfigBoolean(getConfig("LANGUAGE_ENABLED"));
  const langOptions = systemLanguages.map((lang) => ({
    code: lang.locale,
    label: lang.name || lang.locale,
    isRtl: lang.is_rtl,
  }));
  const handleLangSelect = useCallback(
    (code: string) => {
      setLangOpen(false);
      router.push(replaceLocaleInPath(pathname, code));
    },
    [pathname, router]
  );

  const handleSyncSearchData = useCallback(async () => {
    if (!dataWarehouseId || syncingSearch) return;
    try {
      const res = await syncSearchData(dataWarehouseId);
      if (res.ok) {
        toast.info(t("SYNC_SEARCH_STARTED", "Search tables sync started…"));
        startJob(res.data);
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error(t("SYNC_SEARCH_FAILED", "Failed to trigger search tables sync"));
    }
  }, [dataWarehouseId, syncingSearch, startJob, t]);

  useEffect(() => {
    if (!langOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (langContainerRef.current && !langContainerRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreMenuOpen]);

  const showLangSelect = languageEnabled && langOptions.length > 0;

  return (
    <header className="app-header app-header--surface">
      <div className="app-header__inner">
        <Link href={withLocale(locale, "/")} className="app-header__home-link">
          <div className="app-header__start">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="w-auto h-icon flex-shrink-0"
              />
            ) : (
              <div aria-hidden />
            )}
            <h1>{getConfig("APP_TITLE")}</h1>
          </div>
        </Link>
        {isVisualizerPage && (
          <div className="app-header__center">
            <VisualizerHeaderSearch locale={locale} />
          </div>
        )}
        <div className="app-header__end">
          {showLangSelect && (
            <div className="relative" ref={langContainerRef}>
              <button
                type="button"
                className="btn-comp-secondary pl-2 pr-2"
                onClick={() => setLangOpen((prev) => !prev)}
                aria-expanded={langOpen}
                aria-haspopup="listbox"
                aria-label={t("HEADER_ARIA_SELECT_LANGUAGE")}
              >
                <LanguageIcon className="mui-icon-outlined" aria-hidden />
                <ExpandMoreIcon
                  className="mui-icon-outlined shrink-0 opacity-80"
                  aria-hidden
                />
              </button>
              {langOpen && (
                <ul
                  className="absolute right-0 rtl:right-auto rtl:left-0 top-full z-[100] mt-1 min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-lg"
                  role="listbox"
                  aria-label={t("HEADER_ARIA_LANGUAGE_OPTIONS")}
                >
                  {langOptions.map((opt) => {
                    const isActive = opt.code === locale;
                    return (
                      <li key={opt.code} role="option" aria-selected={isActive}>
                        <button
                          type="button"
                          className="w-full px-md py-sm text-left rtl:text-right text-sm font-body text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                          onClick={() => handleLangSelect(opt.code)}
                        >
                          <span
                            className={
                              isActive ? "font-semibold text-primary" : ""
                            }
                          >
                            {opt.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn-comp-secondary px-2 sm:px-md"
            onClick={handleGalleryClick}
            aria-label={t("HEADER_MY_GALLERY")}
          >
            <BookmarkBorderIcon className="mui-icon-outlined" aria-hidden />
            <span className="hidden sm:inline text-sm">{t("HEADER_MY_GALLERY")}</span>
          </button>
          {user ? (
            <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md bg-surface">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <PersonIcon className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-text text-sm hidden sm:inline max-w-[8rem] truncate">
                {user.displayName}
              </span>
              
              <button
                type="button"
                className="
                  flex items-center gap-1 
                  text-sm text-text-muted 
                  hover:bg-surface-muted 
                  rounded-md py-1 px-2 
                  font-medium ml-0 sm:ml-1 rtl:ml-0 rtl:mr-0 sm:rtl:mr-1
                "
                onClick={handleSignOut}
                aria-label={t("SIGN_OUT")}
              >
                <LogoutIcon className="mui-icon-outlined text-sm" aria-hidden />
                <span className="hidden sm:inline text-sm">{t("SIGN_OUT")}</span>
              </button>
              <div className="relative" ref={moreMenuRef}>
                <button
                  type="button"
                  className="p-1 text-text-muted hover:text-text hover:bg-surface-muted rounded-md transition-colors"
                  onClick={() => setMoreMenuOpen((prev) => !prev)}
                  aria-expanded={moreMenuOpen}
                  aria-haspopup="menu"
                  aria-label={t("MORE_OPTIONS", "More options")}
                >
                  <MoreVertIcon className="w-5 h-5" aria-hidden />
                </button>
                {moreMenuOpen && (
                  <ul
                    className="absolute right-0 rtl:right-auto rtl:left-0 top-full z-[300] mt-1 min-w-[12rem] rounded-md border border-border bg-surface py-1 shadow-lg"
                    role="menu"
                  >
                    <li role="menuitem">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-md py-sm text-left rtl:text-right text-sm font-body text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setSettingsOpen(false);
                          setTranslationsOpen(false);
                          setMapsConfigOpen(false);
                          setAboutOpen(true);
                        }}
                      >
                        <InfoOutlinedIcon className="mui-icon-outlined shrink-0" style={{ fontSize: "1rem" }} aria-hidden />
                        {t("ABOUT_US", "About")}
                      </button>
                    </li>
                    {user.isSuperAdmin && (
                      <li role="menuitem">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-md py-sm text-left rtl:text-right text-sm font-body text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setAboutOpen(false);
                            setSettingsOpen(false);
                            setMapsConfigOpen(false);
                            setTranslationsOpen(true);
                          }}
                        >
                          <TranslateIcon className="mui-icon-outlined shrink-0" style={{ fontSize: "1rem" }} aria-hidden />
                          {t("TRANSLATIONS", "Translations")}
                        </button>
                      </li>
                    )}
                    {user.isSuperAdmin && (
                      <li role="menuitem">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-md py-sm text-left rtl:text-right text-sm font-body text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setAboutOpen(false);
                            setTranslationsOpen(false);
                            setMapsConfigOpen(false);
                            setSettingsOpen(true);
                          }}
                        >
                          <SettingsIcon className="mui-icon-outlined shrink-0" style={{ fontSize: "1rem" }} aria-hidden />
                          {t("SETTINGS", "Settings")}
                        </button>
                      </li>
                    )}
                    {user.isSuperAdmin && (
                      <li role="menuitem">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-md py-sm text-left rtl:text-right text-sm font-body text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setAboutOpen(false);
                            setTranslationsOpen(false);
                            setSettingsOpen(false);
                            setMapsConfigOpen(true);
                          }}
                        >
                          <MapOutlinedIcon className="mui-icon-outlined shrink-0" style={{ fontSize: "1rem" }} aria-hidden />
                          {t("MAP_CONFIGURATION", "Map configuration")}
                        </button>
                      </li>
                    )}
                    {user.isSuperAdmin && (
                      <li role="menuitem">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-md py-sm text-left rtl:text-right text-sm font-body text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none disabled:opacity-50"
                          disabled={syncingSearch}
                          aria-busy={syncingSearch}
                          onClick={() => {
                            setMoreMenuOpen(false);
                            handleSyncSearchData();
                          }}
                        >
                          <SyncIcon className={`mui-icon-outlined shrink-0${syncingSearch ? " animate-spin" : ""}`} style={{ fontSize: "1rem" }} aria-hidden />
                          {t("SYNC_SEARCH_DATA", "Sync Search Data")}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-comp-primary px-2 sm:px-md"
              onClick={handleSignInClick}
              aria-label={t("HEADER_SIGN_IN")}
            >
              <LoginIcon className="mui-icon-outlined" aria-hidden />
              <span className="hidden sm:inline text-sm">{t("HEADER_SIGN_IN")}</span>
            </button>
          )}
        </div>
      </div>
      <SignInRequiredModal
        open={signInRequiredOpen}
        onClose={() => setSignInRequiredOpen(false)}
        returnUrl={galleryReturnUrl}
        locale={locale}
      />
      {user && (
        <AboutPanel
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
        />
      )}
      {user?.isSuperAdmin && (
        <AppSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          locale={locale}
        />
      )}
      {user?.isSuperAdmin && (
        <TranslationsPanel
          open={translationsOpen}
          onClose={() => setTranslationsOpen(false)}
        />
      )}
      {user?.isSuperAdmin && (
        <MapConfigurationPanel
          open={mapsConfigOpen}
          onClose={() => setMapsConfigOpen(false)}
        />
      )}
    </header>
  );
}
