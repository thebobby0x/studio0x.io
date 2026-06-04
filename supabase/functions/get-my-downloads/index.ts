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
      const ext = (e.asset_path.split(".").pop() || "").toLowerCase();
      items.push({
        name: e.name,
        url: signed?.signedUrl ?? null,
        product_id: (e.asset_path.split("/")[0]) || null,
        kind: ext === "pdf" ? "PDF" : ext === "docx" ? "DOCX" : ext === "md" ? "Markdown" : ext.toUpperCase() || "File",
        expires_at: e.expires_at,
      });
    }

    // Distinct purchased products (for per-product "doer" actions).
    let products: any[] = [];
    const orderIds = (orders ?? []).map((o) => o.id);
    if (orderIds.length) {
      const { data: oi } = await admin
        .from("order_items").select("product_id").eq("item_type", "product").in("order_id", orderIds);
      const pids = [...new Set((oi ?? []).map((x) => x.product_id).filter(Boolean))];
      if (pids.length) {
        const { data: ps } = await admin.from("products").select("id, name, slug, editable_paths").in("id", pids);
        products = (ps ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, has_editable: (p.editable_paths ?? []).length > 0 }));
      }
    }

    return json({ orders: orders ?? [], items, products });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
