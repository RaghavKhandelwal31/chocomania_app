import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import type { WorkerEnv } from "../../src/worker/types";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  SESSION_CRYPTO_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  APP_ENV: "test",
  APP_ORIGIN: "https://chocomania.example.com",
  ASSETS: {
    fetch: async () => new Response("<html></html>", { status: 200 }),
  } as unknown as Fetcher,
};

describe("Phase 2 security baseline & deny-by-default", () => {
  it("returns security headers on /api/health", async () => {
    const res = await worker.fetch(
      new Request("https://chocomania.example.com/api/health"),
      mockEnv,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("blocks unauthenticated access to protected endpoints", async () => {
    for (const path of ["/api/auth/me", "/api/admin/users", "/api/admin/audit-logs"]) {
      const res = await worker.fetch(
        new Request(`https://chocomania.example.com${path}`),
        mockEnv,
        {} as ExecutionContext,
      );
      expect(res.status).toBe(401);
    }
  });

  it("blocks cross-origin state-changing requests via CSRF protection", async () => {
    const res = await worker.fetch(
      new Request("https://chocomania.example.com/api/auth/login", {
        method: "POST",
        headers: {
          Origin: "https://evil.attacker.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "owner", secret: "Password123" }),
      }),
      mockEnv,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(403);
  });
});
