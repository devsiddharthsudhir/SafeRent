import { runEnrichment } from "./enrichAnalysis.js";
const running = new Set();
export function isEnriching(analysisId) {
    return running.has(analysisId);
}
export function queueEnrichment(analysisId) {
    if (running.has(analysisId))
        return;
    running.add(analysisId);
    setImmediate(async () => {
        try {
            await runEnrichment(analysisId);
        }
        finally {
            running.delete(analysisId);
        }
    });
}
