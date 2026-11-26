import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "../shared/types";

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SESSION_CRYPTO_KEY: string;
  APP_ENV?: string;
  APP_ORIGIN?: string;
  OWNER_DEFAULT_PHONE?: string;
  ASSETS: Fetcher;
}

export interface AppVariables {
  user: SessionUser;
  sessionId: string;
  sbUserClient: SupabaseClient;
  requestId: string;
}
