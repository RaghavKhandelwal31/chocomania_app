import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/api";
import { LanguageToggle } from "../components/AppShell";

export function ForcePasswordChangePage() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const [currentSecret, setCurrentSecret] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentSecret, newSecret }),
      });
      setDone(true);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDF9] px-4 py-6 text-[#1F1612]">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <LanguageToggle />
        <button
          type="button"
          onClick={() => void logout()}
          className="min-h-[44px] rounded-xl border-2 border-[#D9C7B8] bg-white px-4 text-sm font-bold"
        >
          {t("common.logout")}
        </button>
      </div>

      <div className="mx-auto mt-6 max-w-md rounded-3xl border-2 border-[#E7D8C9] bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-[#4A2511]">{t("auth.changePasswordTitle")}</h2>
        <p className="mt-2 text-base text-[#5C4538]">
          {user.pinLoginEnabled ? t("auth.changePinSubtitle") : t("auth.changePasswordSubtitle")}
        </p>

        {done ? (
          <div className="mt-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-lg font-bold text-emerald-900">
            {t("auth.passwordUpdated")}
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-3 text-base font-bold text-red-900">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-base font-bold">{t("auth.currentPassword")}</label>
              <input
                type={showSecret ? "text" : "password"}
                required
                value={currentSecret}
                onChange={(e) => setCurrentSecret(e.target.value)}
                className="min-h-[54px] w-full rounded-2xl border-2 border-[#CBB8A6] px-4 text-lg"
              />
            </div>

            <div>
              <label className="mb-1 block text-base font-bold">
                {user.pinLoginEnabled ? t("auth.newPin") : t("auth.newPassword")}
              </label>
              <input
                type={showSecret ? "text" : "password"}
                inputMode={user.pinLoginEnabled ? "numeric" : "text"}
                required
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                className="min-h-[54px] w-full rounded-2xl border-2 border-[#CBB8A6] px-4 text-lg"
              />
              <p className="mt-1 text-sm font-medium text-[#6E5444]">
                {user.pinLoginEnabled ? t("auth.pinRule") : t("auth.passwordRule")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#D9C7B8] px-4 text-base font-bold text-[#4A2511]"
            >
              {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              <span>{showSecret ? t("auth.hidePassword") : t("auth.showPassword")}</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[56px] w-full rounded-2xl bg-[#4A2511] text-lg font-extrabold text-white disabled:opacity-60"
            >
              {t("auth.updatePasswordBtn")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
