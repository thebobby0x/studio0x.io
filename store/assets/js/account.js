// Customer-facing account portal (ES module).
// Separate from admin.js — any signed-in non-admin is a "customer".
import { supabase, money, qs, configured } from "./supabase-client.js";

document.getElementById("yr").textContent = new Date().getFullYear();

const loginView = document.getElementById("login-view");
const dash = document.getElementById("dash");
const authMsg = document.getElementById("auth-msg");
const toastArea = document.getElementById("toast-area");

if (!configured()) document.getElementById("not-configured").classList.remove("hidden");

let CURRENT_USER = null;
let MODE = "login"; // "login" | "signup"

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Provider list, rendered IN THIS PRIORITY ORDER.
const PROVIDERS = [
  { key: "singularitylab", name: "singularityLab", note: "your AI command center", comingSoon: true },
  { key: "google", name: "Google Drive + Gmail" },
  { key: "x", name: "X / Twitter" },
  { key: "meta", name: "Instagram / Facebook" },
  { key: "linkedin", name: "LinkedIn" },
  { key: "tiktok", name: "TikTok" },
];

// "Doer" actions — each maps to an action-run action + the provider it needs.
const ACTIONS = [
  { action: "save_to_drive", label: "Save to Google Drive", need: "google" },
  { action: "gmail_draft", label: "Draft in Gmail", need: "google" },
  { action: "post_to_x", label: "Post to X", need: "x" },
];

const providerName = (key) => {
  const p = PROVIDERS.find((x) => x.key === key);
  return p ? p.name : key;
};

// ── TOAST / BANNER ─────────────────────────────────────────────────
function showToast(msg, kind = "ok") {
  toastArea.innerHTML = `<div class="account-toast ${kind === "error" ? "error" : "ok"}">${esc(msg)}</div>`;
}

function handleReturnParams() {
  const connected = qs("connected");
  const error = qs("error");
  if (connected) {
    const p = PROVIDERS.find((x) => x.key === connected);
    showToast(`Connected ${p ? p.name : connected} ✓`, "ok");
  } else if (error) {
    showToast(`Couldn't connect: ${error}`, "error");
  }
  if (connected || error) {
    const url = new URL(location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("error");
    history.replaceState({}, "", url.pathname + url.search);
  }
}

// ── AUTH ───────────────────────────────────────────────────────────
document.getElementById("auth-btn").addEventListener("click", submitAuth);
document.getElementById("password").addEventListener("keydown", (e) => e.key === "Enter" && submitAuth());
document.getElementById("auth-toggle").addEventListener("click", (e) => {
  e.preventDefault();
  MODE = MODE === "login" ? "signup" : "login";
  authMsg.textContent = "";
  const isSignup = MODE === "signup";
  document.getElementById("auth-title").textContent = isSignup ? "Create account" : "Log in";
  document.getElementById("auth-sub").textContent = isSignup
    ? "Create an account to access your purchases and connect your tools."
    : "Access your downloads and connected services.";
  document.getElementById("auth-btn").textContent = isSignup ? "Create account →" : "Log in →";
  document.getElementById("password").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
  document.getElementById("auth-toggle-text").textContent = isSignup ? "Already have an account?" : "New here?";
  document.getElementById("auth-toggle").textContent = isSignup ? "Log in" : "Create an account";
});

document.getElementById("logout").addEventListener("click", async (e) => {
  e.preventDefault();
  await supabase.auth.signOut();
  location.reload();
});

async function submitAuth() {
  authMsg.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) { authMsg.textContent = "Email and password required."; return; }

  if (MODE === "signup") {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { authMsg.textContent = error.message; return; }
    // Email confirmation may be on — no session means they must confirm first.
    if (!data.session) {
      authMsg.textContent = "Check your email to confirm, then log in.";
      return;
    }
    gate();
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { authMsg.textContent = error.message; return; }
    gate();
  }
}

