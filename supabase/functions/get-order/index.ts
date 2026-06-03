// =====================================================================
// get-order
// Used by the post-purchase success page. Given a Stripe session_id,
// confirms the session is paid and returns the order's entitlements as
// short-lived signed download URLs. Polls safely while the webhook
// finishes fulfillment.
// =====================================================================
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_TTL = 60 * 60; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { sessionId } = await req.json();
    if (!sessionId) return json({ error: "sessionId required" }, 400);

    // Verify with Stripe that this session is actually paid.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return json({ status: "pending", paid: false, items: [] });
    }

    const { data: order } = await supabase
      .from("orders").select("id, status, customer_email, amount_total_cents, currency")
      .eq("stripe_session_id", sessionId).single();

    // Webhook may not have landed yet — tell the client to keep polling.
    if (!order) return json({ status: "processing", paid: true, items: [] });

    const { data: ents } = await supabase
      .from("entitlements")
      .select("id, name, asset_path, download_token, expires_at, download_count")
      .eq("order_id", order.id);

    const items = [];
    for (const e of ents ?? []) {
      const { data: signed } = await supabase
        .storage.from("product-assets")
        .createSignedUrl(e.asset_path, SIGNED_URL_TTL, { download: true });
      items.push({ name: e.name, url: signed?.signedUrl ?? null, expires_at: e.expires_at });
      await supabase.from("entitlements")
        .update({ download_count: ((e as any).download_count ?? 0) + 1 })
        .eq("id", e.id);
    }

    return json({
      status: order.status,
      paid: true,
      email: order.customer_email,
      amount_total_cents: order.amount_total_cents,
      currency: order.currency,
      items,
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
