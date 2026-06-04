// =====================================================================
// admin-create-user
// Superadmin-only: creates a new admin/superadmin teammate with a
// server-generated temporary password and sets their profile role.
//
// Auth: verify_jwt = true (see config.toml). The caller's Supabase JWT
// is required; we verify the caller is a SUPERADMIN using a token-bound
// client, and use the SERVICE ROLE client for the privileged user/role
// writes. The temp password is returned ONCE so the admin can share it.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service-role client for trusted, RLS-bypassing writes.
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = ["admin", "superadmin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- Auth: verify the caller is a SUPERADMIN using their own JWT -----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing authorization" }, 401);

  // Client bound to the caller's token — RLS + auth.uid() apply here.
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: "invalid token" }, 401);

  const { data: profile } = await caller
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "superadmin") {
    return json({ error: "superadmin access required" }, 403);
  }

  // --- Parse input -----------------------------------------------------
  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const email = (body.email || "").trim();
  if (!email) return json({ error: "email required" }, 400);
  const role = ALLOWED_ROLES.includes(body.role || "") ? body.role! : "admin";

  // --- Create the user with a strong temporary password ----------------
  const tempPassword = `Studio0x-${crypto.randomUUID().slice(0, 8)}!`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    const m = (createErr?.message || "").toLowerCase();
    // Surface an already-registered email as a clear 409.
    if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
      return json({ error: "a user with that email already exists" }, 409);
    }
    return json({ error: createErr?.message || "could not create user" }, 500);
  }

  const newUserId = created.user.id;

  // --- Set the profile role. The handle_new_user trigger inserts the ---
  // profile row on user creation; update it (upsert as a safety net).
  const { error: roleErr } = await admin
    .from("profiles")
    .upsert({ id: newUserId, email, role }, { onConflict: "id" });
  if (roleErr) {
    return json({ error: `user created but role update failed: ${roleErr.message}` }, 500);
  }

  return json({ email, role, tempPassword });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
