import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language, SessionUser, UserRole } from "../../shared/types";
import type { AppVariables, WorkerEnv } from "../types";
import { decryptSecret, encryptSecret, randomTokenHex, sha256Hex, timingSafeEqual } from "./crypto";
import { createAnonClient } from "./supabase";
import { writeAuditLog } from "./audit";

const COOKIE_NAME_HTTPS = "__Host-chocomania_sid";
const COOKIE_NAME_HTTP = "chocomania_sid";
const REUSE_GRACE_MS = 10_000;
const ROTATE_INTERVAL_MS = 15 * 60 * 1000;

export function getSessionCookieName(url: string): string {
  return url.startsWith("https://") ? COOKIE_NAME_HTTPS : COOKIE_NAME_HTTP;
}

export function parseDeviceLabel(userAgent: string | undefined, explicit?: string): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim().slice(0, 100);
  }
  const ua = userAgent ?? "";
  let browser = "Browser";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Safari/")) browser = "Safari";

  let os = "Device";
  if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

export function extractIpPrefix(c: Context): string {
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "";
  if (!ip) return "";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.slice(0, 3).join(".") + ".x";
  }
  return ip.split(":").slice(0, 3).join(":") + "::";
}

function getSessionLifetimes(role: UserRole): { maxMs: number; idleMs: number } {
  if (role === "admin") {
    return {
      maxMs: 14 * 24 * 60 * 60 * 1000,
      idleMs: 7 * 24 * 60 * 60 * 1000,
    };
  }
  // Owner, Worker, Viewer: stay logged in up to 1 year sliding inactivity
  return {
    maxMs: 365 * 24 * 60 * 60 * 1000,
    idleMs: 365 * 24 * 60 * 60 * 1000,
  };
}

