import React from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Globe, Shield, Home, ClipboardList, Users, IndianRupee, BarChart3 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-[#4A2511]/20 bg-white px-3 py-2 text-sm font-bold text-[#4A2511] active:scale-95"
      aria-label="Switch Language"
    >
      <Globe className="h-4 w-4" />
      <span>{current === "en" ? "हिन्दी" : "English"}</span>
    </button>
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
    <div className="min-h-screen bg-[#FFFDF9] pb-24 text-[#1F1612]">
      <header className="no-print sticky top-0 z-30 border-b border-[#E7D8C9] bg-[#FFFDF9]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4A2511] text-lg font-bold text-[#FFFDF9]">
                C
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold leading-tight text-[#4A2511]">
                  {t("appName")}
                </h1>
                <p className="truncate text-xs font-semibold text-[#6E5444]">
                  {user.displayName} • {t(`roles.${user.role}`)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-[#D9C7B8] bg-white px-3 py-2 text-sm font-bold text-[#1F1612] active:scale-95"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("common.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5">{children}</main>

      {/* Bottom navigation: NEVER shown for Viewer (77yo single-screen simplicity) */}
      {!isViewer && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[#E7D8C9] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-stretch justify-around">
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
        `flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-bold transition ${
          isActive
            ? "border-t-4 border-[#4A2511] bg-[#FBF4EC] text-[#4A2511]"
            : "text-[#6E5444] hover:text-[#4A2511]"
        }`
      }
    >
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
