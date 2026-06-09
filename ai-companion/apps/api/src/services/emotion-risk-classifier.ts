import {
  type ClassificationResult,
  type RiskPrecheckResult,
  classificationSchema,
  defaultClassificationResult,
  detectRiskPrecheck,
  uniqueSignals
} from "@ai-companion/shared";

export { detectRiskPrecheck };

export function applyConfidenceFallbacks(classification: ClassificationResult): ClassificationResult {
  return classificationSchema.parse({
    ...classification,
    intent:
      classification.intentConfidence < 0.45 && classification.intent !== "risk_signal"
        ? "unknown"
        : classification.intent,
    emotion: classification.emotionConfidence < 0.4 ? "neutral" : classification.emotion,
    reasonCode:
      classification.intentConfidence < 0.45 || classification.emotionConfidence < 0.4
        ? `low_conf_${classification.reasonCode}`.slice(0, 80)
        : classification.reasonCode
  });
}

export function applyRiskPrecheckOverride(
  classification: ClassificationResult,
  precheck: RiskPrecheckResult
): ClassificationResult {
  if (!precheck.matched) {
    return classification;
  }

  const riskLevel =
    precheck.riskLevel === "high" || classification.riskLevel === "high"
      ? "high"
      : precheck.riskLevel === "medium" || classification.riskLevel === "medium"
        ? "medium"
        : classification.riskLevel;

  return classificationSchema.parse({
    ...classification,
    intent: riskLevel === "high" || classification.intent === "risk_signal" ? "risk_signal" : classification.intent,
    intentConfidence:
      riskLevel === "high" ? Math.max(classification.intentConfidence, 0.9) : classification.intentConfidence,
    riskLevel,
    riskType:
      classification.riskType === "none" || precheck.riskLevel === "high"
        ? precheck.riskType
        : classification.riskType,
    riskUrgency:
      precheck.riskUrgency === "immediate" || classification.riskUrgency === "immediate"
        ? "immediate"
        : classification.riskUrgency === "none"
          ? precheck.riskUrgency
          : classification.riskUrgency,
    riskSignals: uniqueSignals([...classification.riskSignals, ...precheck.signals]),
    reasonCode:
      riskLevel === "high"
        ? "precheck_high_risk"
        : `precheck_${classification.reasonCode}`.slice(0, 80)
  });
}

export function buildClassificationFallback(precheck: RiskPrecheckResult): ClassificationResult {
  if (!precheck.matched) {
    return defaultClassificationResult;
  }

  return classificationSchema.parse({
    ...defaultClassificationResult,
    intent: "risk_signal",
    intentConfidence: precheck.riskLevel === "high" ? 0.9 : 0.7,
    riskLevel: precheck.riskLevel,
    riskType: precheck.riskType,
    riskUrgency: precheck.riskUrgency,
    riskSignals: precheck.signals,
    reasonCode: precheck.riskLevel === "high" ? "fallback_precheck_high" : "fallback_precheck_review"
  });
}
