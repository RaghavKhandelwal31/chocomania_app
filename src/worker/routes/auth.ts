import { Hono } from "hono";
import {
  changePasswordSchema,
  loginSchema,
  updateLanguageSchema,
  validateSecretForRole,
} from "../../shared/validation";
import type { UserRole } from "../../shared/types";
import type { AppVariables, WorkerEnv } from "../types";
import { createAdminClient, createAnonClient, syntheticEmailForUsername } from "../lib/supabase";
import {
  clearSessionCookie,
  createDeviceSession,
  extractIpPrefix,
  parseDeviceLabel,
  revokeAllUserSessions,
} from "../lib/sessions";
import { writeAuditLog } from "../lib/audit";
import { requireAuth } from "../middleware/security";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export const authRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid login input" }, 400);
  }

  const { username, secret, deviceLabel } = parsed.data;
  const adminClient = createAdminClient(c.env);
  const ipPrefix = extractIpPrefix(c);
  const attemptKey = `${username}:${ipPrefix}`;
  const nowMs = Date.now();

  // 1. Check brute-force lockout
  const { data: attemptRow } = await adminClient
    .from("login_attempts")
    .select("fail_count, locked_until")
    .eq("attempt_key", attemptKey)
    .maybeSingle();

  if (attemptRow?.locked_until) {
    const lockedUntilMs = new Date(attemptRow.locked_until as string).getTime();
    if (nowMs < lockedUntilMs) {
      const minsLeft = Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 60_000));
      return c.json(
        { error: `Too many failed attempts. Try again in ${minsLeft} minute(s).` },
        429,
      );
    }
  }

  // 2. Verify profile exists & is active
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("id, username, display_name, role, preferred_lang, must_change_password, is_disabled, pin_login_enabled")
    .eq("username", username)
    .maybeSingle();

  const recordFailure = async (reason: string) => {
    const nextCount = ((attemptRow?.fail_count as number | undefined) ?? 0) + 1;
    const lockedUntil =
      nextCount >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCKOUT_MS).toISOString() : null;
    await adminClient.from("login_attempts").upsert({
      attempt_key: attemptKey,
      fail_count: nextCount,
      locked_until: lockedUntil,
      updated_at: new Date(nowMs).toISOString(),
    });
    await writeAuditLog(adminClient, {
      actorId: (profile?.id as string | undefined) ?? null,
      actorUsername: username,
      actorRole: (profile?.role as string | undefined) ?? null,
      action: "login_failed",
      metadata: { reason, ip_prefix: ipPrefix, fail_count: nextCount },
    });
  };

  if (!profile || profile.is_disabled) {
    await recordFailure(profile?.is_disabled ? "account_disabled" : "unknown_user");
    return c.json({ error: "Invalid username or password" }, 401);
  }

  // 3. Authenticate against Supabase Auth
  const anonClient = createAnonClient(c.env);
  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email: syntheticEmailForUsername(username),
    password: secret,
  });

  if (authErr || !authData.session) {
    await recordFailure("bad_credentials");
    return c.json({ error: "Invalid username or password" }, 401);
  }

  // 4. Clear failed attempts counter
  await adminClient.from("login_attempts").delete().eq("attempt_key", attemptKey);

  // 5. Create rotating device session
  const role = profile.role as UserRole;
  const label = parseDeviceLabel(c.req.header("User-Agent"), deviceLabel);
  await createDeviceSession({
    c,
    adminClient,
    env: c.env,
    userId: profile.id as string,
    role,
    sbAccessToken: authData.session.access_token,
    sbRefreshToken: authData.session.refresh_token,
    deviceLabel: label,
    ipPrefix,
  });

  await writeAuditLog(adminClient, {
    actorId: profile.id as string,
    actorUsername: profile.username as string,
    actorRole: role,
    action: "login_success",
    metadata: { device_label: label, ip_prefix: ipPrefix },
  });

  const { data: ownerPhoneSetting } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("key", "owner_phone")
    .maybeSingle();

  return c.json({
    user: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      role,
      preferredLang: profile.preferred_lang,
      mustChangePassword: Boolean(profile.must_change_password),
      pinLoginEnabled: Boolean(profile.pin_login_enabled),
      ownerPhone:
        (ownerPhoneSetting?.value as string | undefined) ?? c.env.OWNER_DEFAULT_PHONE ?? null,
    },
  });
});

authRoutes.get("/me", requireAuth, async (c) => {
  return c.json({ user: c.get("user") });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const user = c.get("user");
  const sessionId = c.get("sessionId");
  const adminClient = createAdminClient(c.env);

  await adminClient
    .from("user_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: "user_logout",
    })
    .eq("id", sessionId);

  clearSessionCookie(c);
  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "logout",
    targetType: "session",
    targetId: sessionId,
  });

  return c.json({ ok: true });
});

authRoutes.post("/change-password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid password input" }, 400);
  }

  const { currentSecret, newSecret } = parsed.data;
  const policyCheck = validateSecretForRole(newSecret, user.pinLoginEnabled);
  if (!policyCheck.ok) {
    return c.json({ error: policyCheck.message }, 400);
  }
  if (currentSecret === newSecret) {
    return c.json({ error: "New password must be different from your current password" }, 400);
  }

  // Verify current password first
  const anonClient = createAnonClient(c.env);
  const { error: verifyErr } = await anonClient.auth.signInWithPassword({
    email: syntheticEmailForUsername(user.username),
    password: currentSecret,
  });
  if (verifyErr) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const adminClient = createAdminClient(c.env);
  const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newSecret,
  });
  if (updateAuthErr) {
    return c.json({ error: "Could not update password" }, 500);
  }

  await adminClient
    .from("user_profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  // Force logout of ALL sessions on password change
  await revokeAllUserSessions(adminClient, user.id, "password_changed");
  clearSessionCookie(c);

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "password_changed",
    targetType: "user",
    targetId: user.id,
  });

  return c.json({ ok: true, reloginRequired: true });
});

authRoutes.patch("/language", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = updateLanguageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid language selection" }, 400);
  }

  const adminClient = createAdminClient(c.env);
  await adminClient
    .from("user_profiles")
    .update({
      preferred_lang: parsed.data.preferredLang,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return c.json({ preferredLang: parsed.data.preferredLang });
});
