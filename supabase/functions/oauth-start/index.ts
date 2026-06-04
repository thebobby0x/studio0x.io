// =====================================================================
// oauth-start
// Begins a per-customer OAuth connection. Verifies the customer's JWT,
// creates a 'pending' connection row (with CSRF state + PKCE verifier),
// and returns the provider's authorize URL. Returns { error:'setup_needed' }
// if the provider's client credentials aren't configured yet.
// Auth: verify_jwt = true.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE);

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function redirectUri() {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `https://${ref}.functions.supabase.co/oauth-callback`;
}

// Provider registry. A provider is "live" only when its client id+secret
// env vars are set (you create the app with each provider and add them).
function providerCfg(p: string): any {
  const map: Record<string, any> = {
    google: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      scope: "openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.compose",
      clientId: Deno.env.get("GOOGLE_CLIENT_ID"), clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
      pkce: false, extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    },
    x: {
      authUrl: "https://twitter.com/i/oauth2/authorize",
      scope: "tweet.read tweet.write users.read offline.access",
      clientId: Deno.env.get("X_CLIENT_ID"), clientSecret: Deno.env.get("X_CLIENT_SECRET"), pkce: true,
    },
    meta: {
      authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
      scope: "public_profile,pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish",
      clientId: Deno.env.get("META_CLIENT_ID"), clientSecret: Deno.env.get("META_CLIENT_SECRET"), pkce: false,
    },
    linkedin: {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      scope: "openid profile email w_member_social",
      clientId: Deno.env.get("LINKEDIN_CLIENT_ID"), clientSecret: Deno.env.get("LINKEDIN_CLIENT_SECRET"), pkce: false,
    },
    tiktok: {
      authUrl: "https://www.tiktok.com/v2/auth/authorize/",
      scope: "user.info.basic,video.publish",
      clientId: Deno.env.get("TIKTOK_CLIENT_ID"), clientSecret: Deno.env.get("TIKTOK_CLIENT_SECRET"), pkce: true,
    },
    // singularityLab: customer's AI command center — no public API yet.
    singularitylab: { unavailable: true },
  };
  return map[p];
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing authorization" }, 401);
    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "invalid token" }, 401);

    const { provider, returnUrl } = await req.json();
    const cfg = providerCfg(provider);
    if (!cfg || cfg.unavailable || !cfg.clientId || !cfg.clientSecret) {
      return json({ error: "setup_needed" });
    }

    const state = b64url(crypto.getRandomValues(new Uint8Array(24)).buffer);
    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (cfg.pkce) {
      codeVerifier = b64url(crypto.getRandomValues(new Uint8Array(48)).buffer);
      codeChallenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier)));
    }

    await admin.from("customer_connections").upsert({
      user_id: user.id, provider, status: "pending", scopes: cfg.scope,
      state, code_verifier: codeVerifier, account_label: null,
      meta: { return_url: returnUrl || "" }, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: redirectUri(),
      scope: cfg.scope,
      state,
      ...(cfg.extra ?? {}),
    });
    if (cfg.pkce) { params.set("code_challenge", codeChallenge!); params.set("code_challenge_method", "S256"); }

    return json({ url: `${cfg.authUrl}?${params.toString()}` });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
