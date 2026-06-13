import { NextResponse } from "next/server";

const BASE = "https://api.elections.kalshi.com/trade-api/v2";

async function get(path: string) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, ok: res.ok, body: json };
  } catch (err) {
    return { status: 0, ok: false, body: String(err) };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = (searchParams.get("home") ?? "USA").toUpperCase();
  const away = (searchParams.get("away") ?? "PAR").toUpperCase();
  const dateStr = searchParams.get("date") ?? "2026-06-12"; // YYYY-MM-DD

  const d = new Date(dateStr + "T00:00:00Z");
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = String(d.getUTCFullYear()).slice(2);
  const mon = MONTHS[d.getUTCMonth()];
  const dd = String(d.getUTCDate()).padStart(2, "0");

  // Various ticker formats to probe
  const formats = [
    `KXFIFAGAME-${yy}${mon}${dd}${home}${away}`,
    `KXFIFAGAME-${yy}${mon}${dd}${away}${home}`,
    `KXFIFAGAME-${yy}${mon}${dd}-${home}-${away}`,
    `KXFIFAGAME-${yy}${mon}${dd}-${away}-${home}`,
    `KXWC26-${yy}${mon}${dd}${home}${away}`,
    `KXWC26-${yy}${mon}${dd}${away}${home}`,
    `FIFA26-${home}-${away}`,
    `FIFA26-${away}-${home}`,
  ];

  // Try each event ticker + its -HOME and -TIE markets
  const eventProbes = await Promise.all(
    formats.map(async (et) => {
      const [evRes, homeMkt, tieMkt, awayMkt] = await Promise.all([
        get(`/events/${encodeURIComponent(et)}`),
        get(`/markets/${encodeURIComponent(`${et}-${home}`)}`),
        get(`/markets/${encodeURIComponent(`${et}-TIE`)}`),
        get(`/markets/${encodeURIComponent(`${et}-${away}`)}`),
      ]);
      return { eventTicker: et, event: evRes, markets: { home: homeMkt, tie: tieMkt, away: awayMkt } };
    })
  );

  // Try different series tickers
  const seriesProbes = await Promise.all([
    get(`/events?series_ticker=KXFIFAGAME&status=open&limit=20`),
    get(`/events?series_ticker=KXWC26&status=open&limit=20`),
    get(`/events?series_ticker=FIFA26&status=open&limit=20`),
    get(`/series?limit=20`),
    get(`/events?status=open&limit=5`),
  ].map(async (p, i) => ({ probe: i, result: await p })));

  return NextResponse.json({
    params: { home, away, date: dateStr, builtDate: `${yy}${mon}${dd}` },
    eventProbes,
    seriesProbes,
  }, { status: 200 });
}
