// =====================================================================
// create-checkout-session
// Builds a Stripe Checkout Session from server-trusted prices.
// The client only sends product/add-on IDs — never prices — so the
// amount charged is always derived from the database.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  try {
    const { productId, addonIds = [], email, successUrl, cancelUrl } = await req.json();
    if (!productId) return json({ error: "productId required" }, 400);

    // Server-trusted product
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, name, tagline, price_cents, currency, cover_image_url, is_active, asset_path")
      .eq("id", productId)
      .single();
    if (pErr || !product) return json({ error: "product not found" }, 404);
    if (!product.is_active) return json({ error: "product not available" }, 400);

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: 1,
      price_data: {
        currency: product.currency,
        unit_amount: product.price_cents,
        product_data: {
          name: product.name,
          description: product.tagline ?? undefined,
          images: product.cover_image_url ? [product.cover_image_url] : undefined,
        },
      },
    }];

    // Server-trusted add-ons (impulse / order bumps)
    let addons: any[] = [];
    if (Array.isArray(addonIds) && addonIds.length > 0) {
      const { data } = await supabase
        .from("addons")
        .select("id, name, pitch, price_cents, currency, cover_image_url, is_active, asset_path")
        .in("id", addonIds)
        .eq("is_active", true);
      addons = data ?? [];
      for (const a of addons) {
        line_items.push({
          quantity: 1,
          price_data: {
            currency: a.currency,
            unit_amount: a.price_cents,
            product_data: {
              name: `Add-on · ${a.name}`,
              description: a.pitch ?? undefined,
              images: a.cover_image_url ? [a.cover_image_url] : undefined,
            },
          },
        });
      }
    }

    const origin = req.headers.get("origin") ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: email || undefined,
      success_url: (successUrl || `${origin}/store/success.html`) + "?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: cancelUrl || `${origin}/store/product.html?slug=${product.id}`,
      allow_promotion_codes: true,
      metadata: {
        product_id: product.id,
        addon_ids: addons.map((a) => a.id).join(","),
      },
    });

    return json({ id: session.id, url: session.url });
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
