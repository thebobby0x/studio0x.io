// =====================================================================
// action-run
// The "doers": use a customer's connected account to take action on a
// product they purchased.
//   save_to_drive  → upload the kit's files to their Google Drive
//   gmail_draft    → create a Gmail draft from the kit's content
//   post_to_x      → post text to their X/Twitter
// Auth: verify_jwt = true. We verify the caller bought the product
// (has an entitlement), then use their stored OAuth token (refreshing
// if needed). Tokens never leave the server.
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

const ACTION_PROVIDER: Record<string, string> = {
  save_to_drive: "google",
  gmail_draft: "google",
  post_to_x: "x",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing authorization" }, 401);
    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "invalid token" }, 401);
    const email = user.email!;

    const { action, productId, text } = await req.json();
    const provider = ACTION_PROVIDER[action];
    if (!provider) return json({ error: "unknown action" }, 400);

    // Load product + verify the caller actually purchased it.
    const { data: product } = await admin
      .from("products").select("id, name, slug, tagline, asset_path, editable_paths").eq("id", productId).single();
    if (!product) return json({ error: "product not found" }, 404);

    const { data: owned } = await admin
      .from("entitlements").select("id").eq("customer_email", email).like("asset_path", `${productId}/%`).limit(1);
    if (!owned || owned.length === 0) return json({ error: "not_purchased" }, 403);

    // Get a valid OAuth token for the provider (refresh if expired).
    const access = await getValidToken(user.id, provider);
    if (!access) return json({ error: "not_connected", need: provider }, 409);

    if (action === "save_to_drive") return json(await saveToDrive(access, product));
    if (action === "gmail_draft") return json(await gmailDraft(access, product, email));
    if (action === "post_to_x") return json(await postToX(access, product, text));
    return json({ error: "unhandled action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ── Token management ────────────────────────────────────────────────
async function getValidToken(userId: string, provider: string): Promise<string | null> {
  const { data: conn } = await admin.from("customer_connections")
    .select("*").eq("user_id", userId).eq("provider", provider).eq("status", "connected").maybeSingle();
  if (!conn?.access_token) return null;
  const expired = conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token; // best effort

  const refreshed = await refreshToken(provider, conn.refresh_token);
  if (!refreshed?.access_token) return conn.access_token;
  await admin.from("customer_connections").update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? conn.refresh_token,
    expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", conn.id);
  return refreshed.access_token;
}

async function refreshToken(provider: string, refresh_token: string): Promise<any> {
  const cfg: Record<string, any> = {
    google: { url: "https://oauth2.googleapis.com/token", id: Deno.env.get("GOOGLE_CLIENT_ID"), secret: Deno.env.get("GOOGLE_CLIENT_SECRET"), basic: false },
    x: { url: "https://api.twitter.com/2/oauth2/token", id: Deno.env.get("X_CLIENT_ID"), secret: Deno.env.get("X_CLIENT_SECRET"), basic: true },
  }[provider];
  if (!cfg) return null;
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token, client_id: cfg.id });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (cfg.basic) headers["Authorization"] = "Basic " + btoa(`${cfg.id}:${cfg.secret}`);
  else form.set("client_secret", cfg.secret);
  const r = await fetch(cfg.url, { method: "POST", headers, body: form.toString() });
  return r.ok ? await r.json() : null;
}

// ── Doers ───────────────────────────────────────────────────────────
async function fileBytes(path: string): Promise<Uint8Array | null> {
  const { data } = await admin.storage.from("product-assets").download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
const mimeFor = (path: string) =>
  path.endsWith(".pdf") ? "application/pdf"
  : path.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  : path.endsWith(".md") ? "text/markdown" : "application/octet-stream";

async function saveToDrive(access: string, product: any) {
  const paths = [product.asset_path, ...(product.editable_paths ?? [])].filter(Boolean);
  const saved: string[] = [];
  for (const p of paths) {
    const bytes = await fileBytes(p);
    if (!bytes) continue;
    const filename = `${product.slug}-${p.split("/").pop()}`;
    const boundary = "s0x" + crypto.randomUUID().replace(/-/g, "");
    const meta = JSON.stringify({ name: filename });
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeFor(p)}\r\n\r\n`;
    const body = new Blob([pre, bytes, `\r\n--${boundary}--`]);
    const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (r.ok) { const j = await r.json(); saved.push(j.name || filename); }
    else console.error("drive upload failed", await r.text().catch(() => ""));
  }
  if (!saved.length) return { error: "drive_upload_failed" };
  return { ok: true, message: `Saved ${saved.length} file(s) to your Google Drive.`, files: saved };
}

async function gmailDraft(access: string, product: any, toEmail: string) {
  // Use the markdown source as the draft body when available.
  const mdPath = (product.editable_paths ?? []).find((p: string) => p.endsWith(".md"));
  let bodyText = `Your "${product.name}" kit from studio0x market.\n\n`;
  if (mdPath) { const b = await fileBytes(mdPath); if (b) bodyText += new TextDecoder().decode(b).slice(0, 12000); }
  const subject = `${product.name} — your templates`;
  const raw = b64url(new TextEncoder().encode(
    `To: ${toEmail}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${bodyText}`,
  ));
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!r.ok) { console.error("gmail draft failed", await r.text().catch(() => "")); return { error: "gmail_draft_failed" }; }
  return { ok: true, message: "Created a Gmail draft with your kit — open Gmail → Drafts." };
}

async function postToX(access: string, product: any, text?: string) {
  const body = (text && String(text).trim()) || (product.tagline || product.name);
  const r = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: String(body).slice(0, 280) }),
  });
  if (!r.ok) { console.error("x post failed", await r.text().catch(() => "")); return { error: "x_post_failed" }; }
  const j = await r.json();
  return { ok: true, message: "Posted to X.", id: j?.data?.id ?? null };
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
