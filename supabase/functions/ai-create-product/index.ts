// =====================================================================
// ai-create-product
// Phase 2 — AI creators. An admin picks a niche-trained "creator" agent
// and a brief; this function calls the Claude (Anthropic) Messages API
// to generate structured product content, then creates/updates a HIDDEN
// draft product for admin review before it goes live.
//
// Auth: verify_jwt = true (see config.toml). The caller's Supabase JWT
// is required; we verify the caller is an admin using a token-bound
// client, and use the SERVICE ROLE client for all DB writes.
// Secrets (ANTHROPIC_API_KEY, service role key) stay server-side only.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Service-role client for trusted DB writes (bypasses RLS).
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MODEL = "claude-opus-4-8";
const PRODUCT_TYPES = ["pdf", "list", "image", "presentation", "template", "ai-training", "bundle", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- Auth: verify the caller is an admin using their own JWT ---------
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
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    return json({ error: "admin access required" }, 403);
  }

  // --- Parse input -----------------------------------------------------
  let body: { agentId?: string; brief?: string; productId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const { agentId, brief, productId } = body;
  if (!agentId) return json({ error: "agentId required" }, 400);
  if (!brief || !brief.trim()) return json({ error: "brief required" }, 400);

  // --- 1. Insert a running job row ------------------------------------
  const { data: job, error: jobErr } = await admin
    .from("ai_jobs")
    .insert({
      agent_id: agentId,
      product_id: productId ?? null,
      job_type: "generate_product",
      status: "running",
      input: body,
    })
    .select("id")
    .single();
  if (jobErr || !job) return json({ error: jobErr?.message || "could not create job" }, 500);

  const jobId = job.id;

  try {
    // --- 2. Load the agent --------------------------------------------
    const { data: agent, error: agentErr } = await admin
      .from("ai_agents")
      .select("id, name, kind, niche, system_prompt, model")
      .eq("id", agentId)
      .single();
    if (agentErr || !agent) throw new Error("agent not found");
    if (agent.kind !== "creator") throw new Error("agent must be a 'creator' (kind != creator)");

    const model = agent.model || DEFAULT_MODEL;
    const systemPrompt = agent.system_prompt ||
      "You are a world-class digital-product creator. Produce polished, sellable content.";

    // --- 3. Call the Anthropic Messages API ---------------------------
    const userMessage = [
      agent.niche ? `Niche: ${agent.niche}` : null,
      `Brief from the marketplace admin:\n${brief.trim()}`,
      "",
      "Create a complete, sellable digital product based on the brief.",
      "Respond with STRICT JSON ONLY (no markdown, no prose, no code fences) using exactly these keys:",
      `{`,
      `  "name": string,            // catchy product name`,
      `  "tagline": string,         // one-line hook`,
      `  "type": string,            // one of: ${PRODUCT_TYPES.join(" | ")}`,
      `  "bullets": string[],       // 3-6 value bullets for the landing page`,
      `  "description": string,     // 1-3 paragraph product description`,
      `  "body": string             // the FULL deliverable content as markdown`,
      `}`,
    ].filter(Boolean).join("\n");

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        // Frozen system prompt cached for cost savings across generations.
        system: [{
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        }],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      throw new Error(`Anthropic API error (${aiResp.status}): ${errText.slice(0, 500)}`);
    }

    const aiData = await aiResp.json();
    const rawText = (aiData.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    if (!rawText) throw new Error("empty response from model");

    const parsed = parseJsonLoose(rawText);

    const genName = String(parsed.name || "").trim() || `AI draft — ${new Date().toISOString().slice(0, 10)}`;
    const genTagline = String(parsed.tagline || "").trim();
    const genType = PRODUCT_TYPES.includes(parsed.type) ? parsed.type : "other";
    const genBullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((b: any) => String(b).trim()).filter(Boolean)
      : [];
    const genDescription = String(parsed.description || "").trim();
    const genBody = String(parsed.body || "").trim();
    if (!genBody) throw new Error("model returned no 'body' content");

    // --- 4. Create or update the product as a DRAFT -------------------
    let targetProductId = productId;
    let slug: string;

    const landing = { bullets: genBullets, cta: "Get instant access" };

    if (targetProductId) {
      const { error: upErr } = await admin
        .from("products")
        .update({
          name: genName,
          tagline: genTagline,
          description: genDescription,
          type: genType,
          landing,
          is_active: false, // stays a hidden draft for admin review
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetProductId);
      if (upErr) throw upErr;

      const { data: existing } = await admin
        .from("products").select("slug").eq("id", targetProductId).single();
      slug = existing?.slug ?? await uniqueSlug(genName);
    } else {
      slug = await uniqueSlug(genName);
      const { data: created, error: insErr } = await admin
        .from("products")
        .insert({
          slug,
          name: genName,
          tagline: genTagline,
          description: genDescription,
          type: genType,
          price_cents: 0,
          landing,
          is_active: false, // hidden draft
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insErr || !created) throw insErr || new Error("could not create product");
      targetProductId = created.id;
    }

    // --- 5. Upload the body to the PRIVATE product-assets bucket ------
    const assetPath = `${targetProductId}/ai-${Date.now()}.md`;
    const { error: storErr } = await admin
      .storage.from("product-assets")
      .upload(assetPath, new Blob([genBody], { type: "text/markdown" }), {
        upsert: true,
        contentType: "text/markdown",
      });
    if (storErr) throw storErr;

    await admin.from("products").update({ asset_path: assetPath }).eq("id", targetProductId);

    // --- 6. Mark the job done ----------------------------------------
    await admin.from("ai_jobs").update({
      status: "done",
      product_id: targetProductId,
      output: { product_id: targetProductId, slug },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return json({ jobId, productId: targetProductId, slug, status: "done" });
  } catch (e) {
    const message = (e as Error).message || String(e);
    await admin.from("ai_jobs").update({
      status: "error",
      error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return json({ jobId, status: "error", error: message }, 500);
  }
});

// Parse model JSON robustly — strip code fences and grab the outer object.
function parseJsonLoose(text: string): any {
  let t = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if present.
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the first {...} span.
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error("could not parse JSON from model response");
  }
}

// Slugify + ensure uniqueness against existing products.
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "ai-product";
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from("products").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
