import { runEnrichment } from "./enrichAnalysis.js";

const running = new Set<string>();

export function isEnriching(analysisId: string) {
  return running.has(analysisId);
}

export function queueEnrichment(analysisId: string) {
  if (running.has(analysisId)) return;
  running.add(analysisId);
  setImmediate(async () => {
    try {
      await runEnrichment(analysisId);
    } finally {
      running.delete(analysisId);
    }
  });
}