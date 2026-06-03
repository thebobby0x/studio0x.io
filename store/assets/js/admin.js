import { supabase, money, configured } from "./supabase-client.js";

document.getElementById("yr").textContent = new Date().getFullYear();

const loginView = document.getElementById("login-view");
const dash = document.getElementById("dash");
const loginMsg = document.getElementById("login-msg");

if (!configured()) document.getElementById("not-configured").classList.remove("hidden");

// ── AUTH ───────────────────────────────────────────────────────────
document.getElementById("login-btn").addEventListener("click", signIn);
document.getElementById("password").addEventListener("keydown", (e) => e.key === "Enter" && signIn());
document.getElementById("logout").addEventListener("click", async (e) => {
  e.preventDefault(); await supabase.auth.signOut(); location.reload();
});

async function signIn() {
  loginMsg.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { loginMsg.textContent = error.message; return; }
  gate();
}

async function gate() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("role,email").eq("id", user.id).single();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    loginMsg.textContent = "This account is not an admin. Set role='superadmin' on your profile in Supabase.";
    await supabase.auth.signOut();
    return;
  }
  loginView.classList.add("hidden");
  dash.classList.remove("hidden");
  document.getElementById("logout").classList.remove("hidden");
  document.getElementById("who").textContent = profile.email || user.email;
  initTabs();
  loadProducts(); loadAddons(); loadOrders(); loadAI();
}

