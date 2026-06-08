import { supabase, money, callFn, qs, configured } from "./supabase-client.js";
import { addItem, openDrawer, mountCartToggle } from "./cart.js";
import { mountThemeToggle } from "./theme.js";

document.getElementById("yr").textContent = new Date().getFullYear();
const slug = qs("slug");
const contentEl = document.getElementById("content");

// Active brand: ?brand= param (or set inline by a per-brand page).
const BRAND_KEY = window.STORE_BRAND || new URLSearchParams(location.search).get("brand") || null;
const brandQ = BRAND_KEY ? `?brand=${encodeURIComponent(BRAND_KEY)}` : "";

// Engine key → display name for the provenance badge.
const ENGINE_NAMES = { contentos: "contentOS", templatevault: "templateVault" };

mountCartToggle(document.getElementById("cart-mount"));
mountThemeToggle(document.querySelector(".nav-links"));

// Brand-aware nav: theme accent + logo, and keep ?brand= on back links.
async function applyBrand() {
  document.querySelectorAll('a[href="./index.html"]').forEach((a) => { a.href = `./index.html${brandQ}`; });
  if (!BRAND_KEY) return;
  try {
    const { data: brand } = await supabase
      .from("brands").select("*").eq("key", BRAND_KEY).maybeSingle();
    if (!brand) return;
    const root = document.documentElement.style;
    if (brand.accent) root.setProperty("--accent", brand.accent);
    if (brand.accent2) root.setProperty("--accent2", brand.accent2);
    const logo = document.querySelector(".nav-logo");
    if (logo) {
      logo.classList.remove("brand-name");
      logo.innerHTML =
        `<span class="brand-display">${esc(brand.name)}</span>` +
        ` <span class="brand-by">by <span class="brand-name">studio0x</span></span>`;
    }
  } catch { /* leave default chrome */ }
}

let PRODUCT = null;
let ADDONS = [];
const selected = new Set();

async function load() {
  if (!configured()) {
    contentEl.innerHTML = `<div class="banner">⚙️ Storefront not connected. Add Supabase keys in <span class="mono">config.js</span>.</div>`;
    return;
  }
  if (!slug) { contentEl.innerHTML = `<p class="muted">No product specified.</p>`; return; }

  applyBrand();

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

  // Only offer the "Editable Files" upgrade on products that actually have
  // editable sources (e.g. AI-generated ones), so nobody pays for nothing.
  const hasEditable = Array.isArray(product.editable_paths) && product.editable_paths.length > 0;
  if (!hasEditable) ADDONS = ADDONS.filter((a) => !a.grants_editable);

  // Order bumps: "Editable Files" (grants_editable) first, then by ascending price.
  ADDONS.sort(addonSort);

  render();
}

