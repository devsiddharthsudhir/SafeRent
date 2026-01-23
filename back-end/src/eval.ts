import { runEvaluation, writeEvaluationArtifacts } from "./lib/evaluation.js";

const { report } = runEvaluation();

console.log("\nRentPulse evaluation report");
console.log("generatedAt:", report.generatedAt);
console.log("examplesUsed:", report.examplesUsed);
console.log("labelCounts:", report.labelCounts);
console.log("multiclass strict accuracy:", report.multiclass.accuracyStrict);
console.log("binary thresholds:");
for (const m of report.binary.metricsByThreshold) {
  console.log(`  t=${m.threshold.toFixed(2)}  precision=${m.precision}  recall=${m.recall}  f1=${m.f1}  acc=${m.accuracy}`);
}
if (report.binary.bestF1) {
  console.log("bestF1:", report.binary.bestF1);
}

const { reportPath, csvPath } = writeEvaluationArtifacts();
console.log("\nArtifacts written:");
console.log("-", reportPath);
console.log("-", csvPath);
