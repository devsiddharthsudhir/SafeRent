import express from "express";
import multer from "multer";
import { extractLeaseTextFromUpload, simplifyLeaseText } from "../services/lease/simplifyLease.js";
import { maybeEnhanceLeaseWithLLM } from "../services/lease/llmEnhance.js";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
export const leaseRouter = express.Router();
// Upload a lease (PDF/text) and get a layman summary + predatory clause flags
leaseRouter.post("/lease/simplify", upload.single("lease"), async (req, res) => {
    try {
        const f = req.file || null;
        if (!f)
            return res.status(400).json({ error: "Missing file: field name must be 'lease'" });
        const provinceHint = String(req.body?.province || "").trim();
        const { text, warnings } = await extractLeaseTextFromUpload({
            buffer: f.buffer,
            originalname: f.originalname,
            mimetype: f.mimetype,
        });
        let result = simplifyLeaseText(text, provinceHint);
        result.warnings = [...new Set([...(result.warnings || []), ...warnings])];
        result = await maybeEnhanceLeaseWithLLM(result, text);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: "Lease simplify failed", detail: e?.message || String(e) });
    }
});
// Paste lease text directly
leaseRouter.post("/lease/simplify-text", express.json({ limit: "3mb" }), async (req, res) => {
    try {
        const text = String(req.body?.text || "");
        const provinceHint = String(req.body?.province || "").trim();
        if (!text.trim())
            return res.status(400).json({ error: "Missing 'text'" });
        let result = simplifyLeaseText(text, provinceHint);
        result = await maybeEnhanceLeaseWithLLM(result, text);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: "Lease simplify failed", detail: e?.message || String(e) });
    }
});
