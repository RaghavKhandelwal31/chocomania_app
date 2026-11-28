import React from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Globe, Shield, Home, ClipboardList, Users, IndianRupee, BarChart3 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { APP_UPDATED_AT } from "../lib/buildInfo";
import type { Language } from "../../shared/types";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const { setLanguage } = useAuth();
  const current: Language = i18n.language === "hi" ? "hi" : "en";
  const next: Language = current === "en" ? "hi" : "en";

  return (
    <button
      type="button"
      onClick={() => void setLanguage(next)}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#D9C7B8] bg-white px-3 text-xs font-bold text-[#4A2511] shadow-2xs transition active:scale-95"
      aria-label="Switch Language"
    >
      <Globe className="h-3.5 w-3.5" />
      <span>{current === "en" ? "हिन्दी" : "English"}</span>
    </button>
  );
}

export function VersionFooter() {
  const { t } = useTranslation();
  if (!APP_UPDATED_AT) return null;

  return (
    <footer className="no-print mt-8 border-t border-[#E5D7C6]/80 pt-3 text-center text-[11px] font-semibold tracking-wide text-[#8A6D5B]">
      {t("common.updatedOn", { time: APP_UPDATED_AT })}
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  const isViewer = user.role === "viewer";
  const isOwnerOrAdmin = user.role === "owner" || user.role === "admin";
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen bg-[#FBF7F1] pb-24 text-[#1F1612]">
      <header className="no-print sticky top-0 z-30 border-b border-[#E5D7C6] bg-[#FBF7F1]/92 px-4 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="font-display inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B2E16] to-[#34180B] text-lg font-extrabold text-[#FFFDF9] shadow-xs">
                C
              </span>
              <div className="min-w-0">
                <h1 className="font-display truncate text-lg font-extrabold leading-tight text-[#4A2511]">
                  {t("appName")}
                </h1>
                <p className="truncate text-[11px] font-bold tracking-wide text-[#6E5444]">
                  {user.displayName} • {t(`roles.${user.role}`)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <LanguageToggle />
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#D9C7B8] bg-white px-3 text-xs font-bold text-[#1F1612] shadow-2xs transition active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t("common.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5">
        {children}
        <VersionFooter />
      </main>

      {/* Bottom navigation: NEVER shown for Viewer (77yo single-screen simplicity) */}
      {!isViewer && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[#E5D7C6] bg-white/95 shadow-[0_-4px_16px_rgba(74,37,17,0.06)] backdrop-blur-md">
          <div className="mx-auto flex max-w-xl items-stretch justify-around px-1">
            {isOwnerOrAdmin && (
              <>
                <BottomTab to="/" icon={<Home className="h-5 w-5" />} label={t("nav.home")} />
                <BottomTab
                  to="/orders"
                  icon={<ClipboardList className="h-5 w-5" />}
                  label={t("nav.orders")}
                />
                <BottomTab
                  to="/customers"
                  icon={<Users className="h-5 w-5" />}
                  label={t("nav.customers")}
                />
                <BottomTab
                  to="/dues"
                  icon={<IndianRupee className="h-5 w-5" />}
                  label={t("nav.dues")}
                />
                <BottomTab
                  to="/reports"
                  icon={<BarChart3 className="h-5 w-5" />}
                  label={t("nav.reports")}
                />
              </>
            )}

            {user.role === "worker" && (
              <BottomTab
                to="/production"
                icon={<ClipboardList className="h-5 w-5" />}
                label={t("nav.production")}
              />
            )}

            {isAdmin && (
              <BottomTab
                to="/admin"
                icon={<Shield className="h-5 w-5" />}
                label={t("nav.users")}
              />
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function BottomTab({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold transition ${
          isActive
            ? "border-t-[3px] border-[#4A2511] bg-[#FBF4EC]/80 text-[#4A2511]"
            : "text-[#6E5444] hover:text-[#4A2511]"
        }`
      }
    >
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
