import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntry {
  actorId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  adminClient: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await adminClient.from("audit_logs").insert({
    actor_id: entry.actorId ?? null,
    actor_username: entry.actorUsername ?? null,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.error("audit_log_write_failed", { action: entry.action, code: error.code });
  }
}