async function gate() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  CURRENT_USER = user;
  loginView.classList.add("hidden");
  dash.classList.remove("hidden");
  document.getElementById("logout").classList.remove("hidden");
  document.getElementById("who").textContent = user.email;
  document.getElementById("who").classList.add("mono");

  initTabs();
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
  document.querySelector('.tab[data-tab="downloads"]').classList.add("active");
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
  document.getElementById("tab-downloads").classList.remove("hidden");

  loadDownloads();
  loadConnections();
  loadAccount();
}

// ── TABS ───────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
}

// Programmatic tab switch — same effect as clicking a tab.
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
  const pane = document.getElementById("tab-" + name);
  if (pane) pane.classList.remove("hidden");
}

// Customer-authed fetch: sends the user's own access token (not the anon key).
async function authedFetch(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");
  const res = await fetch(`${window.STORE_CONFIG.functionsBase}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ── MY DOWNLOADS ───────────────────────────────────────────────────
async function loadDownloads() {
  const pane = document.getElementById("tab-downloads");
  pane.innerHTML = `<div class="center muted" style="padding:40px 0;"><div class="spinner" style="margin:0 auto 16px;"></div>Loading your purchases…</div>`;
  let data;
  try {
    data = await authedFetch("get-my-downloads", {});
  } catch (e) {
    pane.innerHTML = `<p class="muted">Couldn't load downloads: ${esc(e.message)}</p>`;
    return;
  }
  const orders = data.orders || [];
  const items = data.items || [];
  const products = data.products || [];

  if (orders.length === 0 && items.length === 0) {
    pane.innerHTML = `
      <h2 style="font-size:1.3rem;margin-bottom:14px;">My downloads</h2>
      <div class="panel center" style="padding:40px 24px;">
        <p class="muted" style="margin-bottom:16px;">No purchases yet — browse the store.</p>
        <a class="btn" href="./index.html">Browse products →</a>
      </div>`;
    return;
  }

  const itemsHtml = items.length
    ? renderDownloadCards(items, products)
    : `<div class="panel" style="margin-bottom:22px;"><p class="muted center" style="padding:14px 0;">No downloadable items yet — they appear here once your order is processed.</p></div>`;

  const ordersHtml = `<div class="panel"><table><thead><tr><th>Date</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${orders.map((o) => `<tr>
      <td class="mono" style="font-size:.78rem;">${new Date(o.created_at).toLocaleString()}</td>
      <td>${money(o.amount_total_cents || 0, o.currency || undefined)}</td>
      <td><span class="pill ${["paid", "fulfilled"].includes(o.status) ? "ok" : "warn"}">${esc(o.status || "—")}</span></td>
    </tr>`).join("") || `<tr><td colspan="3" class="muted center">No orders yet.</td></tr>`}</tbody></table></div>`;

  // Which providers are connected? (used to gate the action buttons)
  const connected = new Set();
  const { data: connRows } = await supabase
    .from("customer_connections")
    .select("provider, status");
  for (const r of connRows || []) {
    if (r.status === "connected") connected.add(r.provider);
  }

  const actionsHtml = renderActionsSection(products, connected);

  pane.innerHTML = `
    <h2 style="font-size:1.3rem;margin-bottom:6px;">My downloads</h2>
    <p class="muted" style="margin-bottom:18px;">Your purchased files. Download links are personal — don't share them.</p>
    <h3 style="font-size:1.05rem;margin-bottom:12px;">Files</h3>
    ${itemsHtml}
    <p class="dl-note">Your download links refresh every time you open this page — they never go stale.</p>
    ${actionsHtml}
    <h3 style="font-size:1.05rem;margin-bottom:12px;">Order history</h3>
    ${ordersHtml}`;

  wireActionButtons(pane, connected);
}

