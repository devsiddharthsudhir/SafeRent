import express from "express";
import { readJsonl } from "../lib/storage.js";
export const reputationRouter = express.Router();
reputationRouter.get("/reputation/:subjectId", (req, res) => {
    const subjectId = req.params.subjectId;
    const analyses = readJsonl("analyses").filter(a => a.subjectId === subjectId);
    const byDay = {};
    for (const a of analyses) {
        const day = String(a.createdAt || "").slice(0, 10) || "unknown";
        if (!byDay[day])
            byDay[day] = { day, sum: 0, count: 0 };
        byDay[day].sum += (a.riskScore || 0);
        byDay[day].count += 1;
    }
    const days = Object.values(byDay).sort((x, y) => x.day.localeCompare(y.day)).map(d => ({
        day: d.day,
        avgRisk: d.count ? Math.round(d.sum / d.count) : 0,
        count: d.count
    }));
    const overallAvg = days.length ? Math.round(days.reduce((s, d) => s + d.avgRisk, 0) / days.length) : 0;
    res.json({ subjectId, overallAvgRisk: overallAvg, days, totalAnalyses: analyses.length });
});
