// =====================================================================
// ai-create-product
// Phase 2 — AI creators. An admin picks a niche-trained "creator" agent
// and a brief; this calls Claude to generate product content, renders a
// branded PDF (primary deliverable) plus editable sources (Markdown +
// DOCX), and creates a HIDDEN draft product for admin review.
//
// Auth: verify_jwt = true. The caller's Supabase JWT is verified to be an
// admin; the SERVICE ROLE client does all writes. Secrets stay server-side.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "https://esm.sh/docx@8.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

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

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing authorization" }, 401);

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: "invalid token" }, 401);
  const { data: profile } = await caller.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    return json({ error: "admin access required" }, 403);
  }

  let body: { agentId?: string; brief?: string; productId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const { agentId, brief, productId } = body;
  if (!agentId) return json({ error: "agentId required" }, 400);
  if (!brief || !brief.trim()) return json({ error: "brief required" }, 400);

  const { data: job, error: jobErr } = await admin
    .from("ai_jobs")
    .insert({ agent_id: agentId, product_id: productId ?? null, job_type: "generate_product", status: "running", input: body })
    .select("id").single();
  if (jobErr || !job) return json({ error: jobErr?.message || "could not create job" }, 500);
  const jobId = job.id;

  try {
    const { data: agent, error: agentErr } = await admin
      .from("ai_agents").select("id, name, kind, niche, system_prompt, model").eq("id", agentId).single();
    if (agentErr || !agent) throw new Error("agent not found");
    if (agent.kind !== "creator") throw new Error("agent must be a 'creator' (kind != creator)");

    const model = agent.model || DEFAULT_MODEL;
    const systemPrompt = agent.system_prompt ||
      "You are a world-class digital-product creator. Produce polished, sellable content.";
    const nicheLine = agent.niche ? `Niche: ${agent.niche}\n` : "";

    // Call A — compact metadata as JSON.
    const metaText = await callClaude(model, systemPrompt, 1500,
      `${nicheLine}Brief from the marketplace admin:\n${brief.trim()}\n\n` +
      `Return ONLY a JSON object — nothing before or after it, no prose, no code fences — ` +
      `with exactly these keys: "name" (catchy product name), "tagline" (one-line hook), ` +
      `"type" (one of: ${PRODUCT_TYPES.join(" | ")}), "bullets" (array of 3-6 short value bullets), ` +
      `"description" (1-3 paragraph product description).`);
    const parsed = parseJsonLoose(metaText);

    const genName = String(parsed.name || "").trim() || `AI draft — ${new Date().toISOString().slice(0, 10)}`;
    const genTagline = String(parsed.tagline || "").trim();
    const genType = PRODUCT_TYPES.includes(parsed.type) ? parsed.type : "other";
    const genBullets = Array.isArray(parsed.bullets) ? parsed.bullets.map((b: any) => String(b).trim()).filter(Boolean) : [];
    const genDescription = String(parsed.description || "").trim();

    // Call B — the full deliverable as markdown.
    const genBody = (await callClaude(model, systemPrompt, 8000,
      `${nicheLine}Brief:\n${brief.trim()}\n\n` +
      `Write the COMPLETE, ready-to-sell deliverable for the product "${genName}" as polished Markdown. ` +
      `Use clear # / ## / ### headings, short paragraphs, and - bullet lists. ` +
      `Make it genuinely useful and substantial. Output only the document — no preamble, no commentary.`)).trim();
    if (!genBody) throw new Error("model returned no body content");

    // --- Create or update the product as a DRAFT ---------------------
    let targetProductId = productId;
    let slug: string;
    const landing = { bullets: genBullets, cta: "Get instant access" };

    if (targetProductId) {
      const { error: upErr } = await admin.from("products").update({
        name: genName, tagline: genTagline, description: genDescription, type: genType,
        landing, is_active: false, updated_at: new Date().toISOString(),
      }).eq("id", targetProductId);
      if (upErr) throw upErr;
      const { data: existing } = await admin.from("products").select("slug").eq("id", targetProductId).single();
      slug = existing?.slug ?? await uniqueSlug(genName);
    } else {
      slug = await uniqueSlug(genName);
      const { data: created, error: insErr } = await admin.from("products").insert({
        slug, name: genName, tagline: genTagline, description: genDescription, type: genType,
        price_cents: 0, landing, is_active: false, created_by: user.id,
      }).select("id").single();
      if (insErr || !created) throw insErr || new Error("could not create product");
      targetProductId = created.id;
    }

    // --- Render deliverables -----------------------------------------
    // Primary: branded PDF. Editable sources: Markdown (+ DOCX if it builds).
    const pdfBytes = await markdownToPdf({ title: genName, eyebrow: genType, subtitle: genTagline, bullets: genBullets, markdown: genBody });
    const pdfPath = `${targetProductId}/${slug}.pdf`;
    await admin.storage.from("product-assets").upload(pdfPath, new Blob([pdfBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });

    const mdPath = `${targetProductId}/${slug}.md`;
    await admin.storage.from("product-assets").upload(mdPath, new Blob([genBody], { type: "text/markdown" }), { upsert: true, contentType: "text/markdown" });

    const editable = [mdPath];
    try {
      const docxBytes = await markdownToDocx(genName, genBody);
      const docxPath = `${targetProductId}/${slug}.docx`;
      await admin.storage.from("product-assets").upload(docxPath, new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      editable.push(docxPath);
    } catch (e) {
      console.error("docx generation skipped:", (e as Error).message);
    }

    await admin.from("products").update({ asset_path: pdfPath, editable_paths: editable }).eq("id", targetProductId);

    await admin.from("ai_jobs").update({
      status: "done", product_id: targetProductId,
      output: { product_id: targetProductId, slug, asset_path: pdfPath, editable_paths: editable },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return json({ jobId, productId: targetProductId, slug, status: "done", pdf: pdfPath, editable });
  } catch (e) {
    const message = (e as Error).message || String(e);
    await admin.from("ai_jobs").update({ status: "error", error: message, updated_at: new Date().toISOString() }).eq("id", jobId);
    return json({ jobId, status: "error", error: message }, 500);
  }
});

// ── Claude ──────────────────────────────────────────────────────────
async function callClaude(model: string, systemPrompt: string, maxTokens: number, userText: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic API error (${resp.status}): ${(await resp.text().catch(() => "")).slice(0, 500)}`);
  const data = await resp.json();
  return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

// ── Branded PDF rendering (pdf-lib) ─────────────────────────────────
// Dark studio0x cover page + clean dark interior. Standard fonts only,
// so all text is sanitized to WinAnsi.
function ascii(s: string): string {
  return (s || "")
    .replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"')
    .replace(/[—–]/g, "-").replace(/•/g, "-").replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}
function clean(s: string): string {
  return ascii(s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/`([^`]*)`/g, "$1").replace(/^#{1,6}\s*/, "")).trim();
}
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function markdownToPdf(opts: { title: string; eyebrow: string; subtitle: string; bullets: string[]; markdown: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 60, maxW = W - 2 * M;

  const BG = rgb(0.102, 0.090, 0.094);     // ink
  const CARD = rgb(0.165, 0.145, 0.149);   // raised
  const WHITE = rgb(1, 1, 1);
  const MUTED = rgb(0.722, 0.663, 0.678);
  const PINK = rgb(0.969, 0.710, 0.804);   // soft brand pink
  const HOT = rgb(0.945, 0.298, 0.521);    // vivid accent
  const HAIR = rgb(0.27, 0.24, 0.25);

  // ----- COVER -----
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
  // wordmark
  page.drawText("studio", { x: M, y: H - 96, size: 22, font: bold, color: WHITE });
  page.drawText("0x", { x: M + bold.widthOfTextAtSize("studio", 22), y: H - 96, size: 22, font: bold, color: HOT });
  page.drawText(ascii("MARKET  -  PREMIUM TOOLKIT"), { x: M, y: H - 116, size: 8.5, font, color: MUTED });
  // category eyebrow
  page.drawText(ascii(opts.eyebrow.toUpperCase()), { x: M, y: 470, size: 11, font: bold, color: HOT });
  // title
  let ty = 430;
  for (const l of wrapText(ascii(opts.title), bold, 34, maxW)) { page.drawText(l, { x: M, y: ty, size: 34, font: bold, color: WHITE }); ty -= 40; }
  // subtitle
  ty -= 8;
  for (const l of wrapText(ascii(opts.subtitle), font, 13.5, maxW)) { page.drawText(l, { x: M, y: ty, size: 13.5, font, color: MUTED }); ty -= 20; }
  // pills
  let px = M; const py = Math.max(ty - 30, 150);
  for (const b of opts.bullets.slice(0, 4)) {
    const label = ascii(b.toUpperCase()).slice(0, 26);
    const tw = font.widthOfTextAtSize(label, 8.5); const pw = tw + 24;
    if (px + pw > W - M) break;
    page.drawRectangle({ x: px, y: py, width: pw, height: 24, borderColor: HAIR, borderWidth: 1, color: CARD });
    page.drawText(label, { x: px + 12, y: py + 8, size: 8.5, font, color: PINK });
    px += pw + 10;
  }
  // footer
  page.drawLine({ start: { x: M, y: 90 }, end: { x: W - M, y: 90 }, thickness: 0.8, color: HAIR });
  page.drawText("studio0x market", { x: M, y: 74, size: 8.5, font, color: MUTED });
  const rt = "studio0x.io"; page.drawText(rt, { x: W - M - font.widthOfTextAtSize(rt, 8.5), y: 74, size: 8.5, font, color: MUTED });

  // ----- INTERIOR -----
  let pageNum = 0;
  const newPage = () => { if (pageNum > 0) drawFooter(); page = doc.addPage([W, H]); page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG }); pageNum++; return H - M; };
  const drawFooter = () => {
    page.drawText("studio0x market", { x: M, y: 40, size: 8, font, color: MUTED });
    const n = String(pageNum); page.drawText(n, { x: W - M - font.widthOfTextAtSize(n, 8), y: 40, size: 8, font, color: MUTED });
  };
  let y = newPage();
  const ensure = (need: number) => { if (y - need < M + 24) y = newPage(); };

  for (const raw of opts.markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*---+\s*$/.test(line)) { ensure(16); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.6, color: HAIR }); y -= 16; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      const lvl = h[1].length; const size = lvl === 1 ? 19 : lvl === 2 ? 15 : 12.5; const col = lvl <= 2 ? WHITE : PINK;
      const txt = clean(h[2]); y -= lvl === 1 ? 14 : 9; ensure(size + 8);
      for (const l of wrapText(txt, bold, size, maxW)) { ensure(size + 4); page.drawText(l, { x: M, y, size, font: bold, color: col }); y -= size + 5; }
      y -= 3; continue;
    }
    const b = line.match(/^\s*[-*]\s+(.*)/);
    if (b) {
      const txt = clean(b[1]); const size = 11; const bx = M + 16; const wl = wrapText(txt, font, size, maxW - 16);
      ensure(size + 4); page.drawText("-", { x: M + 2, y, size, font: bold, color: HOT });
      for (let i = 0; i < wl.length; i++) { if (i > 0) ensure(size + 3); page.drawText(wl[i], { x: bx, y, size, font, color: WHITE }); y -= size + 3.5; }
      continue;
    }
    const num = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (num) {
      const txt = clean(num[2]); const size = 11; const bx = M + 22; const wl = wrapText(txt, font, size, maxW - 22);
      ensure(size + 4); page.drawText(num[1] + ".", { x: M + 2, y, size, font: bold, color: HOT });
      for (let i = 0; i < wl.length; i++) { if (i > 0) ensure(size + 3); page.drawText(wl[i], { x: bx, y, size, font, color: WHITE }); y -= size + 3.5; }
      continue;
    }
    const txt = clean(line);
    if (!txt) { y -= 7; continue; }
    const size = 11;
    for (const l of wrapText(txt, font, size, maxW)) { ensure(size + 4); page.drawText(l, { x: M, y, size, font, color: rgb(0.92, 0.9, 0.91) }); y -= size + 4.5; }
    y -= 4;
  }
  drawFooter();
  return await doc.save();
}

// ── Editable DOCX (best-effort) ─────────────────────────────────────
async function markdownToDocx(title: string, md: string): Promise<Uint8Array> {
  const children: any[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  const hmap: any = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    if (/^\s*---+\s*$/.test(raw)) { children.push(new Paragraph({ text: "" })); continue; }
    const h = raw.match(/^(#{1,6})\s+(.*)/);
    if (h) { children.push(new Paragraph({ text: clean(h[2]), heading: hmap[h[1].length] || HeadingLevel.HEADING_4 })); continue; }
    const b = raw.match(/^\s*[-*]\s+(.*)/);
    if (b) { children.push(new Paragraph({ text: clean(b[1]), bullet: { level: 0 } })); continue; }
    const num = raw.match(/^\s*(\d+)\.\s+(.*)/);
    if (num) { children.push(new Paragraph({ children: [new TextRun(`${num[1]}. ${clean(num[2])}`)] })); continue; }
    const txt = clean(raw);
    children.push(new Paragraph(txt ? { children: [new TextRun(txt)] } : { text: "" }));
  }
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

// ── Misc helpers ────────────────────────────────────────────────────
function parseJsonLoose(text: string): any {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("could not parse JSON from model response");
  }
}
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "ai-product"; let candidate = base;
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
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
