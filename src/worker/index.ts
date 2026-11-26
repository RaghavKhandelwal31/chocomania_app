import { Hono } from "hono";
import type { AppVariables, WorkerEnv } from "./types";
import { csrfProtectionMiddleware, securityHeadersMiddleware } from "./middleware/security";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { ordersRoutes } from "./routes/orders";
import { customersRoutes } from "./routes/customers";
import { createAdminClient } from "./lib/supabase";

const app = new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();

app.use("*", securityHeadersMiddleware);
app.use("/api/*", csrfProtectionMiddleware);

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "chocomania",
    env: c.env.APP_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/orders", ordersRoutes);
app.route("/api/customers", customersRoutes);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Fallback to static assets (SPA)
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, _ctx: ExecutionContext) {
    // Phase 2 heartbeat + Phase 7 full automated backup
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = createAdminClient(env);
    await admin.from("app_settings").select("key").limit(1);
  },
};
