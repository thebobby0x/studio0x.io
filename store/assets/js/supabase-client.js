// Shared Supabase client + helpers (ES module).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cfg = window.STORE_CONFIG;
export const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

export const money = (cents, currency = cfg.currency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);

// Call an edge function and return parsed JSON.
export async function callFn(name, body) {
  const res = await fetch(`${cfg.functionsBase}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const qs = (k) => new URLSearchParams(location.search).get(k);

export function configured() {
  return cfg.supabaseUrl && !cfg.supabaseUrl.includes("YOUR_PROJECT_REF");
}
