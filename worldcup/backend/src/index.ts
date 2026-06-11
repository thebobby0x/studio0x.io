import "express-async-errors";
import express from "express";
import cors from "cors";
import matchRoutes from "./routes/matches";
import audioRoutes from "./routes/audio";
import v2Routes from "./routes/v2stubs";
import { prisma } from "./lib/prisma";
import { tickMatchFeed } from "./services/matchFeed";
import { tickKalshi } from "./services/kalshiService";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Health
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// API routes
app.use("/api/matches", matchRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/v2", v2Routes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

async function startLiveLoop() {
  const match = await prisma.match.findFirst({ where: { status: { in: ["NS", "LIVE", "HT"] } } });
  if (!match) {
    console.log("[loop] No active match found — skipping live loop");
    return;
  }

  console.log(`[loop] Starting live simulation for match ${match.id}`);
  setInterval(async () => {
    try {
      await tickMatchFeed(match.id);
      await tickKalshi(match.id);
    } catch (e) {
      console.error("[loop] tick error:", e);
    }
  }, 5000); // tick every 5 seconds
}

app.listen(PORT, async () => {
  console.log(`[server] World Cup API running at http://localhost:${PORT}`);
  await startLiveLoop();
});
