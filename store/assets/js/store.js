import { supabase, money, configured } from "./supabase-client.js";
import { addItem, openDrawer, mountCartToggle } from "./cart.js";
import { mountThemeToggle } from "./theme.js";

document.getElementById("yr").textContent = new Date().getFullYear();
const cfg = window.STORE_CONFIG;
document.getElementById("tagline").textContent = cfg.tagline || document.getElementById("tagline").textContent;

// Active brand: set inline by a per-brand folder page, or via ?brand= param.
const BRAND_KEY = window.STORE_BRAND || new URLSearchParams(location.search).get("brand") || null;

// Mount the cart toggle into the nav.
mountCartToggle(document.getElementById("cart-mount"));

// Nav controls: theme toggle + grid/list view toggle.
const navLinks = document.querySelector(".nav-links");
mountViewToggle(navLinks);
mountThemeToggle(navLinks);

// Grid / list view — persisted on <body data-view>.
function mountViewToggle(container) {
  if (!container) return;
  const saved = localStorage.getItem("s0x_view") === "list" ? "list" : "grid";
  document.body.setAttribute("data-view", saved);
  const seg = document.createElement("div");
  seg.className = "view-seg";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "View");
  seg.innerHTML =
    `<button type="button" data-view="grid" aria-label="Grid view">▦</button>` +
    `<button type="button" data-view="list" aria-label="List view">☰</button>`;
  container.insertBefore(seg, container.firstChild);
  const paint = () => seg.querySelectorAll("button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === document.body.getAttribute("data-view")));
  paint();
  seg.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      document.body.setAttribute("data-view", b.dataset.view);
      localStorage.setItem("s0x_view", b.dataset.view);
      paint();
    }));
}

const stateEl = document.getElementById("state");
const gridEl = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const featuredSection = document.getElementById("featured-section");
const featuredGrid = document.getElementById("featured-grid");

let PRODUCTS = [];
let activeType = "all";

// Engine key → display name + blurb for the brand-page engine sections.
const ENGINES = [
  { key: "contentos", name: "contentOS", blurb: "AI-written content kits — done-for-you copy, scripts & playbooks." },
  { key: "templatevault", name: "templateVault", blurb: "Reusable, fill-in templates — ready to customize and use." },
];

// Apply a brand's theme + copy to the umbrella page chrome.
async function applyBrand() {
  if (!BRAND_KEY) return;
  try {
    const { data: brand } = await supabase
      .from("brands").select("*").eq("key", BRAND_KEY).maybeSingle();
    if (!brand) return;

    const root = document.documentElement.style;
    if (brand.accent) root.setProperty("--accent", brand.accent);
    if (brand.accent2) root.setProperty("--accent2", brand.accent2);

    document.title = `${brand.name} — by studio0x`;

    const logo = document.querySelector(".nav-logo");
    if (logo) {
      logo.classList.remove("brand-name");
      logo.innerHTML =
        `<span class="brand-display">${escapeHtml(brand.name)}</span>` +
        ` <span class="brand-by">by <span class="brand-name">studio0x</span></span>`;
    }

    const eyebrow = document.querySelector(".hero .eyebrow");
    if (eyebrow && brand.eyebrow) { eyebrow.classList.remove("brand-name"); eyebrow.textContent = brand.eyebrow; }
    const h1 = document.querySelector(".hero-title");
    if (h1 && brand.hero_title) h1.textContent = brand.hero_title;
    const sub = document.getElementById("tagline");
    if (sub && brand.hero_sub) sub.textContent = brand.hero_sub;
  } catch { /* leave default chrome */ }
}

// Umbrella store only: render a "Shop by brand" directory above the grid.
let BRANDS = [];
async function renderBrandDirectory() {
  if (BRAND_KEY) return;
  try {
    const { data } = await supabase
      .from("brands").select("*").eq("is_active", true).order("sort", { ascending: true });
    if (!data || !data.length) return;
    BRANDS = data;
    const wrap = document.createElement("section");
    wrap.className = "brand-dir-section";
    wrap.innerHTML =
      `<div class="eyebrow">Shop by brand</div>` +
      `<div class="brand-dir">${data.map(brandCard).join("")}</div>`;
    const products = document.getElementById("products");
    const featured = document.getElementById("featured-section");
    products.insertBefore(wrap, featured.nextSibling);
  } catch { /* directory is optional */ }
}

function brandCard(b) {
  const accent = b.accent || "var(--accent)";
  return `
    <a class="brand-card" href="./index.html?brand=${encodeURIComponent(b.key)}" style="--card-accent:${escapeHtml(accent)};">
      <span class="brand-card-name">${escapeHtml(b.name)}</span>
      <span class="brand-card-tag">${escapeHtml(b.tagline || "")}</span>
    </a>`;
}

async function load() {
  if (!configured()) {
    document.getElementById("not-configured").classList.remove("hidden");
    stateEl.remove();
    return;
  }
  await applyBrand();
  await renderBrandDirectory();
  try {
    let query = supabase
      .from("products")
      .select("id,slug,name,tagline,type,engine,brand,price_cents,compare_at_cents,photo_url,cover_image_url,is_featured")
      .eq("is_active", true);
    if (BRAND_KEY) query = query.eq("brand", BRAND_KEY);
    const { data, error } = await query
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      stateEl.textContent = "No products yet. Add some in the admin.";
      return;
    }
    stateEl.remove();
    PRODUCTS = data;

    renderFeatured();
    if (BRAND_KEY) {
      renderEngineSections();
    } else {
      renderBrandSections();
    }
  } catch (e) {
    stateEl.innerHTML = `<span class="muted">Couldn't load products: ${escapeHtml(e.message)}</span>`;
  }
}

