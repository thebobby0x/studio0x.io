// =====================================================================
// stripe-webhook
// Verifies the Stripe signature and fulfills paid orders:
//   - upserts the order as 'paid'
//   - writes order_items for the product + add-ons
//   - creates entitlements (secure download grants) for each asset
// Configure this URL in Stripe with event: checkout.session.completed
// =====================================================================
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature, WEBHOOK_SECRET, undefined, cryptoProvider,
    );
  } catch (err) {
    console.error("signature verification failed", err);
    return new Response(`bad signature: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await fulfill(session);
    } catch (e) {
      console.error("fulfillment error", e);
      return new Response("fulfillment error", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function fulfill(session: Stripe.Checkout.Session) {
  // Shared Stripe account guard: this account also serves other brands, and
  // Stripe delivers every checkout.session.completed to every endpoint. Only
  // fulfill sessions our own checkout stamped — ignore everything else so we
  // never create junk orders or email another brand's customers.
  if (session.metadata?.source !== "studio0x-market") {
    console.log("skipping non-studio0x session", session.id);
    return;
  }

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const csv = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Supports cart (product_ids) and legacy single (product_id).
  const productIds = csv(session.metadata?.product_ids ?? session.metadata?.product_id ?? "");
  const addonIds = csv(session.metadata?.addon_ids ?? "");

  // Idempotent: one order per checkout session.
  const { data: order } = await supabase
    .from("orders")
    .upsert({
      stripe_session_id: session.id,
      stripe_payment_intent: (session.payment_intent as string) ?? null,
      customer_email: email,
      amount_total_cents: session.amount_total ?? null,
      currency: session.currency ?? "usd",
      status: "paid",
      metadata: session.metadata ?? {},
    }, { onConflict: "stripe_session_id" })
    .select()
    .single();

  if (!order) throw new Error("could not upsert order");

  // Avoid double-fulfillment if Stripe retries the webhook.
  const { count } = await supabase
    .from("order_items").select("id", { count: "exact", head: true })
    .eq("order_id", order.id);
  if ((count ?? 0) > 0) return;

  const items: any[] = [];
  const entitlements: any[] = [];

  // Load all purchased products (cart) — need names + editable_paths.
  let products: any[] = [];
  if (productIds.length) {
    const { data } = await supabase
      .from("products").select("id, name, price_cents, asset_path, editable_paths").in("id", productIds);
    products = data ?? [];
    for (const p of products) {
      items.push({ order_id: order.id, item_type: "product", product_id: p.id, name: p.name, price_cents: p.price_cents, asset_path: p.asset_path });
      if (p.asset_path) entitlements.push({ order_id: order.id, customer_email: email, asset_path: p.asset_path, name: p.name });
      await supabase.rpc("increment_sales", { p_id: p.id }).then(() => {}, () => {});
    }
  }

  if (addonIds.length) {
    const { data: as } = await supabase
      .from("addons").select("id, name, price_cents, asset_path, grants_editable").in("id", addonIds);
    for (const a of as ?? []) {
      items.push({ order_id: order.id, item_type: "addon", addon_id: a.id, name: a.name, price_cents: a.price_cents, asset_path: a.asset_path });
      if (a.grants_editable) {
        // The "Editable Files" upgrade unlocks the editable sources for every
        // purchased product in this order.
        for (const p of products) {
          for (const path of (p.editable_paths ?? [])) {
            const ext = (path.split(".").pop() || "file").toUpperCase();
            entitlements.push({ order_id: order.id, customer_email: email, asset_path: path, name: `${p.name} — editable (${ext})` });
          }
        }
      } else if (a.asset_path) {
        entitlements.push({ order_id: order.id, customer_email: email, asset_path: a.asset_path, name: a.name });
      }
    }
  }

  if (items.length) await supabase.from("order_items").insert(items);
  if (entitlements.length) await supabase.from("entitlements").insert(entitlements);
  await supabase.from("orders").update({ status: "fulfilled" }).eq("id", order.id);

  // Best-effort delivery email (skips silently if RESEND_API_KEY is unset).
  if (email) await sendDeliveryEmail(email, session.id, items);
}

// Sends a branded "your downloads are ready" email via Resend. Links back to
// the success page (which re-issues fresh signed URLs) rather than emailing
// expiring links directly. No-ops if RESEND_API_KEY is not configured.
async function sendDeliveryEmail(email: string, sessionId: string, items: any[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const from = Deno.env.get("FROM_EMAIL") ?? "studio0x market <onboarding@resend.dev>";
  const origin = (Deno.env.get("ALLOWED_ORIGIN") ?? "https://studio0x.io").split(",")[0].trim();
  const link = `${origin}/store/success.html?session_id=${sessionId}`;
  const names = items.filter((i) => i.item_type === "product" || i.asset_path)
    .map((i) => `<li>${escapeHtml(i.name ?? "Your file")}</li>`).join("");
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#231F20;">
      <h2 style="letter-spacing:-0.02em;">Thank you — your downloads are ready 🎉</h2>
      <p>Your purchase from <strong>studio0x market</strong> is complete.</p>
      ${names ? `<p>Included:</p><ul>${names}</ul>` : ""}
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#F7B5CD;color:#231F20;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:700;display:inline-block;">Get your downloads →</a>
      </p>
      <p style="color:#777;font-size:13px;">Bookmark that page to return to your files anytime. Questions? Reply to this email.</p>
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: "Your studio0x market downloads", html }),
    });
    if (!res.ok) console.error("resend send failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("resend error", e);
  }
}

function escapeHtml(s: string) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
