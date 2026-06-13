import { NextResponse } from "next/server";

async function get(url: string) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 500); }
    return { status: res.status, ok: res.ok, body: json };
  } catch (err) {
    return { status: 0, ok: false, body: String(err) };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = (searchParams.get("home") ?? "USA").toUpperCase();
  const away = (searchParams.get("away") ?? "PAR").toUpperCase();

  const results: Record<string, unknown> = {};

  // ── 1. Polymarket gamma API — browse markets ──────────────────────────────
  const pmBase = "https://gamma-api.polymarket.com";

  // Try sports/soccer/world-cup tag searches
  const pmSearches = [
    `${pmBase}/markets?active=true&closed=false&limit=20&tag_slug=soccer`,
    `${pmBase}/markets?active=true&closed=false&limit=20&tag_slug=sports`,
    `${pmBase}/markets?active=true&closed=false&limit=20&tag_slug=world-cup`,
    `${pmBase}/markets?active=true&closed=false&limit=20&q=FIFA`,
    `${pmBase}/markets?active=true&closed=false&limit=20&q=World+Cup`,
    `${pmBase}/markets?active=true&closed=false&limit=20&q=${home}`,
    `${pmBase}/events?active=true&closed=false&limit=20&tag_slug=soccer`,
    `${pmBase}/events?active=true&closed=false&limit=20&q=World+Cup`,
  ];

  const pmResults: Record<string, unknown> = {};
  for (const url of pmSearches) {
    const key = url.replace(pmBase, "");
    const r = await get(url);
    const items = r.ok
      ? ((r.body as {markets?: unknown[]; events?: unknown[]; results?: unknown[]})?.markets
        ?? (r.body as {events?: unknown[]})?.events
        ?? (Array.isArray(r.body) ? r.body as unknown[] : []))
      : [];
    pmResults[key] = {
      status: r.status,
      count: (items as unknown[]).length,
      sample: (items as Array<{slug?: string; question?: string; title?: string}>).slice(0, 5).map(m => ({
        slug: m.slug,
        question: m.question ?? m.title,
      })),
    };
    await new Promise(r => setTimeout(r, 300));
  }
  results.polymarket = pmResults;

  // ── 2. Polymarket CLOB API — check if soccer markets exist ───────────────
  const clobBase = "https://clob.polymarket.com";
  const clobChecks = [
    `${clobBase}/markets?next_cursor=`,
    `${clobBase}/sampling-markets`,
  ];
  const clobResults: Record<string, unknown> = {};
  for (const url of clobChecks) {
    const r = await get(url);
    const items = r.ok
      ? ((r.body as {data?: unknown[]})?.data ?? (Array.isArray(r.body) ? r.body as unknown[] : []))
      : [];
    clobResults[url.replace(clobBase, "")] = {
      status: r.status,
      count: (items as unknown[]).length,
      sample: (items as Array<{condition_id?: string; question?: string; market_slug?: string}>).slice(0, 3).map(m => ({
        condition_id: m.condition_id,
        question: m.question,
        slug: m.market_slug,
      })),
    };
    await new Promise(r => setTimeout(r, 400));
  }
  results.clobApi = clobResults;

  return NextResponse.json({ params: { home, away }, results });
}
