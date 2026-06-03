import { supabase, money, callFn, qs, configured } from "./supabase-client.js";

document.getElementById("yr").textContent = new Date().getFullYear();
const slug = qs("slug");
const contentEl = document.getElementById("content");

let PRODUCT = null;
let ADDONS = [];
const selected = new Set();

async function load() {
  if (!configured()) {
    contentEl.innerHTML = `<div class="banner">⚙️ Storefront not connected. Add Supabase keys in <span class="mono">config.js</span>.</div>`;
    return;
  }
  if (!slug) { contentEl.innerHTML = `<p class="muted">No product specified.</p>`; return; }

  const { data: product, error } = await supabase
    .from("products").select("*").eq("slug", slug).eq("is_active", true).single();
  if (error || !product) { contentEl.innerHTML = `<p class="muted">Product not found.</p>`; return; }
  PRODUCT = product;

  // Add-ons: this product's specific ones + any global ones.
  const [{ data: linked }, { data: globals }] = await Promise.all([
    supabase.from("product_addons").select("addon:addons(*)").eq("product_id", product.id),
    supabase.from("addons").select("*").eq("is_global", true).eq("is_active", true),
  ]);
  const map = new Map();
  (linked || []).forEach((r) => r.addon && r.addon.is_active && map.set(r.addon.id, r.addon));
  (globals || []).forEach((a) => map.set(a.id, a));
  ADDONS = [...map.values()];

  render();
}

function render() {
  const p = PRODUCT;
  document.getElementById("title").textContent = `${p.name} — studio0x market`;
  document.getElementById("meta-desc").setAttribute("content", p.seo_description || p.tagline || "");
  const landing = p.landing || {};
  const bullets = Array.isArray(landing.bullets) ? landing.bullets : [];
  const faqs = Array.isArray(landing.faq) ? landing.faq : [];
  const ctaLabel = landing.cta || "Get instant access";

  const cover = p.cover_image_url
    ? `<img src="${p.cover_image_url}" alt="${esc(p.name)}"/>`
    : `<span class="ph">${p.type}</span>`;
  const compare = p.compare_at_cents && p.compare_at_cents > p.price_cents
    ? `<span class="compare">${money(p.compare_at_cents)}</span>` : "";

  contentEl.innerHTML = `
    <div class="product-hero">
      <div>
        <div class="eyebrow">${p.type} · instant download</div>
        <h1 class="page">${esc(p.name)}</h1>
        <p class="sub">${esc(p.tagline || "")}</p>
        <div class="product-media" style="margin-top:28px;">${cover}</div>
        ${bullets.length ? `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
        ${p.description ? `<div class="section"><h2>What's inside</h2><p class="prose">${esc(p.description)}</p></div>` : ""}
        ${faqs.length ? `<div class="section"><h2>FAQ</h2>${faqs.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join("")}</div>` : ""}
        <div class="section center">
          <a class="btn" href="#buy">${esc(ctaLabel)} →</a>
        </div>
      </div>

      <aside id="buy">
        <div class="buy-box">
          <div class="buy-price"><span class="price">${money(p.price_cents)}</span>${compare}</div>
          ${ADDONS.length ? `<div class="bump-badge">★ Add these — most buyers do</div><div class="addons" id="addons">${ADDONS.map(addonRow).join("")}</div>` : ""}
          <div class="total-row"><span class="label">Total today</span><span class="amt" id="total">${money(p.price_cents)}</span></div>
          <button class="btn btn-block" id="buy-btn">${esc(ctaLabel)} →</button>
          <div class="guarantee">🔒 Secure Stripe checkout · instant delivery · ${PRODUCT.currency.toUpperCase()}</div>
        </div>
      </aside>
    </div>`;

  // Wire add-on toggles
  document.querySelectorAll(".addon").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") {
        const box = el.querySelector("input"); box.checked = !box.checked;
      }
      const id = el.dataset.id; const box = el.querySelector("input");
      box.checked ? selected.add(id) : selected.delete(id);
      el.classList.toggle("checked", box.checked);
      updateTotal();
    });
  });

  document.getElementById("buy-btn").addEventListener("click", checkout);
}

function addonRow(a) {
  return `
    <label class="addon" data-id="${a.id}">
      <input type="checkbox" />
      <span class="addon-info">
        <span class="addon-name">${esc(a.name)}</span>
        <span class="addon-pitch">${esc(a.pitch || a.description || "")}</span>
      </span>
      <span class="addon-price">+${money(a.price_cents)}</span>
    </label>`;
}

function updateTotal() {
  let total = PRODUCT.price_cents;
  ADDONS.forEach((a) => { if (selected.has(a.id)) total += a.price_cents; });
  document.getElementById("total").textContent = money(total);
}

async function checkout() {
  const btn = document.getElementById("buy-btn");
  btn.disabled = true; btn.textContent = "Redirecting to secure checkout…";
  try {
    const { url } = await callFn("create-checkout-session", {
      productId: PRODUCT.id,
      addonIds: [...selected],
      successUrl: `${location.origin}${location.pathname.replace("product.html", "success.html")}`,
      cancelUrl: location.href,
    });
    if (!url) throw new Error("No checkout URL returned");
    location.href = url;
  } catch (e) {
    btn.disabled = false; btn.textContent = "Try again →";
    alert("Checkout error: " + e.message);
  }
}

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

load();
