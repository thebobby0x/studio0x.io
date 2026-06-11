import { Router } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const router = Router();

router.get("/", async (_req, res) => {
  const streams = await prisma.audioStream.findMany({
    include: { team: true },
  });
  res.json(streams);
});

router.get("/:id", async (req, res) => {
  const stream = await prisma.audioStream.findUnique({
    where: { id: req.params.id },
    include: { team: true },
  });
  if (!stream) return res.status(404).json({ error: "Not found" });
  return res.json(stream);
});

const ListenBody = z.object({ seconds: z.number().min(1).max(3600) });

// Called by client every 10 seconds of continuous listening
router.post("/:id/listen", async (req, res) => {
  const parsed = ListenBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { seconds } = parsed.data;

  const updated = await prisma.audioStream.update({
    where: { id: req.params.id },
    data: {
      listenSeconds: { increment: seconds },
      ...(seconds >= 10 && { playCount: { increment: 1 } }),
    },
  });

  return res.json({ playCount: updated.playCount, listenSeconds: updated.listenSeconds });
});

export default router;
