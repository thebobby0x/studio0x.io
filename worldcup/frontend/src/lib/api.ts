const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function fetchLiveData(matchId: string) {
  const res = await fetch(`${API}/api/matches/${matchId}/live`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch live data");
  return res.json();
}

export async function fetchMatches() {
  const res = await fetch(`${API}/api/matches`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch matches");
  return res.json();
}

export async function fetchAudioStreams() {
  const res = await fetch(`${API}/api/audio`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audio");
  return res.json();
}

export async function recordListen(streamId: string, seconds: number) {
  const res = await fetch(`${API}/api/audio/${streamId}/listen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seconds }),
  });
  return res.json();
}
