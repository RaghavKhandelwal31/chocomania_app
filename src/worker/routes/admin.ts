import { Hono } from "hono";
import {
  createUserSchema,
  resetPasswordSchema,
  updateSettingsSchema,
  validateSecretForRole,
} from "../../shared/validation";
import type { AppVariables, WorkerEnv } from "../types";
import { createAdminClient, syntheticEmailForUsername } from "../lib/supabase";
import { revokeAllUserSessions } from "../lib/sessions";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requireRole } from "../middleware/security";

export const adminRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();

adminRoutes.use("*", requireAuth, requireRole("admin"));

adminRoutes.get("/users", async (c) => {
  const adminClient = createAdminClient(c.env);
  const { data: profiles, error } = await adminClient
    .from("user_profiles")
    .select(
      "id, username, display_name, role, preferred_lang, must_change_password, is_disabled, pin_login_enabled, created_at",
    )
    .order("created_at", { ascending: true });

  if (error) {
    return c.json({ error: "Failed to load users" }, 500);
  }

  const { data: activeSessions } = await adminClient
    .from("user_sessions")
    .select("user_id")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  const counts = new Map<string, number>();
  for (const row of activeSessions ?? []) {
    const uid = row.user_id as string;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }

  return c.json({
    users: (profiles ?? []).map((p) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      role: p.role,
      preferredLang: p.preferred_lang,
      mustChangePassword: Boolean(p.must_change_password),
      isDisabled: Boolean(p.is_disabled),
      pinLoginEnabled: Boolean(p.pin_login_enabled),
      createdAt: p.created_at,
      activeSessionCount: counts.get(p.id as string) ?? 0,
    })),
  });
});

adminRoutes.post("/users", async (c) => {
  const actor = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid user input" }, 400);
  }

  const { username, displayName, role, preferredLang, pinLoginEnabled, initialSecret } =
    parsed.data;

  // Only Viewer can use numeric PIN login; other roles require full password
  if (pinLoginEnabled && role !== "viewer") {
    return c.json({ error: "Numeric PIN login is only allowed for Viewer accounts" }, 400);
  }

  const secretCheck = validateSecretForRole(initialSecret, pinLoginEnabled);
  if (!secretCheck.ok) {
    return c.json({ error: secretCheck.message }, 400);
  }

  const adminClient = createAdminClient(c.env);
  const { data: existing } = await adminClient
    .from("user_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    return c.json({ error: "Username already exists" }, 409);
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: syntheticEmailForUsername(username),
    password: initialSecret,
    email_confirm: true,
    app_metadata: { role },
  });

  if (createErr || !created.user) {
    return c.json({ error: "Could not create auth account" }, 500);
  }

  const { error: profileErr } = await adminClient.from("user_profiles").insert({
    id: created.user.id,
    username,
    display_name: displayName,
    role,
    preferred_lang: preferredLang,
    must_change_password: true,
    is_disabled: false,
    pin_login_enabled: pinLoginEnabled,
  });

  if (profileErr) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return c.json({ error: "Could not save user profile" }, 500);
  }

  await writeAuditLog(adminClient, {
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "user_created",
    targetType: "user",
    targetId: created.user.id,
    metadata: { username, role, pin_login_enabled: pinLoginEnabled },
  });

  return c.json({ id: created.user.id, username, role }, 201);
});