export function setSessionCookie(
  c: Context,
  sessionId: string,
  refreshSecret: string,
  role: UserRole,
): void {
  const isHttps = c.req.url.startsWith("https://");
  const cookieName = getSessionCookieName(c.req.url);
  const { maxMs } = getSessionLifetimes(role);
  setCookie(c, cookieName, `${sessionId}.${refreshSecret}`, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(maxMs / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  const isHttps = c.req.url.startsWith("https://");
  deleteCookie(c, getSessionCookieName(c.req.url), {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    path: "/",
  });
}

function decodeJwtExpiryMs(jwt: string): number | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function createDeviceSession(params: {
  c: Context;
  adminClient: SupabaseClient;
  env: WorkerEnv;
  userId: string;
  role: UserRole;
  sbAccessToken: string;
  sbRefreshToken: string;
  deviceLabel: string;
  ipPrefix: string;
}): Promise<{ sessionId: string }> {
  const { c, adminClient, env, userId, role, sbAccessToken, sbRefreshToken, deviceLabel, ipPrefix } =
    params;
  const refreshSecret = randomTokenHex(32);
  const tokenHash = await sha256Hex(refreshSecret);
  const familyId = crypto.randomUUID();
  const now = Date.now();
  const { maxMs, idleMs } = getSessionLifetimes(role);

  const accessEnc = await encryptSecret(sbAccessToken, env.SESSION_CRYPTO_KEY);
  const refreshEnc = await encryptSecret(sbRefreshToken, env.SESSION_CRYPTO_KEY);

  const { data, error } = await adminClient
    .from("user_sessions")
    .insert({
      user_id: userId,
      family_id: familyId,
      token_hash: tokenHash,
      sb_access_token_enc: accessEnc,
      sb_refresh_token_enc: refreshEnc,
      device_label: deviceLabel,
      ip_prefix: ipPrefix,
      expires_at: new Date(now + maxMs).toISOString(),
      idle_expires_at: new Date(now + idleMs).toISOString(),
      last_seen_at: new Date(now).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Failed to create session");
  }

  setSessionCookie(c, data.id as string, refreshSecret, role);
  return { sessionId: data.id as string };
}

export interface VerifiedSessionResult {
  user: SessionUser;
  sessionId: string;
  sbAccessToken: string;
}

export async function verifyAndRefreshSession(
  c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>,
  adminClient: SupabaseClient,
): Promise<VerifiedSessionResult | null> {
  const rawCookie = getCookie(c, getSessionCookieName(c.req.url));
  if (!rawCookie) return null;

  const dotIdx = rawCookie.indexOf(".");
  if (dotIdx <= 0) return null;

  const sessionId = rawCookie.slice(0, dotIdx);
  const secret = rawCookie.slice(dotIdx + 1);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || secret.length < 32) {
    return null;
  }

  const { data: sessionRow, error: sessionErr } = await adminClient
    .from("user_sessions")
    .select(
      "id, user_id, family_id, token_hash, prev_token_hash, prev_rotated_at, sb_access_token_enc, sb_refresh_token_enc, expires_at, idle_expires_at, last_seen_at, revoked_at",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !sessionRow || sessionRow.revoked_at) {
    return null;
  }

  const nowMs = Date.now();
  const expiresAtMs = new Date(sessionRow.expires_at as string).getTime();
  const idleExpiresAtMs = new Date(sessionRow.idle_expires_at as string).getTime();
  if (nowMs > expiresAtMs || nowMs > idleExpiresAtMs) {
    await adminClient
      .from("user_sessions")
      .update({ revoked_at: new Date(nowMs).toISOString(), revoke_reason: "expired" })
      .eq("id", sessionId);
    clearSessionCookie(c);
    return null;
  }

  const presentedHash = await sha256Hex(secret);
  const isCurrentToken = timingSafeEqual(presentedHash, sessionRow.token_hash as string);
  const prevHash = sessionRow.prev_token_hash as string | null;
  const prevRotatedAtMs = sessionRow.prev_rotated_at
    ? new Date(sessionRow.prev_rotated_at as string).getTime()
    : 0;
  const isWithinGraceWindow =
    !isCurrentToken &&
    prevHash !== null &&
    timingSafeEqual(presentedHash, prevHash) &&
    nowMs - prevRotatedAtMs <= REUSE_GRACE_MS;

  if (!isCurrentToken && !isWithinGraceWindow) {
    // Token reuse attack detected -> revoke entire token family immediately!
    await adminClient
      .from("user_sessions")
      .update({
        revoked_at: new Date(nowMs).toISOString(),
        revoke_reason: "token_reuse_detected",
      })
      .eq("family_id", sessionRow.family_id as string)
      .is("revoked_at", null);

    await writeAuditLog(adminClient, {
      actorId: sessionRow.user_id as string,
      action: "session_reuse_detected",
      targetType: "session",
      targetId: sessionId,
      metadata: { family_id: sessionRow.family_id },
    });
    clearSessionCookie(c);
    return null;
  }

  // Load user profile & verify account is active
  const { data: profile, error: profErr } = await adminClient
    .from("user_profiles")
    .select("id, username, display_name, role, preferred_lang, must_change_password, is_disabled, pin_login_enabled")
    .eq("id", sessionRow.user_id as string)
    .maybeSingle();

  if (profErr || !profile || profile.is_disabled) {
    await adminClient
      .from("user_sessions")
      .update({ revoked_at: new Date(nowMs).toISOString(), revoke_reason: "account_disabled" })
      .eq("user_id", sessionRow.user_id as string)
      .is("revoked_at", null);
    clearSessionCookie(c);
    return null;
  }

  const role = profile.role as UserRole;

  let sbAccessToken = await decryptSecret(
    sessionRow.sb_access_token_enc as string,
    c.env.SESSION_CRYPTO_KEY,
  );
  let sbRefreshToken = await decryptSecret(
    sessionRow.sb_refresh_token_enc as string,
    c.env.SESSION_CRYPTO_KEY,
  );

  const jwtExp = decodeJwtExpiryMs(sbAccessToken);
  const needsSupabaseRefresh = !jwtExp || jwtExp - nowMs < 5 * 60 * 1000;
  const lastSeenMs = new Date(sessionRow.last_seen_at as string).getTime();
  const needsTokenRotation = isCurrentToken && nowMs - lastSeenMs > ROTATE_INTERVAL_MS;

  if (needsSupabaseRefresh) {
    const anon = createAnonClient(c.env);
    const { data: refreshed, error: refreshErr } = await anon.auth.refreshSession({
      refresh_token: sbRefreshToken,
    });
    if (refreshErr || !refreshed.session) {
      await adminClient
        .from("user_sessions")
        .update({
          revoked_at: new Date(nowMs).toISOString(),
          revoke_reason: "supabase_refresh_failed",
        })
        .eq("id", sessionId);
      clearSessionCookie(c);
      return null;
    }
    sbAccessToken = refreshed.session.access_token;
    sbRefreshToken = refreshed.session.refresh_token;
  }

  if (needsSupabaseRefresh || needsTokenRotation) {
    const { idleMs, maxMs } = getSessionLifetimes(role);
    const updatePayload: Record<string, unknown> = {
      last_seen_at: new Date(nowMs).toISOString(),
      idle_expires_at: new Date(nowMs + idleMs).toISOString(),
    };

    // For non-admin roles, slide the absolute expiry on active use up to 1 year from now
    if (role !== "admin") {
      updatePayload.expires_at = new Date(nowMs + maxMs).toISOString();
    }

    if (needsSupabaseRefresh) {
      updatePayload.sb_access_token_enc = await encryptSecret(
        sbAccessToken,
        c.env.SESSION_CRYPTO_KEY,
      );
      updatePayload.sb_refresh_token_enc = await encryptSecret(
        sbRefreshToken,
        c.env.SESSION_CRYPTO_KEY,
      );
    }

    if (needsTokenRotation) {
      const nextSecret = randomTokenHex(32);
      const nextHash = await sha256Hex(nextSecret);
      updatePayload.prev_token_hash = sessionRow.token_hash;
      updatePayload.prev_rotated_at = new Date(nowMs).toISOString();
      updatePayload.token_hash = nextHash;
      setSessionCookie(c, sessionId, nextSecret, role);
    }

    await adminClient.from("user_sessions").update(updatePayload).eq("id", sessionId);
  }

  // Fetch owner_phone setting (only safe business contact for Call Owner)
  const { data: ownerPhoneSetting } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("key", "owner_phone")
    .maybeSingle();

  const user: SessionUser = {
    id: profile.id as string,
    username: profile.username as string,
    displayName: profile.display_name as string,
    role,
    preferredLang: profile.preferred_lang as Language,
    mustChangePassword: Boolean(profile.must_change_password),
    pinLoginEnabled: Boolean(profile.pin_login_enabled),
    ownerPhone: (ownerPhoneSetting?.value as string | undefined) ?? c.env.OWNER_DEFAULT_PHONE ?? null,
  };

  return { user, sessionId, sbAccessToken };
}

export async function revokeAllUserSessions(
  adminClient: SupabaseClient,
  userId: string,
  reason: string,
): Promise<void> {
  await adminClient
    .from("user_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: reason,
    })
    .eq("user_id", userId)
    .is("revoked_at", null);
}
