import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { LanguageToggle, VersionFooter } from "../components/AppShell";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, secret);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF7F1] px-4 py-6 text-[#1F1612]">
      <div className="mx-auto flex max-w-md justify-end">
        <LanguageToggle />
      </div>

      <div className="mx-auto mt-6 max-w-md rounded-3xl border border-[#E5D7C6] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="font-display flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5B2E16] to-[#34180B] text-2xl font-extrabold text-[#FFFDF9] shadow-xs">
            C
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-[#4A2511]">{t("appName")}</h1>
            <p className="text-sm font-medium text-[#6E5444]">{t("appTagline")}</p>
          </div>
        </div>

        <h2 className="text-xl font-bold text-[#1F1612]">{t("auth.signInTitle")}</h2>
        <p className="mt-1 text-base text-[#5C4538]">{t("auth.signInSubtitle")}</p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-base font-bold text-red-900"
          >
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-5">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-lg font-bold text-[#1F1612]">
              {t("auth.username")}
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth.usernamePlaceholder")}
              className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-lg font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-lg font-bold text-[#1F1612]">
              {t("auth.passwordOrPin")}
            </label>
            <input
              id="password"
              name="password"
              type={showSecret ? "text" : "password"}
              autoComplete="current-password"
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-lg font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowSecret((prev) => !prev)}
              className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl border border-[#D9C7B8] bg-[#FFFDF9] px-3.5 text-sm font-bold text-[#4A2511]"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>{showSecret ? t("auth.hidePassword") : t("auth.showPassword")}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[58px] w-full rounded-2xl bg-gradient-to-b from-[#5B2E16] to-[#4A2511] px-6 text-xl font-extrabold text-white shadow-sm active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? t("auth.signingIn") : t("auth.signInBtn")}
          </button>
        </form>
      </div>

      <div className="mx-auto max-w-md">
        <VersionFooter />
      </div>
    </div>
  );
}
