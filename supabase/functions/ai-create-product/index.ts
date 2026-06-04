// =====================================================================
// ai-create-product
// Phase 2 — AI creators. Generates product content with Claude, renders a
// branded cover (SVG→PNG via resvg, real Syne/DM Mono fonts), a branded
// PDF (cover page + interior, fonts embedded), and editable sources
// (Markdown + DOCX). Creates a HIDDEN draft product for admin review.
//
// Auth: verify_jwt = true → caller must be an admin. SERVICE ROLE does
// all writes. Heavy rendering is wrapped in fallbacks so a font/render
// failure never blocks product creation.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "https://esm.sh/docx@8.5.0";
import { initWasm, Resvg } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

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

// Brand fonts (static TTFs from the expo-google-fonts mirror).
const FONT_URLS = {
  syne800: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/syne/Syne_800ExtraBold.ttf",
  syne700: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/syne/Syne_700Bold.ttf",
  syne400: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/syne/Syne_400Regular.ttf",
  mono:    "https://cdn.jsdelivr.net/npm/@expo-google-fonts/dm-mono/DMMono_500Medium.ttf",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing authorization" }, 401);

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: userErr } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: "invalid token" }, 401);
  const { data: profile } = await caller.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) return json({ error: "admin access required" }, 403);

  let body: { agentId?: string; brief?: string; productId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const { agentId, brief, productId } = body;
  if (!agentId) return json({ error: "agentId required" }, 400);
  if (!brief || !brief.trim()) return json({ error: "brief required" }, 400);

  const { data: job, error: jobErr } = await admin
    .from("ai_jobs").insert({ agent_id: agentId, product_id: productId ?? null, job_type: "generate_product", status: "running", input: body })
    .select("id").single();
  if (jobErr || !job) return json({ error: jobErr?.message || "could not create job" }, 500);
  const jobId = job.id;

  try {
    const { data: agent, error: agentErr } = await admin
      .from("ai_agents").select("id, name, kind, niche, system_prompt, model").eq("id", agentId).single();
    if (agentErr || !agent) throw new Error("agent not found");
    if (agent.kind !== "creator") throw new Error("agent must be a 'creator' (kind != creator)");

    const model = agent.model || DEFAULT_MODEL;
    const systemPrompt = agent.system_prompt || "You are a world-class digital-product creator. Produce polished, sellable content.";
    const nicheLine = agent.niche ? `Niche: ${agent.niche}\n` : "";

    // Call A — metadata JSON.
    const metaText = await callClaude(model, systemPrompt, 1500,
      `${nicheLine}Brief from the marketplace admin:\n${brief.trim()}\n\n` +
      `Return ONLY a JSON object — nothing before or after it, no prose, no code fences — with exactly these keys: ` +
      `"name" (catchy product name), "tagline" (one-line hook), "type" (one of: ${PRODUCT_TYPES.join(" | ")}), ` +
      `"bullets" (array of 3-6 short value bullets), ` +
      `"tags" (array of 3-4 VERY short chips, 1-3 words / max ~18 chars each, e.g. "5 Automations", "35 Prompts", "No Code"), ` +
      `"description" (1-3 paragraph product description).`);
    const parsed = parseJsonLoose(metaText);
    const genName = String(parsed.name || "").trim() || `AI draft — ${new Date().toISOString().slice(0, 10)}`;
    const genTagline = String(parsed.tagline || "").trim();
    const genType = PRODUCT_TYPES.includes(parsed.type) ? parsed.type : "other";
    const genBullets = Array.isArray(parsed.bullets) ? parsed.bullets.map((b: any) => String(b).trim()).filter(Boolean) : [];
    const genTags = Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const genDescription = String(parsed.description || "").trim();

    // Call B — deliverable markdown.
    const genBody = (await callClaude(model, systemPrompt, 8000,
      `${nicheLine}Brief:\n${brief.trim()}\n\n` +
      `Write the COMPLETE, ready-to-sell deliverable for the product "${genName}" as polished Markdown. ` +
      `Use clear # / ## / ### headings, short paragraphs, and - bullet lists. ` +
      `Make it genuinely useful and substantial. Output only the document — no preamble, no commentary.`)).trim();
    if (!genBody) throw new Error("model returned no body content");

    // --- Create/update DRAFT product ---------------------------------
    let targetProductId = productId;
    let slug: string;
    const landing = { bullets: genBullets, tags: genTags, cta: "Get instant access" };
    if (targetProductId) {
      const { error: upErr } = await admin.from("products").update({
        name: genName, tagline: genTagline, description: genDescription, type: genType, landing, is_active: false, updated_at: new Date().toISOString(),
      }).eq("id", targetProductId);
      if (upErr) throw upErr;
      const { data: existing } = await admin.from("products").select("slug").eq("id", targetProductId).single();
      slug = existing?.slug ?? await uniqueSlug(genName);
    } else {
      slug = await uniqueSlug(genName);
      const { data: created, error: insErr } = await admin.from("products").insert({
        slug, name: genName, tagline: genTagline, description: genDescription, type: genType, price_cents: 0, landing, is_active: false, created_by: user.id,
      }).select("id").single();
      if (insErr || !created) throw insErr || new Error("could not create product");
      targetProductId = created.id;
    }

    // --- Load brand fonts (shared by cover + PDF) --------------------
    const fonts = await loadFonts().catch((e) => { console.error("fonts skipped:", e?.message); return null; });

    // --- Cover image (SVG→PNG). Best-effort. -------------------------
    let coverUrl: string | null = null;
    let coverPng: Uint8Array | null = null;
    try {
      coverPng = await renderCover({ title: genName, eyebrow: genType, subtitle: genTagline, tags: genTags.length ? genTags : genBullets }, fonts);
      if (coverPng) {
        const coverPath = `${targetProductId}/cover.png`;
        await admin.storage.from("product-images").upload(coverPath, new Blob([coverPng], { type: "image/png" }), { upsert: true, contentType: "image/png" });
        coverUrl = admin.storage.from("product-images").getPublicUrl(coverPath).data.publicUrl;
      }
    } catch (e) { console.error("cover skipped:", (e as Error).message); }

    // --- Branded PDF (cover page + interior) -------------------------
    const pdfBytes = await markdownToPdf({ title: genName, eyebrow: genType, subtitle: genTagline, bullets: genBullets, markdown: genBody }, fonts, coverPng);
    const pdfPath = `${targetProductId}/${slug}.pdf`;
    await admin.storage.from("product-assets").upload(pdfPath, new Blob([pdfBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });

    // --- Editable sources -------------------------------------------
    const mdPath = `${targetProductId}/${slug}.md`;
    await admin.storage.from("product-assets").upload(mdPath, new Blob([genBody], { type: "text/markdown" }), { upsert: true, contentType: "text/markdown" });
    const editable = [mdPath];
    try {
      const docxBytes = await markdownToDocx(genName, genBody);
      const docxPath = `${targetProductId}/${slug}.docx`;
      await admin.storage.from("product-assets").upload(docxPath, new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      editable.push(docxPath);
    } catch (e) { console.error("docx skipped:", (e as Error).message); }

    const update: any = { asset_path: pdfPath, editable_paths: editable };
    if (coverUrl) update.cover_image_url = coverUrl;
    await admin.from("products").update(update).eq("id", targetProductId);

    await admin.from("ai_jobs").update({ status: "done", product_id: targetProductId, output: { product_id: targetProductId, slug, asset_path: pdfPath, editable_paths: editable, cover: coverUrl }, updated_at: new Date().toISOString() }).eq("id", jobId);
    return json({ jobId, productId: targetProductId, slug, status: "done", pdf: pdfPath, editable, cover: coverUrl });
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
    body: JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: userText }] }),
  });
  if (!resp.ok) throw new Error(`Anthropic API error (${resp.status}): ${(await resp.text().catch(() => "")).slice(0, 500)}`);
  const data = await resp.json();
  return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

