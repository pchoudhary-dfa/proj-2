"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  getSession,
  getToken,
  signIn as authSignIn,
  signOut as authSignOut,
  register as authRegister,
} from "@/lib/auth/authService";
import { clearServerSession } from "@/lib/auth/sessionCleanup";
import { exchangeSsoCode as authExchangeSsoCode } from "@/lib/sso";
import { SESSION_EXPIRED_EVENT } from "@/lib/api/tokenRefresh";
import { useSessionKeepAlive } from "@/hooks/useSessionKeepAlive";
import type { User, SignInCredentials, RegisterPayload } from "@/lib/auth/types";

interface AuthContextValue {
  user: User | null;
  /** Current JWT bearer token (null when signed out). */
  token: string | null;
  loading: boolean;
  /** True if user is authenticated (has valid token). */
  isAuthenticated: boolean;
  signIn: (credentials: SignInCredentials) => Promise<User>;
  signUp: (payload: RegisterPayload) => Promise<User>;
  signOut: () => Promise<void>;
  /** Set user and token directly from an external auth response (e.g. Login component). */
  setAuthFromResponse: (user: User, token: string) => void;
  /** Exchange SSO one-time code for session (sets httpOnly cookies, returns user). */
  exchangeSsoCode: (code: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSession().then((sessionUser) => {
      if (!cancelled) {
        setUser(sessionUser);
        setToken(sessionUser ? getToken() : null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      void clearServerSession().finally(() => {
        setUser(null);
        setToken(null);
      });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const isAuthenticated =
    !!user &&
    (!!token || user.auth_provider === "SSO" || user.auth_provider === "LOCAL");

  useSessionKeepAlive(isAuthenticated);

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    const u = await authSignIn(credentials);
    setUser(u);
    setToken(getToken());
    return u;
  }, []);

  const signUp = useCallback(async (payload: RegisterPayload) => {
    const u = await authRegister(payload);
    setUser(u);
    setToken(getToken());
    return u;
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setToken(null);
  }, []);

  const setAuthFromResponse = useCallback((user: User, token: string) => {
    setUser(user);
    setToken(token);
  }, []);

  const exchangeSsoCode = useCallback(async (code: string) => {
    const u = await authExchangeSsoCode(code);
    setUser(u);
    // Token is in httpOnly cookie, no setToken needed
    // Keep token as null for SSO users (backward compat check in isAuthenticated)
    return u;
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    loading,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    setAuthFromResponse,
    exchangeSsoCode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
