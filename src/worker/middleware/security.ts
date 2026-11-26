import type { MiddlewareHandler } from "hono";
import type { UserRole } from "../../shared/types";
import type { AppVariables, WorkerEnv } from "../types";
import { createAdminClient, createUserClient } from "../lib/supabase";
import { verifyAndRefreshSession } from "../lib/sessions";

export const securityHeadersMiddleware: MiddlewareHandler<{
  Bindings: WorkerEnv;
  Variables: AppVariables;
}> = async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  c.res.headers.set("Pragma", "no-cache");
  if (c.req.url.startsWith("https://")) {
    c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
};

export const csrfProtectionMiddleware: MiddlewareHandler<{
  Bindings: WorkerEnv;
  Variables: AppVariables;
}> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  const reqOrigin = new URL(c.req.url).origin;
  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");

  if (origin) {
    if (origin !== reqOrigin && origin !== c.env.APP_ORIGIN) {
      return c.json({ error: "Cross-origin request blocked" }, 403);
    }
  } else if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (refOrigin !== reqOrigin && refOrigin !== c.env.APP_ORIGIN) {
        return c.json({ error: "Cross-origin referer blocked" }, 403);
      }
    } catch {
      return c.json({ error: "Invalid referer" }, 403);
    }
  } else {
    // Reject browser form submits or missing origin unless explicit X-Requested-With header is sent
    const xrw = c.req.header("X-Requested-With");
    if (xrw !== "chocomania-spa") {
      return c.json({ error: "Missing origin verification" }, 403);
    }
  }

  return next();
};

const ALLOWED_ON_FORCED_CHANGE = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/change-password",
  "/api/auth/language",
]);

export const requireAuth: MiddlewareHandler<{
  Bindings: WorkerEnv;
  Variables: AppVariables;
}> = async (c, next) => {
  const adminClient = createAdminClient(c.env);
  const verified = await verifyAndRefreshSession(c, adminClient);
  if (!verified) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (verified.user.mustChangePassword && !ALLOWED_ON_FORCED_CHANGE.has(c.req.path)) {
    return c.json(
      { error: "Password change required before continuing", code: "MUST_CHANGE_PASSWORD" },
      403,
    );
  }

  c.set("user", verified.user);
  c.set("sessionId", verified.sessionId);
  c.set("sbUserClient", createUserClient(c.env, verified.sbAccessToken));
  return next();
};

export function requireRole(
  ...allowedRoles: UserRole[]
): MiddlewareHandler<{ Bindings: WorkerEnv; Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  };
}
