import { Router } from "express";
import { getVipUtilization } from "../services/vipSimulator";
import { getTravelMatrix } from "../services/travelMatrix";

const router = Router();

// V2 stubs — returns placeholder data
router.get("/vip/:venueId", (req, res) => {
  res.json({ status: "stub", data: getVipUtilization(req.params.venueId) });
});

router.get("/travel-matrix", (_req, res) => {
  res.json({ status: "stub", data: getTravelMatrix() });
});

export default router;