// ── Fonts ───────────────────────────────────────────────────────────
type FontBufs = { syne800: Uint8Array; syne700: Uint8Array; syne400: Uint8Array; mono: Uint8Array };
async function loadFonts(): Promise<FontBufs> {
  const get = async (u: string) => new Uint8Array(await (await fetch(u)).arrayBuffer());
  const [a, b, c, d] = await Promise.all([get(FONT_URLS.syne800), get(FONT_URLS.syne700), get(FONT_URLS.syne400), get(FONT_URLS.mono)]);
  return { syne800: a, syne700: b, syne400: c, mono: d };
}

// ── Cover (SVG → PNG via resvg) ─────────────────────────────────────
let wasmReady = false;
async function ensureWasm() {
  if (wasmReady) return;
  try { await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")); } catch (_) { /* already initialized */ }
  wasmReady = true;
}
function xmlEsc(s: string) { return (s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!)); }
function wrapEst(text: string, size: number, maxW: number, factor = 0.56): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  const w = (s: string) => s.length * size * factor;
  for (const word of words) { const t = line ? line + " " + word : word; if (w(t) > maxW && line) { lines.push(line); line = word; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
async function renderCover(opts: { title: string; eyebrow: string; subtitle: string; tags: string[] }, fonts: FontBufs | null): Promise<Uint8Array | null> {
  if (!fonts) return null;
  await ensureWasm();
  const W = 1200, H = 1500, pad = 96;
  const maxW = W - pad * 2;
  // Auto-size: Syne ExtraBold is very wide, so shrink until the longest
  // (unbreakable) word fits the content width.
  const words = opts.title.split(/\s+/);
  const longest = Math.max(1, ...words.map((w) => w.length));
  let titleSize = opts.title.length > 40 ? 72 : opts.title.length > 26 ? 84 : 100;
  titleSize = Math.max(44, Math.min(titleSize, Math.floor(maxW / (longest * 0.82))));
  const titleLines = wrapEst(opts.title, titleSize, maxW, 0.74);
  const subLines = wrapEst(opts.subtitle, 36, maxW, 0.54);

  let titleY = 760;
  const titleSvg = titleLines.map((l, i) => `<text x="${pad}" y="${titleY + i * (titleSize + 8)}" font-family="Syne" font-weight="800" font-size="${titleSize}" fill="#ffffff">${xmlEsc(l)}</text>`).join("");
  let subY = titleY + titleLines.length * (titleSize + 8) + 28;
  const subSvg = subLines.map((l, i) => `<text x="${pad}" y="${subY + i * 50}" font-family="Syne" font-weight="400" font-size="36" fill="#b8a9ad">${xmlEsc(l)}</text>`).join("");

  // pills
  let px = pad; const pillY = subY + subLines.length * 50 + 40; let pills = "";
  for (const b of opts.tags.slice(0, 4)) {
    const label = b.toUpperCase().slice(0, 22);
    const pw = label.length * 20 * 0.62 + 56; if (px + pw > W - pad) break;
    pills += `<rect x="${px}" y="${pillY}" width="${pw}" height="64" rx="32" fill="#2a2526" stroke="#4a3f43"/>` +
      `<text x="${px + pw / 2}" y="${pillY + 41}" text-anchor="middle" font-family="DM Mono" font-weight="500" font-size="20" letter-spacing="1.5" fill="#F7B5CD">${xmlEsc(label)}</text>`;
    px += pw + 18;
  }

  const wordStudio = `<text x="${pad}" y="180" font-family="Syne" font-weight="800" font-size="48" fill="#ffffff" style="font-feature-settings: 'zero' 1; font-variant-numeric: slashed-zero;">studio<tspan fill="#F03D77">0x</tspan></text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#1a1718"/>
    <rect x="0" y="0" width="${W}" height="8" fill="#F03D77"/>
    ${wordStudio}
    <text x="${pad}" y="214" font-family="DM Mono" font-weight="500" font-size="22" letter-spacing="4" fill="#b8a9ad">MARKET / PREMIUM TOOLKIT</text>
    <text x="${pad}" y="690" font-family="DM Mono" font-weight="500" font-size="26" letter-spacing="3" fill="#F03D77">${xmlEsc(opts.eyebrow.toUpperCase())}</text>
    ${titleSvg}
    ${subSvg}
    ${pills}
    <line x1="${pad}" y1="${H - 150}" x2="${W - pad}" y2="${H - 150}" stroke="#3a3133" stroke-width="1.5"/>
    <text x="${pad}" y="${H - 108}" font-family="DM Mono" font-size="22" fill="#8a7d81">studio0x market</text>
    <text x="${W - pad}" y="${H - 108}" text-anchor="end" font-family="DM Mono" font-size="22" fill="#8a7d81">studio0x.io</text>
  </svg>`;

  const r = new Resvg(svg, { font: { fontBuffers: [fonts.syne800, fonts.syne700, fonts.syne400, fonts.mono], defaultFontFamily: "Syne", loadSystemFonts: false }, fitTo: { mode: "width", value: W } });
  return r.render().asPng();
}

// ── PDF ─────────────────────────────────────────────────────────────
function ascii(s: string): string {
  return (s || "").replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/[—–]/g, "-").replace(/•/g, "-").replace(/…/g, "...").replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}
function clean(s: string): string {
  return ascii(s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/`([^`]*)`/g, "$1").replace(/^#{1,6}\s*/, "")).trim();
}
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (font.widthOfTextAtSize(t, size) > maxWidth && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
async function markdownToPdf(opts: { title: string; eyebrow: string; subtitle: string; bullets: string[]; markdown: string }, fonts: FontBufs | null, coverPng: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let head: any, head2: any, mono: any;
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bodyBold = await doc.embedFont(StandardFonts.HelveticaBold);
  if (fonts) {
    try {
      doc.registerFontkit(fontkit);
      head = await doc.embedFont(fonts.syne800, { subset: true });
      head2 = await doc.embedFont(fonts.syne700, { subset: true });
      mono = await doc.embedFont(fonts.mono, { subset: true });
    } catch (e) { console.error("pdf font embed skipped:", (e as Error).message); }
  }
  head = head || bodyBold; head2 = head2 || bodyBold; mono = mono || body;

  const W = 612, H = 792, M = 60, maxW = W - 2 * M;
  const BG = rgb(0.102, 0.090, 0.094), CARD = rgb(0.165, 0.145, 0.149), WHITE = rgb(1, 1, 1),
    MUTED = rgb(0.722, 0.663, 0.678), PINK = rgb(0.969, 0.710, 0.804), HOT = rgb(0.941, 0.239, 0.467), HAIR = rgb(0.27, 0.24, 0.25);

  // Cover page — embed the PNG full-bleed when available, else draw it.
  let page = doc.addPage([W, H]);
  if (coverPng) {
    try { const img = await doc.embedPng(coverPng); page.drawImage(img, { x: 0, y: 0, width: W, height: H }); }
    catch { drawCover(); }
  } else { drawCover(); }
  function drawCover() {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
    page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: HOT });
    page.drawText("studio", { x: M, y: H - 96, size: 22, font: head, color: WHITE });
    page.drawText("0x", { x: M + head.widthOfTextAtSize("studio", 22), y: H - 96, size: 22, font: head, color: HOT });
    page.drawText(ascii("MARKET / PREMIUM TOOLKIT"), { x: M, y: H - 116, size: 8.5, font: mono, color: MUTED });
    page.drawText(ascii(opts.eyebrow.toUpperCase()), { x: M, y: 470, size: 11, font: mono, color: HOT });
    let ty = 430;
    for (const l of wrapText(ascii(opts.title), head, 32, maxW)) { page.drawText(l, { x: M, y: ty, size: 32, font: head, color: WHITE }); ty -= 38; }
    ty -= 8;
    for (const l of wrapText(ascii(opts.subtitle), body, 13, maxW)) { page.drawText(l, { x: M, y: ty, size: 13, font: body, color: MUTED }); ty -= 19; }
    page.drawLine({ start: { x: M, y: 90 }, end: { x: W - M, y: 90 }, thickness: 0.8, color: HAIR });
    page.drawText("studio0x market", { x: M, y: 74, size: 8.5, font: mono, color: MUTED });
  }

  // Interior
  let pageNum = 0;
  const drawFooter = () => { page.drawText("studio0x market", { x: M, y: 40, size: 8, font: mono, color: MUTED }); const n = String(pageNum); page.drawText(n, { x: W - M - mono.widthOfTextAtSize(n, 8), y: 40, size: 8, font: mono, color: MUTED }); };
  const newPage = () => { if (pageNum > 0) drawFooter(); page = doc.addPage([W, H]); page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG }); pageNum++; return H - M; };
  let y = newPage();
  const ensure = (need: number) => { if (y - need < M + 24) y = newPage(); };

  for (const raw of opts.markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*---+\s*$/.test(line)) { ensure(16); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.6, color: HAIR }); y -= 16; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { const lvl = h[1].length; const size = lvl === 1 ? 19 : lvl === 2 ? 15 : 12.5; const f = lvl === 1 ? head : head2; const col = lvl <= 2 ? WHITE : PINK; const txt = clean(h[2]); y -= lvl === 1 ? 14 : 9; ensure(size + 8); for (const l of wrapText(txt, f, size, maxW)) { ensure(size + 4); page.drawText(l, { x: M, y, size, font: f, color: col }); y -= size + 5; } y -= 3; continue; }
    const b = line.match(/^\s*[-*]\s+(.*)/);
    if (b) { const txt = clean(b[1]); const size = 11; const bx = M + 16; const wl = wrapText(txt, body, size, maxW - 16); ensure(size + 4); page.drawText("-", { x: M + 2, y, size, font: bodyBold, color: HOT }); for (let i = 0; i < wl.length; i++) { if (i > 0) ensure(size + 3); page.drawText(wl[i], { x: bx, y, size, font: body, color: WHITE }); y -= size + 3.5; } continue; }
    const num = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (num) { const txt = clean(num[2]); const size = 11; const bx = M + 22; const wl = wrapText(txt, body, size, maxW - 22); ensure(size + 4); page.drawText(num[1] + ".", { x: M + 2, y, size, font: bodyBold, color: HOT }); for (let i = 0; i < wl.length; i++) { if (i > 0) ensure(size + 3); page.drawText(wl[i], { x: bx, y, size, font: body, color: WHITE }); y -= size + 3.5; } continue; }
    const txt = clean(line);
    if (!txt) { y -= 7; continue; }
    for (const l of wrapText(txt, body, 11, maxW)) { ensure(15); page.drawText(l, { x: M, y, size: 11, font: body, color: rgb(0.92, 0.9, 0.91) }); y -= 15.5; }
    y -= 4;
  }
  drawFooter();
  return await doc.save();
}

// ── DOCX ────────────────────────────────────────────────────────────
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

// ── Helpers ─────────────────────────────────────────────────────────
function parseJsonLoose(text: string): any {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s !== -1 && e !== -1 && e > s) return JSON.parse(t.slice(s, e + 1)); throw new Error("could not parse JSON from model response"); }
}
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "ai-product"; let candidate = base;
  for (let i = 0; i < 5; i++) { const { data } = await admin.from("products").select("id").eq("slug", candidate).maybeSingle(); if (!data) return candidate; candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`; }
  return `${base}-${Date.now().toString(36)}`;
}
function slugify(s: string): string { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