function render() {
  const p = PRODUCT;
  document.getElementById("title").textContent = `${p.name} — studio0x market`;
  document.getElementById("meta-desc").setAttribute("content", p.seo_description || p.tagline || "");
  const landing = p.landing || {};
  const bullets = Array.isArray(landing.bullets) ? landing.bullets : [];
  const tags = Array.isArray(landing.tags) ? landing.tags : [];
  const faqs = Array.isArray(landing.faq) ? landing.faq : [];
  const testimonials = Array.isArray(landing.testimonials) ? landing.testimonials : [];
  const ctaLabel = landing.cta || "Get instant access";

  const coverSrc = p.photo_url || p.cover_image_url;
  const cover = coverSrc
    ? `<img src="${esc(coverSrc)}" alt="${esc(p.name)}"/>`
    : `<span class="ph">${esc(p.type)}</span>`;
  const compare = p.compare_at_cents && p.compare_at_cents > p.price_cents
    ? `<span class="compare">${money(p.compare_at_cents)}</span>` : "";
  const tagChips = tags.length
    ? `<div class="tag-chips">${tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("")}</div>` : "";
  const engineName = ENGINE_NAMES[p.engine];
  const provenance = engineName
    ? `<div class="provenance"><span class="provenance-made">Made with <span class="provenance-engine">${esc(engineName)}</span></span><span class="provenance-by">· by <span class="brand-name">studio0x</span></span></div>` : "";

  contentEl.innerHTML = `
    <div class="product-hero">
      <div>
        <div class="eyebrow">${esc(p.type)} · instant download</div>
        <h1 class="page">${esc(p.name)}</h1>
        ${provenance}
        ${tagChips}
        <p class="sub">${esc(p.tagline || "")}</p>
        <div class="product-media" style="margin-top:28px;">${cover}</div>
        ${bullets.length ? `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
        ${p.description ? `<div class="section"><h2>What's inside</h2><p class="prose">${esc(p.description)}</p></div>` : ""}
        ${testimonials.length ? `<div class="section"><h2>Loved by buyers</h2><div class="testimonials">${testimonials.map((t) => `<figure class="testimonial"><blockquote>"${esc(t.quote)}"</blockquote><figcaption>— ${esc(t.name)}${t.role ? `, ${esc(t.role)}` : ""}</figcaption></figure>`).join("")}</div></div>` : ""}
        ${faqs.length ? `<div class="section"><h2>FAQ</h2>${faqs.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join("")}</div>` : ""}
        <div class="section center">
          <a class="btn" href="#buy">${esc(ctaLabel)} →</a>
          <div class="guarantee" style="margin-top:14px;">⚡ Instant download · yours to keep</div>
        </div>
      </div>

      <aside id="buy">
        <div class="buy-box">
          <div class="buy-price"><span class="price">${money(p.price_cents)}</span>${compare}</div>
          ${ADDONS.length ? `<div class="bump-badge">★ Add these — most buyers do</div><div class="addons" id="addons">${ADDONS.map(addonRow).join("")}</div>` : ""}
          <div class="total-row"><span class="label">Total today</span><span class="amt" id="total">${money(p.price_cents)}</span></div>
          <button class="btn btn-block" id="buy-btn">${esc(ctaLabel)} →</button>
          <button class="btn btn-ghost btn-block" id="add-cart-btn" style="margin-top:10px;">Add to cart</button>
          <div class="trust-badges">
            <span>⚡ Instant delivery</span>
            <span>🔒 Secure checkout</span>
            <span>✅ Yours to keep</span>
          </div>
          <div class="guarantee">${PRODUCT.currency.toUpperCase()} · instant delivery</div>
          <div class="guarantee" style="margin-top:8px;">By purchasing you agree to our <a href="./terms.html" style="color:var(--muted);text-decoration:underline;">Terms &amp; refund policy</a></div>
        </div>
      </aside>
    </div>

    <div class="mobile-buybar" id="mobile-buybar" aria-hidden="true">
      <span class="mobile-buybar-price">${money(p.price_cents)}</span>
      <button class="btn" id="mobile-buy-btn">${esc(ctaLabel)} →</button>
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
  document.getElementById("mobile-buy-btn").addEventListener("click", checkout);
  document.getElementById("add-cart-btn").addEventListener("click", () => {
    addItem(PRODUCT);
    openDrawer();
  });

  setupMobileBar();
}

function setupMobileBar() {
  const bar = document.getElementById("mobile-buybar");
  const buyBox = document.querySelector(".buy-box");
  if (!bar || !buyBox || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      bar.classList.toggle("show", !entry.isIntersecting);
      bar.setAttribute("aria-hidden", entry.isIntersecting ? "true" : "false");
    });
  }, { threshold: 0 });
  io.observe(buyBox);
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
  const mbtn = document.getElementById("mobile-buy-btn");
  [btn, mbtn].forEach((b) => { if (b) { b.disabled = true; } });
  if (btn) btn.textContent = "Redirecting to secure checkout…";
  try {
    const { url } = await callFn("create-checkout-session", {
      productIds: [PRODUCT.id],
      addonIds: [...selected],
      successUrl: `${location.origin}${location.pathname.replace("product.html", "success.html")}`,
      cancelUrl: location.href,
    });
    if (!url) throw new Error("No checkout URL returned");
    location.href = url;
  } catch (e) {
    [btn, mbtn].forEach((b) => { if (b) b.disabled = false; });
    if (btn) btn.textContent = "Try again →";
    alert("Checkout error: " + e.message);
  }
}

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Add-on ordering: editable-files bump first, then ascending price.
function addonSort(a, b) {
  const ea = a.grants_editable ? 0 : 1;
  const eb = b.grants_editable ? 0 : 1;
  if (ea !== eb) return ea - eb;
  return (a.price_cents || 0) - (b.price_cents || 0);
}

load();
