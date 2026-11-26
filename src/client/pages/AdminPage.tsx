import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Laptop, ShieldAlert, UserPlus } from "lucide-react";
import type {
  AdminUserSummary,
  AuditLogEntry,
  DeviceSessionInfo,
  UserRole,
} from "../../shared/types";
import { apiRequest, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function AdminPage() {
  const { t } = useTranslation();
  const { user: currentUser, refreshUser } = useAuth();
  const [tab, setTab] = useState<"users" | "audit" | "settings">("users");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DeviceSessionInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create user state
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("owner");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [initialSecret, setInitialSecret] = useState("");

  // Settings state
  const [ownerPhone, setOwnerPhone] = useState(currentUser?.ownerPhone ?? "");

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<AdminUserSummary | null>(null);
  const [resetSecret, setResetSecret] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiRequest<{ users: AdminUserSummary[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }, [t]);

  const loadAudit = useCallback(async () => {
    try {
      const data = await apiRequest<{ logs: AuditLogEntry[] }>("/api/admin/audit-logs?limit=60");
      setLogs(data.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }, [t]);

  useEffect(() => {
    if (tab === "users") void loadUsers();
    if (tab === "audit") void loadAudit();
  }, [tab, loadUsers, loadAudit]);

  const openDevices = async (userId: string) => {
    setSelectedUserId(userId);
    const data = await apiRequest<{ sessions: DeviceSessionInfo[] }>(
      `/api/admin/users/${userId}/sessions`,
    );
    setSessions(data.sessions);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          displayName: newDisplayName,
          role: newRole,
          pinLoginEnabled: newRole === "viewer" && pinEnabled,
          initialSecret,
        }),
      });
      setNewUsername("");
      setNewDisplayName("");
      setInitialSecret("");
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const handleToggleDisable = async (target: AdminUserSummary) => {
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${target.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isDisabled: !target.isDisabled }),
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newSecret: resetSecret, forceChange: true }),
      });
      setResetTarget(null);
      setResetSecret("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const handleRevokeDevice = async (userId: string, sessionId: string) => {
    await apiRequest(`/api/admin/users/${userId}/sessions/${sessionId}`, { method: "DELETE" });
    await openDevices(userId);
    await loadUsers();
  };

  const handleLogoutAll = async (userId: string) => {
    await apiRequest(`/api/admin/users/${userId}/logout-all`, { method: "POST" });
    await openDevices(userId);
    await loadUsers();
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiRequest("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ ownerPhone }),
      });
      setNotice(t("admin.phoneSaved"));
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["users", "audit", "settings"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`min-h-[48px] flex-1 rounded-2xl border-2 px-3 text-base font-bold ${
              tab === k
                ? "border-[#4A2511] bg-[#4A2511] text-white"
                : "border-[#D9C7B8] bg-white text-[#4A2511]"
            }`}
          >
            {t(`nav.${k}`)}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-3 text-base font-bold text-red-900">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 text-base font-bold text-emerald-900">
          {notice}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#4A2511]">{t("admin.usersTitle")}</h2>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex min-h-[48px] items-center gap-1.5 rounded-2xl bg-[#4A2511] px-4 text-sm font-bold text-white"
            >
              <UserPlus className="h-4 w-4" />
              <span>{t("admin.createUser")}</span>
            </button>
          </div>

          {showCreate && (
            <form
              onSubmit={(e) => void handleCreateUser(e)}
              className="space-y-3 rounded-3xl border-2 border-[#E7D8C9] bg-white p-4"
            >
              <div>
                <label className="mb-1 block text-sm font-bold">{t("admin.username")}</label>
                <input
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border-2 border-[#CBB8A6] px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">{t("admin.displayName")}</label>
                <input
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border-2 border-[#CBB8A6] px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">{t("admin.role")}</label>
                <select
                  value={newRole}
                  onChange={(e) => {
                    const r = e.target.value as UserRole;
                    setNewRole(r);
                    if (r !== "viewer") setPinEnabled(false);
                  }}
                  className="min-h-[48px] w-full rounded-xl border-2 border-[#CBB8A6] bg-white px-3"
                >
                  <option value="owner">{t("roles.owner")}</option>
                  <option value="worker">{t("roles.worker")}</option>
                  <option value="viewer">{t("roles.viewer")}</option>
                  <option value="admin">{t("roles.admin")}</option>
                </select>
              </div>
              {newRole === "viewer" && (
                <label className="flex min-h-[44px] items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={pinEnabled}
                    onChange={(e) => setPinEnabled(e.target.checked)}
                    className="h-5 w-5"
                  />
                  <span>{t("admin.pinLogin")}</span>
                </label>
              )}
              <div>
                <label className="mb-1 block text-sm font-bold">{t("admin.initialSecret")}</label>
                <input
                  required
                  value={initialSecret}
                  onChange={(e) => setInitialSecret(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border-2 border-[#CBB8A6] px-3"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="min-h-[48px] flex-1 rounded-xl bg-[#4A2511] font-bold text-white"
                >
                  {t("admin.createBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="min-h-[48px] rounded-xl border-2 border-[#D9C7B8] px-4 font-bold"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-extrabold text-[#1F1612]">{u.displayName}</div>
                    <div className="text-sm font-semibold text-[#6E5444]">
                      @{u.username} • {t(`roles.${u.role}`)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {u.isDisabled && (
                      <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                        {t("admin.disabledBadge")}
                      </span>
                    )}
                    {u.mustChangePassword && (
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        {t("admin.mustChangeBadge")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openDevices(u.id)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-[#D9C7B8] px-3 text-sm font-bold text-[#4A2511]"
                  >
                    <Laptop className="h-4 w-4" />
                    <span>
                      {t("admin.viewDevices")} ({u.activeSessionCount})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(u)}
                    className="min-h-[44px] rounded-xl border-2 border-[#D9C7B8] px-3 text-sm font-bold text-[#4A2511]"
                  >
                    {t("admin.resetPassword")}
                  </button>
                  {u.id !== currentUser?.id && (
                    <button
                      type="button"
                      onClick={() => void handleToggleDisable(u)}
                      className="min-h-[44px] rounded-xl border-2 border-red-200 px-3 text-sm font-bold text-red-800"
                    >
                      {u.isDisabled ? t("admin.enable") : t("admin.disable")}
                    </button>
                  )}
                </div>

                {selectedUserId === u.id && (
                  <div className="mt-4 space-y-2 border-t border-[#E7D8C9] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-[#4A2511]">
                        {t("admin.activeDevices")}
                      </span>
                      {sessions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleLogoutAll(u.id)}
                          className="min-h-[40px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white"
                        >
                          {t("admin.logoutAllDevices")}
                        </button>
                      )}
                    </div>
                    {sessions.length === 0 ? (
                      <p className="text-sm text-[#6E5444]">{t("admin.noDevices")}</p>
                    ) : (
                      sessions.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-[#FFFDF9] p-3 text-sm"
                        >
                          <div>
                            <div className="font-bold">
                              {s.deviceLabel}{" "}
                              {s.isCurrent && (
                                <span className="text-xs text-emerald-700">
                                  ({t("admin.currentDevice")})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#6E5444]">
                              {t("admin.lastActive")}:{" "}
                              {new Date(s.lastSeenAt).toLocaleString("en-IN")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeDevice(u.id, s.id)}
                            className="min-h-[40px] rounded-xl border border-red-300 bg-white px-3 text-xs font-bold text-red-800"
                          >
                            {t("admin.logoutDevice")}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {resetTarget && (
            <form
              onSubmit={(e) => void handleResetPassword(e)}
              className="space-y-3 rounded-3xl border-2 border-[#4A2511] bg-white p-4"
            >
              <div className="font-extrabold text-[#4A2511]">
                {t("admin.resetPassword")}: @{resetTarget.username}
              </div>
              <input
                required
                value={resetSecret}
                onChange={(e) => setResetSecret(e.target.value)}
                placeholder={t("admin.newTempPassword")}
                className="min-h-[48px] w-full rounded-xl border-2 border-[#CBB8A6] px-3"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="min-h-[48px] flex-1 rounded-xl bg-[#4A2511] font-bold text-white"
                >
                  {t("common.confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="min-h-[48px] rounded-xl border-2 border-[#D9C7B8] px-4 font-bold"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#4A2511]" />
            <h2 className="text-xl font-extrabold text-[#4A2511]">{t("admin.auditTitle")}</h2>
          </div>
          {logs.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-[#E7D8C9] bg-white p-3 text-sm"
            >
              <div className="flex justify-between font-bold text-[#1F1612]">
                <span>{entry.action}</span>
                <span className="text-xs text-[#6E5444]">
                  {new Date(entry.createdAt).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-xs text-[#5C4538]">
                {entry.actorUsername ?? "system"} ({entry.actorRole ?? "-"})
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <form
          onSubmit={(e) => void handleSavePhone(e)}
          className="space-y-4 rounded-3xl border-2 border-[#E7D8C9] bg-white p-5"
        >
          <label className="block text-base font-extrabold text-[#4A2511]">
            {t("admin.ownerPhoneLabel")}
          </label>
          <input
            type="tel"
            required
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="min-h-[54px] w-full rounded-2xl border-2 border-[#CBB8A6] px-4 text-lg font-semibold"
          />
          <button
            type="submit"
            className="min-h-[54px] w-full rounded-2xl bg-[#4A2511] text-lg font-extrabold text-white"
          >
            {t("admin.savePhone")}
          </button>
        </form>
      )}
    </div>
  );
}