function renderFeatured() {
  const feat = PRODUCTS.filter((p) => p.is_featured);
  if (!feat.length) return;
  featuredGrid.innerHTML = feat.map(card).join("");
  featuredSection.classList.remove("hidden");
  wireCards(featuredGrid);
}

function renderFilters() {
  const types = [...new Set(PRODUCTS.map((p) => p.type).filter(Boolean))];
  if (types.length <= 1) return;
  const chips = ["all", ...types];
  filtersEl.innerHTML = chips.map((t) =>
    `<button class="filter-chip${t === activeType ? " active" : ""}" data-type="${escapeHtml(t)}">${t === "all" ? "All" : escapeHtml(t)}</button>`
  ).join("");
  filtersEl.classList.remove("hidden");
  filtersEl.querySelectorAll(".filter-chip").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeType = btn.dataset.type;
      filtersEl.querySelectorAll(".filter-chip").forEach((b) => b.classList.toggle("active", b === btn));
      renderGrid();
    }));
}

function renderGrid() {
  gridEl.classList.add("grid");
  const list = activeType === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.type === activeType);
  gridEl.innerHTML = list.map(card).join("");
  wireCards(gridEl);
}

// Brand page: replace the single grid with two engine-labeled sections.
// Products are fetched once (above) and partitioned by engine here.
function renderEngineSections() {
  filtersEl.classList.add("hidden");
  filtersEl.innerHTML = "";
  // The sections stack full-width; each inner .engine-grid is the card grid.
  // (Without this, #grid's own card-grid CSS squeezes the 2 sections into 2 cramped columns.)
  gridEl.classList.remove("grid");
  gridEl.innerHTML = "";

  const sections = ENGINES.map((eng) => {
    const list = PRODUCTS.filter((p) => p.engine === eng.key);
    if (!list.length) return "";
    return `
      <section class="engine-section" data-engine="${escapeHtml(eng.key)}">
        <h2>Made with <span class="engine-name">${escapeHtml(eng.name)}</span></h2>
        <p class="engine-blurb">${escapeHtml(eng.blurb)}</p>
        <div class="grid engine-grid">${list.map(card).join("")}</div>
      </section>`;
  }).join("");

  gridEl.innerHTML = sections;
  wireCards(gridEl);
}

// Umbrella page: group all products into per-brand sections, ordered by the
// brand directory. Same visual pattern as the brand-page engine sections.
function renderBrandSections() {
  filtersEl.classList.add("hidden");
  filtersEl.innerHTML = "";
  gridEl.classList.remove("grid");

  const present = [...new Set(PRODUCTS.map((p) => p.brand).filter(Boolean))];
  const order = BRANDS.map((b) => b.key).filter((k) => present.includes(k));
  const keys = order.concat(present.filter((k) => !order.includes(k)));
  const meta = (k) => BRANDS.find((b) => b.key === k) || {};

  const sections = keys.map((k) => {
    const list = PRODUCTS.filter((p) => p.brand === k);
    if (!list.length) return "";
    const b = meta(k);
    return `
      <section class="engine-section brand-section" data-brand="${escapeHtml(k)}">
        <h2><span class="engine-name">${escapeHtml(b.name || k)}</span></h2>
        <p class="engine-blurb">${escapeHtml(b.tagline || "")}</p>
        <div class="grid engine-grid">${list.map(card).join("")}</div>
      </section>`;
  }).join("");

  gridEl.innerHTML = sections || `<p class="muted" style="margin-top:40px;">No products yet.</p>`;
  wireCards(gridEl);
}

function productHref(slug) {
  const brandQ = BRAND_KEY ? `&brand=${encodeURIComponent(BRAND_KEY)}` : "";
  return `./product.html?slug=${encodeURIComponent(slug)}${brandQ}`;
}

function card(p) {
  const src = p.photo_url || p.cover_image_url;
  const cover = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="lazy"/>`
    : `<span class="ph">${escapeHtml(p.type || "")}</span>`;
  const compare = p.compare_at_cents && p.compare_at_cents > p.price_cents
    ? `<span class="compare">${money(p.compare_at_cents)}</span>` : "";
  const href = productHref(p.slug);
  return `
    <div class="card" data-id="${escapeHtml(p.id)}">
      <a class="card-cover" href="${href}">
        ${cover}
      </a>
      <div class="card-body">
        <span class="tag">${escapeHtml(p.type || "")}</span>
        <a class="card-name" href="${href}">${escapeHtml(p.name)}</a>
        <div class="card-tagline">${escapeHtml(p.tagline || "")}</div>
        <div class="price-row">
          <span class="price">${money(p.price_cents)}</span>${compare}
        </div>
        <div class="card-actions">
          <a class="btn btn-ghost btn-sm" href="${href}">View</a>
          <button class="btn btn-sm card-add" data-id="${escapeHtml(p.id)}">Add to cart</button>
        </div>
      </div>
    </div>`;
}

function wireCards(scope) {
  scope.querySelectorAll(".card-add").forEach((btn) =>
    btn.addEventListener("click", () => {
      const p = PRODUCTS.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      addItem(p);
      openDrawer();
    }));
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load();
