// =====================================================================
// get-my-downloads
// Returns the signed-in customer's orders + downloadable items (fresh
// signed URLs) for their account "My downloads" library.
// Auth: verify_jwt = true → identified by the caller's JWT email.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE);
const TTL = 60 * 60;

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing authorization" }, 401);
    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "invalid token" }, 401);
    const email = user.email;
    if (!email) return json({ orders: [], items: [] });

    const { data: orders } = await admin
      .from("orders").select("id, created_at, amount_total_cents, currency, status")
      .or(`customer_email.eq.${email},user_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    const { data: ents } = await admin
      .from("entitlements").select("name, asset_path, expires_at, created_at")
      .eq("customer_email", email)
      .order("created_at", { ascending: false });

    const items = [];
    for (const e of ents ?? []) {
      const { data: signed } = await admin.storage.from("product-assets")
        .createSignedUrl(e.asset_path, TTL, { download: true });
      items.push({ name: e.name, url: signed?.signedUrl ?? null, expires_at: e.expires_at });
    }
    return json({ orders: orders ?? [], items });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
