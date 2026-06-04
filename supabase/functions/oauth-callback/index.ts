// =====================================================================
// oauth-callback
// Provider redirects here with ?code&state. We match the pending
// connection by state, exchange the code for tokens (service role),
// store them, fetch an account label, and redirect the customer back
// to their account page. Auth: verify_jwt = false (the provider calls
// this; the state value authenticates the in-flight handshake).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE);

function redirectUri() {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `https://${ref}.functions.supabase.co/oauth-callback`;
}
function fallbackAccount() {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  // Best-effort default; real return_url comes from the pending row.
  return `https://studio0x.io/store/account.html`;
}

function tokenCfg(p: string): any {
  const map: Record<string, any> = {
    google: { tokenUrl: "https://oauth2.googleapis.com/token", clientId: Deno.env.get("GOOGLE_CLIENT_ID"), clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET"), basic: false, userinfo: "https://openidconnect.googleapis.com/v1/userinfo", labelKey: "email" },
    x: { tokenUrl: "https://api.twitter.com/2/oauth2/token", clientId: Deno.env.get("X_CLIENT_ID"), clientSecret: Deno.env.get("X_CLIENT_SECRET"), basic: true, userinfo: "https://api.twitter.com/2/users/me", labelKey: "x" },
    meta: { tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token", clientId: Deno.env.get("META_CLIENT_ID"), clientSecret: Deno.env.get("META_CLIENT_SECRET"), basic: false },
    linkedin: { tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", clientId: Deno.env.get("LINKEDIN_CLIENT_ID"), clientSecret: Deno.env.get("LINKEDIN_CLIENT_SECRET"), basic: false, userinfo: "https://api.linkedin.com/v2/userinfo", labelKey: "name" },
    tiktok: { tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/", clientId: Deno.env.get("TIKTOK_CLIENT_ID"), clientSecret: Deno.env.get("TIKTOK_CLIENT_SECRET"), basic: false },
  };
  return map[p];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const provErr = url.searchParams.get("error");

  // Look up the pending connection by state.
  let row: any = null;
  if (state) {
    const { data } = await admin.from("customer_connections").select("*").eq("state", state).maybeSingle();
    row = data;
  }
  const returnUrl = row?.meta?.return_url || fallbackAccount();

  if (provErr || !code || !row) {
    return redirect(`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}error=${encodeURIComponent(provErr || "oauth_failed")}`);
  }

  try {
    const cfg = tokenCfg(row.provider);
    if (!cfg) throw new Error("unknown provider");

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: cfg.clientId,
    });
    if (row.code_verifier) form.set("code_verifier", row.code_verifier);
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (cfg.basic) headers["Authorization"] = "Basic " + btoa(`${cfg.clientId}:${cfg.clientSecret}`);
    else form.set("client_secret", cfg.clientSecret);

    const tr = await fetch(cfg.tokenUrl, { method: "POST", headers, body: form.toString() });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) throw new Error(`token exchange failed: ${JSON.stringify(tok).slice(0, 300)}`);

    // Best-effort account label.
    let label: string | null = null;
    try {
      if (cfg.userinfo) {
        const ui = await fetch(cfg.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}` } });
        const uj = await ui.json();
        if (cfg.labelKey === "x") label = uj?.data?.username ? `@${uj.data.username}` : null;
        else label = uj?.[cfg.labelKey] ?? uj?.email ?? uj?.name ?? null;
      }
    } catch (_) { /* label is optional */ }

    const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;
    await admin.from("customer_connections").update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? row.refresh_token ?? null,
      token_type: tok.token_type ?? null,
      expires_at: expiresAt,
      account_label: label,
      status: "connected",
      state: null, code_verifier: null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    return redirect(`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}connected=${encodeURIComponent(row.provider)}`);
  } catch (e) {
    console.error(e);
    await admin.from("customer_connections").update({ status: "error", state: null, code_verifier: null }).eq("id", row.id);
    return redirect(`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}error=${encodeURIComponent("connect_failed")}`);
  }
});

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}
