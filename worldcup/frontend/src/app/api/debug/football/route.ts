import { NextResponse } from "next/server";

const BASE = "https://v3.football.api-sports.io";

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_FOOTBALL_KEY not set" }, { status: 503 });

  const results: Record<string, unknown> = {};

  // 1. Check account status
  try {
    const r = await fetch(`${BASE}/status`, { headers: { "x-apisports-key": apiKey }, cache: "no-store" });
    results.status = await r.json();
  } catch (e) {
    results.status = { error: String(e) };
  }

  // 2. Search for World Cup leagues in season 2026
  try {
    const r = await fetch(`${BASE}/leagues?name=World+Cup&season=2026`, { headers: { "x-apisports-key": apiKey }, cache: "no-store" });
    results.leagues_worldcup_2026 = await r.json();
  } catch (e) {
    results.leagues_worldcup_2026 = { error: String(e) };
  }

  // 3. Check league 1 metadata
  try {
    const r = await fetch(`${BASE}/leagues?id=1`, { headers: { "x-apisports-key": apiKey }, cache: "no-store" });
    results.league_1 = await r.json();
  } catch (e) {
    results.league_1 = { error: String(e) };
  }

  // 4. Try fixtures with league=1, season=2026 (current assumption)
  try {
    const r = await fetch(`${BASE}/fixtures?league=1&season=2026&timezone=UTC`, { headers: { "x-apisports-key": apiKey }, cache: "no-store" });
    const json = await r.json();
    results.fixtures_league1_2026 = {
      results: json.results,
      errors: json.errors,
      sample: json.response?.slice(0, 2),
    };
  } catch (e) {
    results.fixtures_league1_2026 = { error: String(e) };
  }

  return NextResponse.json(results, { status: 200 });
}
