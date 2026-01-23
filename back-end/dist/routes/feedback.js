import express from "express";
import { appendJsonl, readJsonl } from "../lib/storage.js";
export const feedbackRouter = express.Router();
feedbackRouter.post("/feedback", (req, res) => {
    const { analysisId, label } = req.body;
    if (!analysisId || !label)
        return res.status(400).json({ error: "analysisId and label required" });
    appendJsonl("feedback", { analysisId, label, createdAt: new Date().toISOString() });
    res.json({ ok: true });
});
feedbackRouter.get("/feedback", (_req, res) => res.json(readJsonl("feedback")));