// ── TABS ───────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
    document.getElementById("tab-" + t.dataset.tab).classList.remove("hidden");
  }));
}

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── PRODUCTS ───────────────────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  const pane = document.getElementById("tab-products");
  if (error) { pane.innerHTML = `<p class="muted">${error.message}</p>`; return; }
  pane.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
      <h2 style="font-size:1.3rem;">Products (${data.length})</h2>
      <button class="btn" id="new-product">+ New product</button>
    </div>
    <div id="product-form-wrap"></div>
    <div class="panel"><table><thead><tr><th>Name</th><th>Type</th><th>Price</th><th>Sales</th><th>Status</th><th></th></tr></thead>
    <tbody>${data.map((p) => `
      <tr>
        <td><strong>${esc(p.name)}</strong><br/><span class="muted mono" style="font-size:.75rem;">${esc(p.slug)}</span></td>
        <td>${p.type}</td><td>${money(p.price_cents)}</td><td>${p.sales_count}</td>
        <td>${p.is_active ? '<span class="pill ok">active</span>' : '<span class="pill warn">hidden</span>'}${p.asset_path ? "" : ' <span class="pill warn">no file</span>'}</td>
        <td><button class="btn btn-ghost edit-product" data-id="${p.id}" style="padding:6px 12px;font-size:.8rem;">Edit</button></td>
      </tr>`).join("")}</tbody></table></div>`;

  document.getElementById("new-product").addEventListener("click", () => productForm());
  pane.querySelectorAll(".edit-product").forEach((b) =>
    b.addEventListener("click", () => productForm(data.find((p) => p.id === b.dataset.id))));
}

function productForm(p = null) {
  const wrap = document.getElementById("product-form-wrap");
  const landing = p?.landing || {};
  const bullets = (landing.bullets || []).join("\n");
  wrap.innerHTML = `
    <div class="panel" style="margin-bottom:18px;">
      <h3 style="margin-bottom:16px;">${p ? "Edit" : "New"} product</h3>
      <div class="row2">
        <div class="field"><label>Name</label><input id="f-name" value="${esc(p?.name || "")}"/></div>
        <div class="field"><label>Slug</label><input id="f-slug" value="${esc(p?.slug || "")}" placeholder="auto from name"/></div>
      </div>
      <div class="field"><label>Tagline</label><input id="f-tagline" value="${esc(p?.tagline || "")}"/></div>
      <div class="row2">
        <div class="field"><label>Type</label><select id="f-type">${["pdf","list","image","presentation","template","ai-training","bundle","other"].map((t) => `<option ${p?.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Price (USD)</label><input id="f-price" type="number" step="0.01" value="${p ? (p.price_cents / 100) : ""}"/></div>
      </div>
      <div class="row2">
        <div class="field"><label>Compare-at (USD, optional)</label><input id="f-compare" type="number" step="0.01" value="${p?.compare_at_cents ? (p.compare_at_cents / 100) : ""}"/></div>
        <div class="field"><label>Active</label><select id="f-active"><option value="true" ${p?.is_active !== false ? "selected" : ""}>Yes — visible</option><option value="false" ${p?.is_active === false ? "selected" : ""}>No — hidden</option></select></div>
      </div>
      <div class="field"><label>Description</label><textarea id="f-desc">${esc(p?.description || "")}</textarea></div>
      <div class="field"><label>Bullets (one per line)</label><textarea id="f-bullets">${esc(bullets)}</textarea></div>
      <div class="row2">
        <div class="field"><label>Cover image ${p?.cover_image_url ? "(set)" : ""}</label><input id="f-image" type="file" accept="image/*"/></div>
        <div class="field"><label>Digital file ${p?.asset_path ? "(uploaded ✓)" : "(required to sell)"}</label><input id="f-asset" type="file"/></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <button class="btn" id="save-product">${p ? "Save changes" : "Create product"}</button>
        <button class="btn btn-ghost" id="cancel-product">Cancel</button>
        <span id="save-msg" class="muted" style="align-self:center;font-size:.85rem;"></span>
      </div>
    </div>`;

  document.getElementById("cancel-product").addEventListener("click", () => wrap.innerHTML = "");
  document.getElementById("save-product").addEventListener("click", () => saveProduct(p));
  wrap.scrollIntoView({ behavior: "smooth" });
}

async function saveProduct(existing) {
  const msg = document.getElementById("save-msg");
  msg.textContent = "Saving…";
  try {
    const name = document.getElementById("f-name").value.trim();
    if (!name) throw new Error("Name required");
    const slug = (document.getElementById("f-slug").value.trim() || slugify(name));
    const priceCents = Math.round(parseFloat(document.getElementById("f-price").value || "0") * 100);
    const compareVal = document.getElementById("f-compare").value;
    const bullets = document.getElementById("f-bullets").value.split("\n").map((s) => s.trim()).filter(Boolean);

    const row = {
      name, slug,
      tagline: document.getElementById("f-tagline").value.trim(),
      type: document.getElementById("f-type").value,
      price_cents: priceCents,
      compare_at_cents: compareVal ? Math.round(parseFloat(compareVal) * 100) : null,
      description: document.getElementById("f-desc").value.trim(),
      is_active: document.getElementById("f-active").value === "true",
      landing: { ...(existing?.landing || {}), bullets },
      updated_at: new Date().toISOString(),
    };

    // Upserts so we have an id to attach uploads to.
    let id = existing?.id;
    if (id) {
      const { error } = await supabase.from("products").update(row).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("products").insert(row).select("id").single();
      if (error) throw error;
      id = data.id;
    }

    // Cover image → public bucket
    const imgFile = document.getElementById("f-image").files[0];
    if (imgFile) {
      const path = `${id}/cover-${Date.now()}-${imgFile.name}`;
      const { error } = await supabase.storage.from("product-images").upload(path, imgFile, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      await supabase.from("products").update({ cover_image_url: pub.publicUrl }).eq("id", id);
    }

    // Digital asset → private bucket
    const assetFile = document.getElementById("f-asset").files[0];
    if (assetFile) {
      const path = `${id}/${assetFile.name}`;
      const { error } = await supabase.storage.from("product-assets").upload(path, assetFile, { upsert: true });
      if (error) throw error;
      await supabase.from("products").update({ asset_path: path }).eq("id", id);
    }

    msg.textContent = "Saved ✓";
    document.getElementById("product-form-wrap").innerHTML = "";
    loadProducts();
  } catch (e) {
    msg.textContent = "Error: " + e.message;
  }
}

// ── ADD-ONS ────────────────────────────────────────────────────────
async function loadAddons() {
  const { data, error } = await supabase.from("addons").select("*").order("created_at", { ascending: false });
  const pane = document.getElementById("tab-addons");
  if (error) { pane.innerHTML = `<p class="muted">${error.message}</p>`; return; }
  pane.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
      <h2 style="font-size:1.3rem;">Impulse add-ons (${data.length})</h2>
      <button class="btn" id="new-addon">+ New add-on</button>
    </div>
    <p class="muted" style="margin-bottom:14px;font-size:.9rem;">Global add-ons appear on every product's checkout as order bumps.</p>
    <div id="addon-form-wrap"></div>
    <div class="panel"><table><thead><tr><th>Name</th><th>Price</th><th>Scope</th><th>Status</th><th></th></tr></thead>
    <tbody>${data.map((a) => `
      <tr><td><strong>${esc(a.name)}</strong><br/><span class="muted" style="font-size:.78rem;">${esc(a.pitch || "")}</span></td>
      <td>${money(a.price_cents)}</td><td>${a.is_global ? '<span class="pill">global</span>' : "per-product"}</td>
      <td>${a.is_active ? '<span class="pill ok">active</span>' : '<span class="pill warn">off</span>'}</td>
      <td><button class="btn btn-ghost edit-addon" data-id="${a.id}" style="padding:6px 12px;font-size:.8rem;">Edit</button></td></tr>`).join("")}</tbody></table></div>`;
  document.getElementById("new-addon").addEventListener("click", () => addonForm());
  pane.querySelectorAll(".edit-addon").forEach((b) =>
    b.addEventListener("click", () => addonForm(data.find((a) => a.id === b.dataset.id))));
}

function addonForm(a = null) {
  const wrap = document.getElementById("addon-form-wrap");
  wrap.innerHTML = `
    <div class="panel" style="margin-bottom:18px;">
      <h3 style="margin-bottom:16px;">${a ? "Edit" : "New"} add-on</h3>
      <div class="row2">
        <div class="field"><label>Name</label><input id="a-name" value="${esc(a?.name || "")}"/></div>
        <div class="field"><label>Price (USD)</label><input id="a-price" type="number" step="0.01" value="${a ? (a.price_cents / 100) : ""}"/></div>
      </div>
      <div class="field"><label>Impulse pitch (one line)</label><input id="a-pitch" value="${esc(a?.pitch || "")}"/></div>
      <div class="row2">
        <div class="field"><label>Global?</label><select id="a-global"><option value="false" ${!a?.is_global ? "selected" : ""}>No — per product</option><option value="true" ${a?.is_global ? "selected" : ""}>Yes — every checkout</option></select></div>
        <div class="field"><label>Active</label><select id="a-active"><option value="true" ${a?.is_active !== false ? "selected" : ""}>Yes</option><option value="false" ${a?.is_active === false ? "selected" : ""}>No</option></select></div>
      </div>
      <div class="field"><label>Digital file ${a?.asset_path ? "(uploaded ✓)" : "(optional)"}</label><input id="a-asset" type="file"/></div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <button class="btn" id="save-addon">${a ? "Save" : "Create"}</button>
        <button class="btn btn-ghost" id="cancel-addon">Cancel</button>
        <span id="addon-msg" class="muted" style="align-self:center;font-size:.85rem;"></span>
      </div>
    </div>`;
  document.getElementById("cancel-addon").addEventListener("click", () => wrap.innerHTML = "");
  document.getElementById("save-addon").addEventListener("click", () => saveAddon(a));
}

async function saveAddon(existing) {
  const msg = document.getElementById("addon-msg");
  msg.textContent = "Saving…";
  try {
    const name = document.getElementById("a-name").value.trim();
    if (!name) throw new Error("Name required");
    const row = {
      name, slug: existing?.slug || slugify(name),
      pitch: document.getElementById("a-pitch").value.trim(),
      price_cents: Math.round(parseFloat(document.getElementById("a-price").value || "0") * 100),
      is_global: document.getElementById("a-global").value === "true",
      is_active: document.getElementById("a-active").value === "true",
    };
    let id = existing?.id;
    if (id) { const { error } = await supabase.from("addons").update(row).eq("id", id); if (error) throw error; }
    else { const { data, error } = await supabase.from("addons").insert(row).select("id").single(); if (error) throw error; id = data.id; }

    const assetFile = document.getElementById("a-asset").files[0];
    if (assetFile) {
      const path = `addons/${id}/${assetFile.name}`;
      const { error } = await supabase.storage.from("product-assets").upload(path, assetFile, { upsert: true });
      if (error) throw error;
      await supabase.from("addons").update({ asset_path: path }).eq("id", id);
    }
    msg.textContent = "Saved ✓";
    document.getElementById("addon-form-wrap").innerHTML = "";
    loadAddons();
  } catch (e) { msg.textContent = "Error: " + e.message; }
}

// ── ORDERS ─────────────────────────────────────────────────────────
async function loadOrders() {
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  const pane = document.getElementById("tab-orders");
  if (error) { pane.innerHTML = `<p class="muted">${error.message}</p>`; return; }
  const revenue = data.filter((o) => ["paid", "fulfilled"].includes(o.status)).reduce((s, o) => s + (o.amount_total_cents || 0), 0);
  pane.innerHTML = `
    <h2 style="font-size:1.3rem;margin-bottom:6px;">Orders (${data.length})</h2>
    <p class="muted" style="margin-bottom:18px;">Revenue (paid): <strong style="color:var(--mint)">${money(revenue)}</strong></p>
    <div class="panel"><table><thead><tr><th>Date</th><th>Email</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${data.map((o) => `<tr>
      <td class="mono" style="font-size:.78rem;">${new Date(o.created_at).toLocaleString()}</td>
      <td>${esc(o.customer_email || "—")}</td><td>${money(o.amount_total_cents || 0)}</td>
      <td><span class="pill ${["paid", "fulfilled"].includes(o.status) ? "ok" : "warn"}">${o.status}</span></td>
    </tr>`).join("") || `<tr><td colspan="4" class="muted center">No orders yet.</td></tr>`}</tbody></table></div>`;
}

// ── AI CREATORS (Phase 2) ──────────────────────────────────────────
// Agent CRUD + "Generate a product with AI" + recent jobs.
async function loadAI() {
  const pane = document.getElementById("tab-ai");
  const [{ data: agents }, { data: products }, { data: jobs }] = await Promise.all([
    supabase.from("ai_agents").select("*").order("created_at", { ascending: false }),
    supabase.from("products").select("id,name,slug,is_active").order("created_at", { ascending: false }),
    supabase.from("ai_jobs").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const agentList = agents || [];
  const creators = agentList.filter((a) => a.kind === "creator");

  pane.innerHTML = `
    <h2 style="font-size:1.3rem;margin-bottom:6px;">AI creators</h2>
    <p class="muted" style="margin-bottom:18px;">Niche-trained agents generate <strong>hidden draft</strong> products you review before going live. Requires the <span class="mono">ANTHROPIC_API_KEY</span> function secret — see <span class="mono">docs/ROADMAP.md</span>.</p>

    <!-- Generate panel -->
    <div class="panel" style="margin-bottom:22px;">
      <h3 style="margin-bottom:14px;">Generate a product with AI</h3>
      ${creators.length === 0
        ? `<p class="muted">Create a <strong>creator</strong> agent below first.</p>`
        : `
      <div class="field"><label>Creator agent</label>
        <select id="gen-agent">${creators.map((a) => `<option value="${a.id}">${esc(a.name)}${a.niche ? " · " + esc(a.niche) : ""}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Brief — what should it make?</label>
        <textarea id="gen-brief" placeholder="e.g. A 10-step checklist for launching a Shopify store, aimed at first-time founders."></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;align-items:center;">
        <button class="btn" id="gen-run">Generate draft</button>
        <span id="gen-msg" class="muted" style="font-size:.85rem;"></span>
      </div>
      <div id="gen-result" style="margin-top:14px;"></div>`}
    </div>

    <!-- Agents CRUD -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:1.1rem;">Agents (${agentList.length})</h3>
      <button class="btn" id="new-agent">+ New agent</button>
    </div>
    <div id="agent-form-wrap"></div>
    <div class="panel" style="margin-bottom:22px;"><table><thead><tr><th>Name</th><th>Kind</th><th>Niche</th><th>Model</th><th>Status</th><th></th></tr></thead>
    <tbody>${agentList.map((a) => `<tr>
      <td><strong>${esc(a.name)}</strong></td><td>${a.kind}</td><td>${esc(a.niche || "—")}</td>
      <td class="mono" style="font-size:.78rem;">${esc(a.model)}</td>
      <td><span class="pill ${a.is_active ? "ok" : "warn"}">${a.is_active ? "ready" : "off"}</span></td>
      <td><button class="btn btn-ghost edit-agent" data-id="${a.id}" style="padding:6px 12px;font-size:.8rem;">Edit</button></td>
    </tr>`).join("") || `<tr><td colspan="6" class="muted center">No agents yet.</td></tr>`}</tbody></table></div>

    <!-- Recent jobs -->
    <h3 style="font-size:1.1rem;margin-bottom:14px;">Recent AI jobs</h3>
    <div class="panel"><table><thead><tr><th>When</th><th>Type</th><th>Status</th></tr></thead>
    <tbody>${(jobs || []).map((j) => `<tr>
      <td class="mono" style="font-size:.78rem;">${new Date(j.created_at).toLocaleString()}</td>
      <td>${esc(j.job_type || "—")}</td>
      <td><span class="pill ${j.status === "done" ? "ok" : j.status === "error" ? "warn" : ""}">${j.status}</span>${j.status === "error" && j.error ? ` <span class="muted" style="font-size:.75rem;">${esc(j.error)}</span>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="3" class="muted center">No jobs yet.</td></tr>`}</tbody></table></div>`;

  document.getElementById("new-agent").addEventListener("click", () => agentForm());
  pane.querySelectorAll(".edit-agent").forEach((b) =>
    b.addEventListener("click", () => agentForm(agentList.find((a) => a.id === b.dataset.id))));

  const genRun = document.getElementById("gen-run");
  if (genRun) genRun.addEventListener("click", generateProduct);
}

function agentForm(a = null) {
  const wrap = document.getElementById("agent-form-wrap");
  const kinds = ["creator", "social"];
  wrap.innerHTML = `
    <div class="panel" style="margin-bottom:18px;">
      <h3 style="margin-bottom:16px;">${a ? "Edit" : "New"} agent</h3>
      <div class="row2">
        <div class="field"><label>Name</label><input id="ag-name" value="${esc(a?.name || "")}"/></div>
        <div class="field"><label>Niche</label><input id="ag-niche" value="${esc(a?.niche || "")}" placeholder="e.g. fitness, real-estate"/></div>
      </div>
      <div class="row2">
        <div class="field"><label>Kind</label><select id="ag-kind">${kinds.map((k) => `<option ${a?.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
        <div class="field"><label>Model</label><input id="ag-model" value="${esc(a?.model || "claude-opus-4-8")}"/></div>
      </div>
      <div class="field"><label>System prompt</label><textarea id="ag-prompt" rows="5" placeholder="You are a world-class …">${esc(a?.system_prompt || "")}</textarea></div>
      <div class="field"><label>Active</label><select id="ag-active"><option value="true" ${a?.is_active !== false ? "selected" : ""}>Yes</option><option value="false" ${a?.is_active === false ? "selected" : ""}>No</option></select></div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <button class="btn" id="save-agent">${a ? "Save" : "Create"}</button>
        <button class="btn btn-ghost" id="cancel-agent">Cancel</button>
        <span id="agent-msg" class="muted" style="align-self:center;font-size:.85rem;"></span>
      </div>
    </div>`;
  document.getElementById("cancel-agent").addEventListener("click", () => wrap.innerHTML = "");
  document.getElementById("save-agent").addEventListener("click", () => saveAgent(a));
  wrap.scrollIntoView({ behavior: "smooth" });
}

async function saveAgent(existing) {
  const msg = document.getElementById("agent-msg");
  msg.textContent = "Saving…";
  try {
    const name = document.getElementById("ag-name").value.trim();
    if (!name) throw new Error("Name required");
    const row = {
      name,
      niche: document.getElementById("ag-niche").value.trim() || null,
      kind: document.getElementById("ag-kind").value,
      model: document.getElementById("ag-model").value.trim() || "claude-opus-4-8",
      system_prompt: document.getElementById("ag-prompt").value.trim() || null,
      is_active: document.getElementById("ag-active").value === "true",
    };
    if (existing?.id) {
      const { error } = await supabase.from("ai_agents").update(row).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("ai_agents").insert(row);
      if (error) throw error;
    }
    msg.textContent = "Saved ✓";
    document.getElementById("agent-form-wrap").innerHTML = "";
    loadAI();
  } catch (e) { msg.textContent = "Error: " + e.message; }
}

async function generateProduct() {
  const msg = document.getElementById("gen-msg");
  const result = document.getElementById("gen-result");
  result.innerHTML = "";
  const agentId = document.getElementById("gen-agent").value;
  const brief = document.getElementById("gen-brief").value.trim();
  if (!brief) { msg.textContent = "Add a brief first."; return; }
  msg.textContent = "Generating… this can take ~30s.";
  try {
    // verify_jwt on this function requires the user's own access token —
    // the shared callFn() sends only the anon key, which won't pass the
    // admin check, so we fetch directly with the session token here.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not signed in.");
    const res = await fetch(`${window.STORE_CONFIG.functionsBase}/ai-create-product`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ agentId, brief }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

    // Refresh both lists, then re-render the success notice (loadAI rebuilds
    // the pane, so we inject the result afterward to keep it visible).
    loadProducts();
    await loadAI();
    const msg2 = document.getElementById("gen-msg");
    const result2 = document.getElementById("gen-result");
    if (msg2) msg2.textContent = "Done ✓";
    if (result2) {
      result2.innerHTML = `
        <div class="panel" style="border-color:var(--mint);">
          <p style="margin-bottom:6px;">Draft created: <strong>${esc(data.slug)}</strong> <span class="pill warn">hidden</span></p>
          <p class="muted" style="font-size:.85rem;">Review it in the <strong>Products</strong> tab, then set it active to publish.</p>
          <button class="btn btn-ghost" id="goto-products" style="margin-top:10px;padding:6px 14px;font-size:.8rem;">Open Products tab</button>
        </div>`;
      const goto = document.getElementById("goto-products");
      if (goto) goto.addEventListener("click", () => {
        const tab = document.querySelector('.tab[data-tab="products"]');
        if (tab) tab.click();
      });
    }
  } catch (e) {
    msg.textContent = "Error: " + e.message;
  }
}

// Resume session if already signed in.
gate();
