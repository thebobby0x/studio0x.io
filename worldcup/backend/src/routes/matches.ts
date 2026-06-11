import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getLatestMetrics } from "../services/matchFeed";
import { getMarkets } from "../services/kalshiService";

const router = Router();

router.get("/", async (_req, res) => {
  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });
  res.json(matches);
});

router.get("/:id", async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return res.status(404).json({ error: "Match not found" });
  return res.json(match);
});

router.get("/:id/live", async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return res.status(404).json({ error: "Match not found" });

  const metrics = await getLatestMetrics(req.params.id);
  const markets = await getMarkets(req.params.id);

  return res.json({ match, metrics, markets });
});

router.get("/:id/lineup", async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: {
      homeTeam: { include: { homePlayers: true } },
      awayTeam: { include: { homePlayers: true } },
    },
  });
  if (!match) return res.status(404).json({ error: "Not found" });

  return res.json({
    home: { team: match.homeTeam.name, players: match.homeTeam.homePlayers },
    away: { team: match.awayTeam.name, players: match.awayTeam.homePlayers },
  });
});

export default router;
