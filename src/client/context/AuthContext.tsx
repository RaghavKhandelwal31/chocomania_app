import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Language, SessionUser } from "../../shared/types";
import { apiRequest } from "../lib/api";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (username: string, secret: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyLanguage = useCallback(
    (lang: Language) => {
      window.localStorage.setItem("chocomania_lang", lang);
      void i18n.changeLanguage(lang);
    },
    [i18n],
  );

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: SessionUser }>("/api/auth/me");
      setUser(data.user);
      applyLanguage(data.user.preferredLang);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyLanguage]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (username: string, secret: string) => {
      const data = await apiRequest<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim().toLowerCase(), secret }),
      });
      setUser(data.user);
      applyLanguage(data.user.preferredLang);
      return data.user;
    },
    [applyLanguage],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const setLanguage = useCallback(
    async (lang: Language) => {
      applyLanguage(lang);
      if (user) {
        setUser((prev) => (prev ? { ...prev, preferredLang: lang } : null));
        await apiRequest("/api/auth/language", {
          method: "PATCH",
          body: JSON.stringify({ preferredLang: lang }),
        }).catch(() => undefined);
      }
    },
    [applyLanguage, user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, login, logout, setLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
