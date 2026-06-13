import { NextResponse } from "next/server";

const GAMMA = "https://gamma-api.polymarket.com";

async function get(url: string) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 500); }
    return { status: res.status, ok: res.ok, body: json };
  } catch (err) {
    return { status: 0, ok: false, body: String(err) };
  }
}

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Fetch ALL soccer events (more pages)
  const evR = await get(`${GAMMA}/events?active=true&closed=false&limit=50&tag_slug=soccer`);
  const events = evR.ok
    ? ((evR.body as {events?: Array<{slug: string; title: string; markets?: unknown[]}>})?.events
       ?? (Array.isArray(evR.body) ? evR.body as Array<{slug: string; title: string}> : []))
    : [];
  results.allSoccerEvents = events.map((e: {slug: string; title: string; markets?: unknown[]}) => ({
    slug: e.slug,
    title: e.title,
    marketCount: e.markets?.length ?? "?",
  }));

  await new Promise(r => setTimeout(r, 400));

  // 2. Drill into a specific group winner event
  const groupSlugs = ["world-cup-group-a-winner", "world-cup-group-b-winner"];
  for (const slug of groupSlugs) {
    const r = await get(`${GAMMA}/events?slug=${slug}`);
    const evts = r.ok
      ? ((r.body as {events?: unknown[]})?.events ?? (Array.isArray(r.body) ? r.body : []))
      : [];
    results[slug] = { status: r.status, count: (evts as unknown[]).length, full: (evts as unknown[])[0] };
    await new Promise(r => setTimeout(r, 400));
  }

  // 3. Fetch the tournament winner event for structure reference
  const twR = await get(`${GAMMA}/events?slug=world-cup-winner`);
  const twEvts = twR.ok
    ? ((twR.body as {events?: unknown[]})?.events ?? (Array.isArray(twR.body) ? twR.body : []))
    : [];
  results["world-cup-winner"] = { status: twR.status, full: (twEvts as unknown[])[0] };

  await new Promise(r => setTimeout(r, 400));

  // 4. Try fetching a known market by slug from CLOB
  const clobR = await get(`https://clob.polymarket.com/markets/will-uruguay-win-group-h-in-the-2026-fifa-world-cup`);
  results.clobUruguayMarket = { status: clobR.status, body: clobR.body };

  return NextResponse.json(results);
}