// ── TAKE ACTION (doer buttons) ─────────────────────────────────────
function renderActionsSection(products, connected) {
  let body;
  if (!products.length) {
    body = `<div class="panel center" style="padding:28px 24px;"><p class="muted">Buy a kit to unlock one-click actions.</p></div>`;
  } else {
    body = `<div class="action-list">${products.map((p) => `
      <div class="action-card">
        <div class="action-card-name">${esc(p.name)}</div>
        <div class="action-btns">
          ${ACTIONS.map((a) => {
            const ok = connected.has(a.need);
            return `<button class="btn btn-sm action-btn${ok ? "" : " needs-connect"}"
              data-action="${a.action}" data-product="${esc(p.id)}" data-need="${a.need}">${esc(a.label)}</button>`;
          }).join("")}
        </div>
        <div class="action-msg muted" id="action-msg-${esc(p.id)}"></div>
      </div>`).join("")}</div>`;
  }
  return `
    <h3 style="font-size:1.05rem;margin:24px 0 6px;">Take action with your kits</h3>
    <p class="muted" style="margin-bottom:12px;font-size:.85rem;">Let <span class="brand-name">studio0x</span> act on your behalf — one click, using your connected accounts.</p>
    ${body}`;
}

function wireActionButtons(pane, connected) {
  pane.querySelectorAll(".action-btn").forEach((b) =>
    b.addEventListener("click", () => runAction(b, connected)));
}

