"use client";

import { useAppConfig } from "@/contexts/AppConfigContext";
import { DEFAULT_LOGIN_LOGO, getLocaleDisplayName, getLocaleFromPathname } from "@/lib/constants";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSystemLanguagesFromServer } from "@/contexts/CoreContext";
import { SELECTED_LOCALE_STORAGE_KEY } from "@/lib/api/core";
import { useRouter } from "next/navigation";
import { clearStoredAuthUser, getStoredAuthUser } from "@/lib/auth/user";

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "U").toUpperCase();
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [userLabel] = useState<string>(() => {
    const user = getStoredAuthUser();
    if (user?.username) return user.username;
    if (user?.email) return user.email;
    return "";
  });
  const locale = getLocaleFromPathname(pathname);
  const localeLabel = getLocaleDisplayName(locale);
  const { appName, appTitle } = useAppConfig();
  const title = appTitle ?? appName ?? "DFA Dashboard";
  const displayName = userLabel.trim() || "User";
  const initials = getInitials(displayName);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const systemLanguages = useSystemLanguagesFromServer();
  const [selectedLanguage, setSelectedLanguage] = useState<string>(locale);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const logo = DEFAULT_LOGIN_LOGO;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);
  
  const onLanguageChange = useCallback(
    (value: string) => {
      setLanguageMenuOpen(false);
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

  async function onSignOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    clearStoredAuthUser();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="app-header app-header--brand"> 
      <div className="app-header__inner">
        <div className="app-header__start">
          {logo ? (
            <div className="app-header__logo-box">
              <Image
                src={logo}
                alt=""
                width={24}
                height={24}
                unoptimized
                className="h-6 w-auto max-w-[5rem] object-contain"
              />
            </div>
          ) : (
            <span className="app-header__logo-box px-1.5 text-xs font-semibold" aria-hidden>
              {title.slice(0, 1).toUpperCase()}
            </span>
          )}
          <h1 className="app-header__title">{title}</h1>
        </div>

        <div className="app-header__end">
          <div className="app-header__menu-wrap">
            <button
              type="button"
              className="app-header__menu-trigger app-header__menu-trigger--lang"
              aria-label="Language"
              onClick = {() => setLanguageMenuOpen((open) => !open)}
            >
              <LanguageOutlinedIcon className="app-header__icon mui-icon" fontSize="inherit" />
              <span className="app-header__lang-trigger-label hidden sm:inline">
                {localeLabel}
              </span>
              <ExpandMoreIcon className="app-header__icon mui-icon" fontSize="inherit" />
            </button>
            {languageMenuOpen ? (
              <div className="app-header__menu" role="menu">
                {systemLanguages.map((language) => {
                  return <button key={language.locale} type="button" role="menuitem" className={`app-header__menu-item !text-xs !py-1.5 ${language.locale === selectedLanguage ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] text-primary font-medium" : ""}`} onClick={() => onLanguageChange(language.locale)}>
                    <span 
                      className="material-icons mui-icon !text-sm" 
                      style={{ visibility: language.locale === selectedLanguage ? "visible" : "hidden" }}
                    >
                      check
                    </span>
                    {language.name}
                  </button>
                })}
              </div>
            ) : null}
          </div>
            <span className="material-icons mui-icon app-header__icon" aria-hidden>notifications_none</span>

          <div className="app-header__user">
            <button type="button" className="app-header__menu-trigger" aria-label="APPLICATIONS">
            <span className="material-icons mui-icon app-header__icon">apps</span>            
            </button>
          </div>
          <div className="app-header__user">
            <span className="app-header__avatar" aria-hidden>
              {initials}
            </span>
            <span className="app-header__user-name hidden max-w-[160px] truncate sm:inline">
              {displayName}
            </span>
          </div>

          <div className="app-header__menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="app-header__menu-trigger"
              aria-label="User menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="material-icons mui-icon app-header__icon" aria-hidden>more_vert</span>
            </button>
            {menuOpen ? (
              <div className="app-header__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="app-header__menu-item app-header__menu-item--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
