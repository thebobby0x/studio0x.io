// =====================================================================
// studio0x market — theme toggle (light / dark), shared across pages.
// The pre-paint <head> snippet sets data-theme to avoid a flash; this
// module keeps it in sync and renders the toggle button into the nav.
// =====================================================================
const KEY = "s0x_theme";

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

// Render a sun/moon toggle. `container` is the nav's link wrapper; the
// button is prepended so it sits ahead of the cart/links.
export function mountThemeToggle(container) {
  if (!container) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.setAttribute("aria-label", "Toggle light or dark theme");
  const paint = () => { btn.textContent = currentTheme() === "dark" ? "☀️" : "🌙"; };
  paint();
  btn.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    paint();
  });
  container.insertBefore(btn, container.firstChild);
  return btn;
}
