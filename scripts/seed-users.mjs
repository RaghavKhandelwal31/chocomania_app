import { createClient } from "@supabase/supabase-js";

function syntheticEmailForUsername(username) {
  return `${username.toLowerCase()}@chocomania.internal`;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  { username: "admin", displayName: "System Admin", role: "admin", secret: "Admin@Choco2026", pin: false },
  { username: "owner", displayName: "Bakery Owner", role: "owner", secret: "Owner@Choco2026", pin: false },
  { username: "baker", displayName: "Workshop", role: "worker", secret: "Baker@Choco2026", pin: false },
  { username: "viewer", displayName: "Dadaji Handoff", role: "viewer", secret: "777888", pin: true },
];

async function seed() {
  console.log("Seeding demo accounts...");
  for (const u of DEMO_USERS) {
    const email = syntheticEmailForUsername(u.username);
    
    // Check if user already exists
    const { data: existingProfiles } = await admin
      .from("user_profiles")
      .select("id")
      .eq("username", u.username);

    let userId = existingProfiles && existingProfiles[0]?.id;

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: u.secret,
        email_confirm: true,
        app_metadata: { role: u.role },
      });
      if (createErr) {
        // User may exist in auth.users but not in user_profiles — look them up
        const { data: { users: allUsers } } = await admin.auth.admin.listUsers();
        const existing = allUsers?.find(a => a.email === email);
        if (!existing) {
          console.error("Create user error for", u.username, createErr.message);
          continue;
        }
        userId = existing.id;
        await admin.auth.admin.updateUserById(userId, {
          password: u.secret,
          app_metadata: { role: u.role },
        });
      } else {
        userId = created.user.id;
      }
    } else {
      await admin.auth.admin.updateUserById(userId, {
        password: u.secret,
        app_metadata: { role: u.role },
      });
    }

    await admin.from("user_profiles").upsert({
      id: userId,
      username: u.username,
      display_name: u.displayName,
      role: u.role,
      preferred_lang: "en",
      must_change_password: false,
      is_disabled: false,
      pin_login_enabled: u.pin,
      updated_at: new Date().toISOString(),
    });
    console.log(`✓ User ${u.username} (${u.role}) ready`);
  }
}

seed().catch(console.error);
