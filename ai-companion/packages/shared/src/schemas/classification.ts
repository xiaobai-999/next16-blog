import { z } from "zod";

export const classificationIntents = [
  "casual_chat",
  "emotional_support",
  "advice_request",
  "memory_update",
  "memory_correction",
  "companion_setting",
  "knowledge_question",
  "risk_signal",
  "unknown"
] as const;

export const classificationEmotions = [
  "neutral",
  "happy",
  "sad",
  "anxious",
  "angry",
  "lonely",
  "stressed",
  "mixed",
  "unknown"
] as const;

export const classificationRiskLevels = ["none", "low", "medium", "high"] as const;

export const classificationRiskTypes = [
  "none",
  "self_harm",
  "harm_to_others",
  "immediate_danger",
  "abuse",
  "minor_safety",
  "other",
  "unknown"
] as const;

export const classificationRiskUrgencies = [
  "none",
  "non_immediate",
  "immediate",
  "unknown"
] as const;

export const classificationSchema = z.object({
  intent: z.enum(classificationIntents),
  intentConfidence: z.number().min(0).max(1),
  emotion: z.enum(classificationEmotions),
  emotionConfidence: z.number().min(0).max(1),
  riskLevel: z.enum(classificationRiskLevels),
  riskType: z.enum(classificationRiskTypes),
  riskUrgency: z.enum(classificationRiskUrgencies),
  riskSignals: z.array(z.string().min(1).max(120)).max(5),
  reasonCode: z.string().min(1).max(80)
});

export type ClassificationIntent = (typeof classificationIntents)[number];
export type ClassificationEmotion = (typeof classificationEmotions)[number];
export type ClassificationRiskLevel = (typeof classificationRiskLevels)[number];
export type ClassificationRiskType = (typeof classificationRiskTypes)[number];
export type ClassificationRiskUrgency = (typeof classificationRiskUrgencies)[number];
export type ClassificationResult = z.infer<typeof classificationSchema>;

export const defaultClassificationResult = {
  intent: "unknown",
  intentConfidence: 0,
  emotion: "neutral",
  emotionConfidence: 0,
  riskLevel: "medium",
  riskType: "unknown",
  riskUrgency: "unknown",
  riskSignals: ["classification_fallback"],
  reasonCode: "fallback_risk_review"
} satisfies ClassificationResult;
