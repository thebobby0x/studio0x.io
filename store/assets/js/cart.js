// =====================================================================
// studio0x market — cart module (ES module, dependency-free)
// LocalStorage-backed cart + slide-in drawer + checkout.
// =====================================================================
import { supabase, money, callFn, configured } from "./supabase-client.js";

const KEY = "s0x_cart";
const subs = new Set();

// ── State ──────────────────────────────────────────────────────────
function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  subs.forEach((cb) => { try { cb(items); } catch { /* noop */ } });
}

export function getItems() {
  return read();
}
export function count() {
  return read().length;
}
export function total() {
  return read().reduce((sum, it) => sum + (it.price_cents || 0), 0);
}
export function addItem(product) {
  if (!product || !product.id) return;
  const items = read();
  if (items.some((it) => it.id === product.id)) return; // no duplicates
  items.push({
    id: product.id,
    slug: product.slug,
    name: product.name,
    price_cents: product.price_cents,
    cover_image_url: product.cover_image_url || null,
  });
  write(items);
}
export function removeItem(id) {
  write(read().filter((it) => it.id !== id));
}
export function clear() {
  write([]);
}
export function onChange(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

// Keep tabs in sync.
window.addEventListener("storage", (e) => {
  if (e.key === KEY) subs.forEach((cb) => { try { cb(read()); } catch { /* noop */ } });
});

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── Drawer ─────────────────────────────────────────────────────────
let BUMPS = [];
let bumpsLoaded = false;
let overlayEl = null;
let drawerEl = null;

function ensureDrawer() {
  if (drawerEl) return;

  overlayEl = document.createElement("div");
  overlayEl.className = "cart-overlay hidden";
  overlayEl.addEventListener("click", closeDrawer);

  drawerEl = document.createElement("aside");
  drawerEl.className = "cart-drawer";
  drawerEl.setAttribute("aria-hidden", "true");
  drawerEl.innerHTML = `
    <div class="cart-head">
      <span class="eyebrow" style="margin:0;">Your cart</span>
      <button class="cart-close" aria-label="Close cart">×</button>
    </div>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-foot" id="cart-foot"></div>`;

  document.body.appendChild(overlayEl);
  document.body.appendChild(drawerEl);

  drawerEl.querySelector(".cart-close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  onChange(() => { if (drawerEl && drawerEl.classList.contains("open")) renderDrawer(); });
}

async function loadBumps() {
  if (bumpsLoaded || !configured()) return;
  bumpsLoaded = true;
  try {
    const { data } = await supabase
      .from("addons")
      .select("*")
      .eq("is_global", true)
      .eq("is_active", true);
    BUMPS = data || [];
  } catch {
    BUMPS = [];
  }
}

export async function openDrawer() {
  ensureDrawer();
  await loadBumps();
  renderDrawer();
  overlayEl.classList.remove("hidden");
  drawerEl.classList.add("open");
  drawerEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
export function closeDrawer() {
  if (!drawerEl) return;
  drawerEl.classList.remove("open");
  drawerEl.setAttribute("aria-hidden", "true");
  overlayEl.classList.add("hidden");
  document.body.style.overflow = "";
}

function selectedBumpIds() {
  if (!drawerEl) return [];
  return [...drawerEl.querySelectorAll(".cart-bump input:checked")].map((i) => i.dataset.id);
}

function computeTotal() {
  let t = total();
  const ids = new Set(selectedBumpIds());
  BUMPS.forEach((b) => { if (ids.has(b.id)) t += b.price_cents; });
  return t;
}

function renderDrawer() {
  const items = read();
  const itemsEl = drawerEl.querySelector("#cart-items");
  const footEl = drawerEl.querySelector("#cart-foot");

  if (!items.length) {
    itemsEl.innerHTML = `<p class="muted cart-empty">Your cart is empty.<br/><a href="./index.html#products" style="color:var(--accent);text-decoration:none;">Browse products →</a></p>`;
    footEl.innerHTML = "";
    return;
  }

  itemsEl.innerHTML = items.map((it) => {
    const cover = it.cover_image_url
      ? `<img src="${esc(it.cover_image_url)}" alt="${esc(it.name)}" loading="lazy"/>`
      : `<span class="cart-ph"></span>`;
    return `
      <div class="cart-item" data-id="${esc(it.id)}">
        <div class="cart-thumb">${cover}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(it.name)}</div>
          <div class="cart-item-price">${money(it.price_cents)}</div>
        </div>
        <button class="cart-remove" data-id="${esc(it.id)}" aria-label="Remove">×</button>
      </div>`;
  }).join("");

  const bumps = BUMPS.length ? `
    <div class="cart-bumps">
      <div class="bump-badge">★ Add these — most buyers do</div>
      ${BUMPS.map((b) => `
        <label class="cart-bump">
          <input type="checkbox" data-id="${esc(b.id)}" />
          <span class="addon-info">
            <span class="addon-name">${esc(b.name)}</span>
            <span class="addon-pitch">${esc(b.pitch || "")}</span>
          </span>
          <span class="addon-price">+${money(b.price_cents)}</span>
        </label>`).join("")}
    </div>` : "";

  footEl.innerHTML = `
    ${bumps}
    <div class="total-row"><span class="label">Subtotal</span><span class="amt" id="cart-total">${money(computeTotal())}</span></div>
    <button class="btn btn-block" id="cart-checkout">Checkout →</button>
    <div class="guarantee">🔒 Secure Stripe checkout · instant delivery</div>`;

  itemsEl.querySelectorAll(".cart-remove").forEach((b) =>
    b.addEventListener("click", () => removeItem(b.dataset.id)));
  footEl.querySelectorAll(".cart-bump input").forEach((i) =>
    i.addEventListener("change", () => {
      const tEl = drawerEl.querySelector("#cart-total");
      if (tEl) tEl.textContent = money(computeTotal());
    }));
  const btn = footEl.querySelector("#cart-checkout");
  if (btn) btn.addEventListener("click", checkout);
}

async function checkout() {
  const items = read();
  if (!items.length) return;
  const btn = drawerEl.querySelector("#cart-checkout");
  btn.disabled = true;
  btn.textContent = "Redirecting to secure checkout…";
  try {
    const { url } = await callFn("create-checkout-session", {
      productIds: items.map((it) => it.id),
      addonIds: selectedBumpIds(),
      successUrl: `${location.origin}${location.pathname.replace(/[^/]*$/, "success.html")}`,
      cancelUrl: location.href,
    });
    if (!url) throw new Error("No checkout URL returned");
    location.href = url;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Try again →";
    alert("Checkout error: " + e.message);
  }
}

// ── Nav toggle button ──────────────────────────────────────────────
export function mountCartToggle(container) {
  if (!container) return;
  const btn = document.createElement("button");
  btn.className = "cart-toggle";
  btn.type = "button";
  btn.setAttribute("aria-label", "Open cart");
  btn.innerHTML = `<span class="cart-icon" aria-hidden="true">🛒</span><span class="cart-badge hidden">0</span>`;
  btn.addEventListener("click", openDrawer);
  container.appendChild(btn);

  const badge = btn.querySelector(".cart-badge");
  const sync = () => {
    const n = count();
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
  };
  sync();
  onChange(sync);
  return btn;
}
