import { NextResponse } from "next/server";

const BASES = [
  "https://api.elections.kalshi.com/trade-api/v2",
  "https://trading-api.kalshi.com/trade-api/v2",
];

async function get(base: string, path: string) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 300); }
    return { status: res.status, ok: res.ok, body: json };
  } catch (err) {
    return { status: 0, ok: false, body: String(err) };
  }
}

// Sequential fetcher — waits 300ms between requests to stay under rate limit
async function seq<T>(tasks: (() => Promise<T>)[], delayMs = 300): Promise<T[]> {
  const results: T[] = [];
  for (const task of tasks) {
    results.push(await task());
    await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = (searchParams.get("home") ?? "USA").toUpperCase();
  const away = (searchParams.get("away") ?? "PAR").toUpperCase();
  const dateStr = searchParams.get("date") ?? "2026-06-12";

  const d = new Date(dateStr + "T00:00:00Z");
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = String(d.getUTCFullYear()).slice(2);
  const mon = MONTHS[d.getUTCMonth()];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const dateCode = `${yy}${mon}${dd}`;

  const results: Record<string, unknown> = {};

  for (const base of BASES) {
    const baseKey = base.includes("elections") ? "elections" : "trading";
    results[baseKey] = {};

    // 1. Try different series tickers — one at a time
    const seriesTickers = ["KXFIFAGAME", "KXWC26", "KXFIFA26", "KXFIFAWC26", "FIFA26", "FIFAWC26"];
    const seriesResults: Record<string, unknown> = {};
    for (const s of seriesTickers) {
      const r = await get(base, `/events?series_ticker=${s}&status=open&limit=10`);
      seriesResults[s] = { status: r.status, count: r.ok ? (r.body as {events?: unknown[]})?.events?.length ?? 0 : 0, sample: r.ok ? (r.body as {events?: unknown[]})?.events?.slice(0, 2) : r.body };
      await new Promise(r => setTimeout(r, 400));
    }
    (results[baseKey] as Record<string, unknown>).series = seriesResults;

    // 2. Try a broad open events list and look for FIFA
    const openR = await get(base, `/events?status=open&limit=100`);
    await new Promise(r => setTimeout(r, 400));
    const allEvents: Array<{event_ticker: string; title?: string}> = openR.ok
      ? ((openR.body as {events?: Array<{event_ticker: string; title?: string}>})?.events ?? [])
      : [];
    const fifaEvents = allEvents.filter(e =>
      e.event_ticker?.toUpperCase().includes("FIFA") ||
      e.event_ticker?.toUpperCase().includes("WC26") ||
      e.event_ticker?.toUpperCase().includes("SOCCER") ||
      e.title?.toUpperCase().includes("FIFA") ||
      e.title?.toUpperCase().includes("WORLD CUP")
    );
    (results[baseKey] as Record<string, unknown>).fifaEvents = {
      totalOpen: allEvents.length,
      fifaFound: fifaEvents.length,
      matches: fifaEvents.slice(0, 10),
      firstFewTickers: allEvents.slice(0, 5).map(e => e.event_ticker),
    };

    // 3. If we found a FIFA event, drill into its markets
    if (fifaEvents.length > 0) {
      const et = fifaEvents[0].event_ticker;
      const mktsR = await get(base, `/markets?event_ticker=${encodeURIComponent(et)}&limit=20`);
      await new Promise(r => setTimeout(r, 400));
      (results[baseKey] as Record<string, unknown>).sampleMarkets = { eventTicker: et, result: mktsR };
    }

    // 4. Try specific tickers with the candidate date code
    const candidateTickers = [
      `KXFIFAGAME-${dateCode}${home}${away}`,
      `KXFIFAGAME-${dateCode}${away}${home}`,
      `KXWC26-${dateCode}${home}${away}`,
      `KXWC26-${dateCode}${away}${home}`,
    ];
    const specificResults: Record<string, unknown> = {};
    for (const et of candidateTickers) {
      const r = await get(base, `/events/${encodeURIComponent(et)}`);
      specificResults[et] = { status: r.status, ok: r.ok };
      await new Promise(r => setTimeout(r, 300));
    }
    (results[baseKey] as Record<string, unknown>).specificEventTickers = specificResults;
  }

  return NextResponse.json({ params: { home, away, date: dateStr, dateCode }, results });
}
