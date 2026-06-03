import { callFn, money, qs, configured } from "./supabase-client.js";

document.getElementById("yr").textContent = new Date().getFullYear();
const sessionId = qs("session_id");
const box = document.getElementById("downloads");
const stateEl = document.getElementById("state");

let tries = 0;
const MAX_TRIES = 12; // ~24s of polling while the webhook fulfills

async function poll() {
  if (!configured()) { stateEl.innerHTML = `<span class="muted">Storefront not connected.</span>`; return; }
  if (!sessionId) { stateEl.innerHTML = `<span class="muted">Missing order reference.</span>`; return; }

  try {
    const data = await callFn("get-order", { sessionId });

    if (!data.paid) { stateEl.innerHTML = `<span class="muted">We couldn't confirm payment yet. If you were charged, contact support.</span>`; return; }

    if (data.items && data.items.length) {
      render(data);
      return;
    }
    // Paid but webhook still fulfilling → keep polling.
    if (++tries < MAX_TRIES) { setTimeout(poll, 2000); return; }
    stateEl.innerHTML = `<span class="muted">Payment confirmed. Your files are being prepared — we've emailed them to you. Refresh in a minute.</span>`;
  } catch (e) {
    if (++tries < MAX_TRIES) { setTimeout(poll, 2000); return; }
    stateEl.innerHTML = `<span class="muted">Something went wrong loading downloads: ${e.message}</span>`;
  }
}

function render(data) {
  const list = data.items.map((it) => `
    <div class="total-row" style="margin:0;padding:14px 0;">
      <span class="label" style="color:var(--text);font-weight:600;">${esc(it.name || "Your file")}</span>
      ${it.url ? `<a class="btn" href="${it.url}" download>Download ↓</a>` : `<span class="muted">preparing…</span>`}
    </div>`).join("");
  box.innerHTML = `
    ${data.email ? `<p class="muted" style="margin-bottom:10px;">Receipt &amp; links sent to <strong style="color:var(--text)">${esc(data.email)}</strong></p>` : ""}
    ${list}
    <p class="guarantee" style="margin-top:16px;">Links expire in 1 hour for security — re-open this page anytime to refresh them.</p>`;
}

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

poll();
