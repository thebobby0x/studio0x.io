import { supabase, money, configured } from "./supabase-client.js";

document.getElementById("yr").textContent = new Date().getFullYear();
const cfg = window.STORE_CONFIG;
document.getElementById("tagline").textContent = cfg.tagline || document.getElementById("tagline").textContent;

const stateEl = document.getElementById("state");
const gridEl = document.getElementById("grid");

async function load() {
  if (!configured()) {
    document.getElementById("not-configured").classList.remove("hidden");
    stateEl.remove();
    return;
  }
  try {
    const { data, error } = await supabase
      .from("products")
      .select("slug,name,tagline,type,price_cents,compare_at_cents,cover_image_url,is_featured")
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      stateEl.textContent = "No products yet. Add some in the admin.";
      return;
    }
    stateEl.remove();
    gridEl.innerHTML = data.map(card).join("");
  } catch (e) {
    stateEl.innerHTML = `<span class="muted">Couldn't load products: ${e.message}</span>`;
  }
}

function card(p) {
  const cover = p.cover_image_url
    ? `<img src="${p.cover_image_url}" alt="${escapeHtml(p.name)}" loading="lazy"/>`
    : `<span class="ph">${p.type}</span>`;
  const compare = p.compare_at_cents && p.compare_at_cents > p.price_cents
    ? `<span class="compare">${money(p.compare_at_cents)}</span>` : "";
  return `
    <a class="card" href="./product.html?slug=${encodeURIComponent(p.slug)}">
      <div class="card-cover">${cover}</div>
      <div class="card-body">
        <span class="tag">${p.type}</span>
        <div class="card-name">${escapeHtml(p.name)}</div>
        <div class="card-tagline">${escapeHtml(p.tagline || "")}</div>
        <div class="price-row">
          <span class="price">${money(p.price_cents)}</span>${compare}
        </div>
      </div>
    </a>`;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load();
