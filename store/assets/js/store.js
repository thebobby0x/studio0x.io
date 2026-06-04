import { supabase, money, configured } from "./supabase-client.js";
import { addItem, openDrawer, mountCartToggle } from "./cart.js";

document.getElementById("yr").textContent = new Date().getFullYear();
const cfg = window.STORE_CONFIG;
document.getElementById("tagline").textContent = cfg.tagline || document.getElementById("tagline").textContent;

// Mount the cart toggle into the nav.
mountCartToggle(document.getElementById("cart-mount"));

const stateEl = document.getElementById("state");
const gridEl = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const featuredSection = document.getElementById("featured-section");
const featuredGrid = document.getElementById("featured-grid");

let PRODUCTS = [];
let activeType = "all";

async function load() {
  if (!configured()) {
    document.getElementById("not-configured").classList.remove("hidden");
    stateEl.remove();
    return;
  }
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id,slug,name,tagline,type,price_cents,compare_at_cents,cover_image_url,is_featured")
      .eq("is_active", true)
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
    renderFilters();
    renderGrid();
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
  const list = activeType === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.type === activeType);
  gridEl.innerHTML = list.map(card).join("");
  wireCards(gridEl);
}

function card(p) {
  const cover = p.cover_image_url
    ? `<img src="${escapeHtml(p.cover_image_url)}" alt="${escapeHtml(p.name)}" loading="lazy"/>`
    : `<span class="ph">${escapeHtml(p.type || "")}</span>`;
  const compare = p.compare_at_cents && p.compare_at_cents > p.price_cents
    ? `<span class="compare">${money(p.compare_at_cents)}</span>` : "";
  const star = p.is_featured ? `<span class="card-star" title="Featured">★</span>` : "";
  return `
    <div class="card" data-id="${escapeHtml(p.id)}">
      <a class="card-cover" href="./product.html?slug=${encodeURIComponent(p.slug)}">
        ${cover}
        ${star}
      </a>
      <div class="card-body">
        <span class="tag">${escapeHtml(p.type || "")}</span>
        <a class="card-name" href="./product.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.name)}</a>
        <div class="card-tagline">${escapeHtml(p.tagline || "")}</div>
        <div class="price-row">
          <span class="price">${money(p.price_cents)}</span>${compare}
        </div>
        <div class="card-actions">
          <a class="btn btn-ghost btn-sm" href="./product.html?slug=${encodeURIComponent(p.slug)}">View</a>
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