async function runAction(btn, connected) {
  const action = btn.dataset.action;
  const productId = btn.dataset.product;
  const need = btn.dataset.need;
  const msg = document.getElementById("action-msg-" + productId);

  // Not connected yet — guide them to the Connections tab instead of acting.
  if (!connected.has(need)) {
    if (msg) {
      msg.innerHTML = `Connect ${esc(providerName(need))} first <a href="#" class="action-connect-link">→</a>`;
      const link = msg.querySelector(".action-connect-link");
      if (link) link.addEventListener("click", (e) => { e.preventDefault(); switchTab("connections"); });
    }
    return;
  }

  if (msg) msg.textContent = "";
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Working…";
  try {
    const res = await fetch(`${window.STORE_CONFIG.functionsBase}/action-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
      },
      body: JSON.stringify({ action, productId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.error === "not_connected") {
      showToast(`Connect ${providerName(data.need || need)} first.`, "error");
      switchTab("connections");
      return;
    }
    if (!res.ok || data.error) {
      showToast(data.error || `Action failed (${res.status})`, "error");
      return;
    }
    showToast(data.message || "Done ✓", "ok");
  } catch (e) {
    showToast("Error: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── CONNECTIONS ────────────────────────────────────────────────────
async function loadConnections() {
  const pane = document.getElementById("tab-connections");
  pane.innerHTML = `<div class="center muted" style="padding:40px 0;"><div class="spinner" style="margin:0 auto 16px;"></div>Loading connections…</div>`;

  let connByProvider = new Map();
  const { data: rows, error } = await supabase
    .from("customer_connections")
    .select("provider, account_label, status");
  if (!error && rows) {
    for (const r of rows) connByProvider.set(r.provider, r);
  }

  pane.innerHTML = `
    <h2 style="font-size:1.3rem;margin-bottom:6px;">Connections</h2>
    <p class="muted" style="margin-bottom:8px;">Connect your accounts so <span class="brand-name">studio0x</span> can act on your behalf — save files to Drive, draft emails, post updates — once you buy a kit.</p>
    <p class="muted" style="font-size:.8rem;margin-bottom:20px;">You stay in control: disconnect any service at any time.</p>
    <div class="conn-list">
      ${PROVIDERS.map((p) => renderConnRow(p, connByProvider.get(p.key))).join("")}
    </div>`;

  pane.querySelectorAll(".conn-connect").forEach((b) =>
    b.addEventListener("click", () => connectProvider(b.dataset.key)));
  pane.querySelectorAll(".conn-disconnect").forEach((b) =>
    b.addEventListener("click", () => disconnectProvider(b.dataset.key)));
}

function renderConnRow(p, conn) {
  const connected = conn && conn.status === "connected";
  let action;
  if (p.comingSoon) {
    action = `<button class="btn btn-ghost btn-sm" disabled>Coming soon</button>`;
  } else if (connected) {
    action = `<button class="btn btn-ghost btn-sm conn-disconnect" data-key="${p.key}">Disconnect</button>`;
  } else {
    action = `<button class="btn btn-sm conn-connect" data-key="${p.key}">Connect</button>`;
  }
  const status = p.comingSoon
    ? `<span class="pill">soon</span>`
    : connected
      ? `<span class="pill ok">connected</span>`
      : `<span class="pill">not connected</span>`;
  const detail = p.comingSoon
    ? (p.note ? `<span class="conn-note muted">${esc(p.note)}</span>` : "")
    : connected && conn.account_label
      ? `<span class="conn-note muted">${esc(conn.account_label)}</span>`
      : "";
  return `
    <div class="conn-row">
      <span class="conn-dot ${connected ? "on" : ""}"></span>
      <div class="conn-info">
        <div class="conn-name">${esc(p.name)}</div>
        ${detail}
        <div class="conn-msg muted" id="conn-msg-${p.key}"></div>
      </div>
      <div class="conn-status">${status}</div>
      <div class="conn-action">${action}</div>
    </div>`;
}

async function connectProvider(key) {
  const msg = document.getElementById("conn-msg-" + key);
  if (msg) msg.textContent = "Starting…";
  try {
    const data = await authedFetch("oauth-start", { provider: key, returnUrl: location.href });
    if (data && data.error === "setup_needed") {
      if (msg) msg.textContent = "Not enabled yet — check back soon.";
      return;
    }
    if (data && data.url) {
      location.href = data.url;
      return;
    }
    if (msg) msg.textContent = "Couldn't start connection.";
  } catch (e) {
    if (msg) msg.textContent = "Error: " + e.message;
  }
}

async function disconnectProvider(key) {
  const msg = document.getElementById("conn-msg-" + key);
  if (msg) msg.textContent = "Disconnecting…";
  const { error } = await supabase.from("customer_connections").delete().eq("provider", key);
  if (error) { if (msg) msg.textContent = "Error: " + error.message; return; }
  loadConnections();
}

// ── ACCOUNT ────────────────────────────────────────────────────────
function loadAccount() {
  const pane = document.getElementById("tab-account");
  pane.innerHTML = `
    <h2 style="font-size:1.3rem;margin-bottom:18px;">Account</h2>
    <div class="panel" style="margin-bottom:22px;">
      <div class="field"><label>Signed in as</label><input class="mono" value="${esc(CURRENT_USER?.email || "")}" readonly/></div>
    </div>
    <div class="panel" style="margin-bottom:22px;">
      <h3 style="margin-bottom:14px;">Change password</h3>
      <div class="row2">
        <div class="field"><label>New password</label><input id="acc-pw1" type="password" autocomplete="new-password"/></div>
        <div class="field"><label>Confirm password</label><input id="acc-pw2" type="password" autocomplete="new-password"/></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:4px;align-items:center;">
        <button class="btn" id="acc-save">Update password</button>
        <span id="acc-msg" class="muted" style="font-size:.85rem;"></span>
      </div>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:14px;">Session</h3>
      <button class="btn btn-ghost" id="acc-logout">Sign out</button>
    </div>`;

  document.getElementById("acc-save").addEventListener("click", async () => {
    const msg = document.getElementById("acc-msg");
    const pw1 = document.getElementById("acc-pw1").value;
    const pw2 = document.getElementById("acc-pw2").value;
    if (pw1.length < 8) { msg.textContent = "Password must be at least 8 characters."; return; }
    if (pw1 !== pw2) { msg.textContent = "Passwords do not match."; return; }
    msg.textContent = "Updating…";
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) { msg.textContent = "Error: " + error.message; return; }
    document.getElementById("acc-pw1").value = "";
    document.getElementById("acc-pw2").value = "";
    msg.textContent = "Password updated ✓";
  });

  document.getElementById("acc-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

// ── INIT ───────────────────────────────────────────────────────────
handleReturnParams();
// Resume session if already signed in.
gate();