adminRoutes.post("/users/:id/reset-password", async (c) => {
  const actor = c.get("user");
  const targetId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const adminClient = createAdminClient(c.env);
  const { data: target } = await adminClient
    .from("user_profiles")
    .select("id, username, role, pin_login_enabled")
    .eq("id", targetId)
    .maybeSingle();

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  const secretCheck = validateSecretForRole(
    parsed.data.newSecret,
    Boolean(target.pin_login_enabled),
  );
  if (!secretCheck.ok) {
    return c.json({ error: secretCheck.message }, 400);
  }

  const { error: authErr } = await adminClient.auth.admin.updateUserById(targetId, {
    password: parsed.data.newSecret,
  });
  if (authErr) {
    return c.json({ error: "Password reset failed" }, 500);
  }

  await adminClient
    .from("user_profiles")
    .update({
      must_change_password: parsed.data.forceChange,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId);

  await revokeAllUserSessions(adminClient, targetId, "admin_password_reset");

  await writeAuditLog(adminClient, {
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "admin_password_reset",
    targetType: "user",
    targetId,
    metadata: { target_username: target.username },
  });

  return c.json({ ok: true });
});

adminRoutes.patch("/users/:id/status", async (c) => {
  const actor = c.get("user");
  const targetId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { isDisabled?: boolean } | null;
  if (!body || typeof body.isDisabled !== "boolean") {
    return c.json({ error: "isDisabled boolean is required" }, 400);
  }

  if (targetId === actor.id && body.isDisabled) {
    return c.json({ error: "You cannot disable your own active admin account" }, 400);
  }

  const adminClient = createAdminClient(c.env);
  const { data: target } = await adminClient
    .from("user_profiles")
    .select("id, username")
    .eq("id", targetId)
    .maybeSingle();

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  await adminClient
    .from("user_profiles")
    .update({
      is_disabled: body.isDisabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId);

  if (body.isDisabled) {
    await revokeAllUserSessions(adminClient, targetId, "account_disabled");
  }

  await writeAuditLog(adminClient, {
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    action: body.isDisabled ? "user_disabled" : "user_enabled",
    targetType: "user",
    targetId,
    metadata: { target_username: target.username },
  });

  return c.json({ ok: true, isDisabled: body.isDisabled });
});

adminRoutes.get("/users/:id/sessions", async (c) => {
  const targetId = c.req.param("id");
  const currentSessionId = c.get("sessionId");
  const adminClient = createAdminClient(c.env);

  const { data: rows, error } = await adminClient
    .from("user_sessions")
    .select("id, user_id, device_label, ip_prefix, last_seen_at, expires_at, created_at")
    .eq("user_id", targetId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false });

  if (error) {
    return c.json({ error: "Failed to load devices" }, 500);
  }

  return c.json({
    sessions: (rows ?? []).map((s) => ({
      id: s.id,
      userId: s.user_id,
      deviceLabel: s.device_label,
      ipPrefix: s.ip_prefix,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      createdAt: s.created_at,
      isCurrent: s.id === currentSessionId,
    })),
  });
});

adminRoutes.delete("/users/:id/sessions/:sessionId", async (c) => {
  const actor = c.get("user");
  const targetUserId = c.req.param("id");
  const targetSessionId = c.req.param("sessionId");
  const adminClient = createAdminClient(c.env);

  await adminClient
    .from("user_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: "admin_device_revoked",
    })
    .eq("id", targetSessionId)
    .eq("user_id", targetUserId)
    .is("revoked_at", null);

  await writeAuditLog(adminClient, {
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "device_revoked",
    targetType: "session",
    targetId: targetSessionId,
    metadata: { target_user_id: targetUserId },
  });

  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/logout-all", async (c) => {
  const actor = c.get("user");
  const targetUserId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  await revokeAllUserSessions(adminClient, targetUserId, "admin_logout_all");

  await writeAuditLog(adminClient, {
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "all_devices_revoked",
    targetType: "user",
    targetId: targetUserId,
  });

  return c.json({ ok: true });
});

adminRoutes.get("/audit-logs", async (c) => {
  const adminClient = createAdminClient(c.env);
  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const { data, error } = await adminClient
    .from("audit_logs")
    .select("id, actor_id, actor_username, actor_role, action, target_type, target_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return c.json({ error: "Failed to load audit logs" }, 500);
  }

  return c.json({
    logs: (data ?? []).map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorUsername: row.actor_username,
      actorRole: row.actor_role,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    })),
  });
});

adminRoutes.patch("/settings", async (c) => {
  const actor = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid phone" }, 400);
  }

  const adminClient = createAdminClient(c.env);
  await adminClient.from("app_settings").upsert({
    key: "owner_phone",
    value: parsed.data.ownerPhone,
    updated_at: new Date().toISOString(),
  });

  await writeAuditLog(adminClient, {
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "settings_updated",
    targetType: "settings",
    targetId: "owner_phone",
  });

  return c.json({ ownerPhone: parsed.data.ownerPhone });
});
