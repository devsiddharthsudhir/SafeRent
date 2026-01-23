import fs from "node:fs";
import path from "node:path";
const dataDir = path.resolve(process.cwd(), "data");
const analysisDir = path.join(dataDir, "analysis");
function ensureDir() {
    if (!fs.existsSync(analysisDir))
        fs.mkdirSync(analysisDir, { recursive: true });
}
function filePath(analysisId) {
    return path.join(analysisDir, `${analysisId}.json`);
}
export function writeAnalysis(analysisId, obj) {
    ensureDir();
    fs.writeFileSync(filePath(analysisId), JSON.stringify(obj, null, 2), "utf-8");
}
export function readAnalysis(analysisId) {
    try {
        const p = filePath(analysisId);
        if (!fs.existsSync(p))
            return null;
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return null;
    }
}
export function listAnalyses() {
    try {
        ensureDir();
        return fs
            .readdirSync(analysisDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(/\.json$/, ""));
    }
    catch {
        return [];
    }
}
