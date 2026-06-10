import type {
  ClassificationIntent,
  ClassificationRiskType,
  ClassificationRiskUrgency
} from "@ai-companion/shared";
import type { SafetyRiskType } from "./risk-policy";

export const responseStrategies = [
  "companionship",
  "reflective_listening",
  "concrete_advice",
  "clarification",
  "memory_update",
  "memory_correction",
  "companion_adjustment",
  "knowledge_answer",
  "safety_response"
] as const;

export type ResponseStrategy = (typeof responseStrategies)[number];

export type ResponseStrategyPriority =
  | "high_risk"
  | "memory_or_confirmation"
  | "companion_boundary_or_setting"
  | "emotional_support"
  | "advice_knowledge_or_chat"
  | "unknown_fallback";

export type StrategySelectionReason = {
  // code：稳定原因码，用于 trace 和 eval 断言，不依赖自然语言文案。
  code: string;
  // detail：面向排查的简短说明，不能包含完整用户输入。
  detail: string;
};

export type StrategySelection = {
  strategy: ResponseStrategy;
  priority: ResponseStrategyPriority;
  reason: StrategySelectionReason;
  intent: ClassificationIntent;
  confidence: number;
  riskLevel: "none" | "low" | "medium" | "high";
  riskType: ClassificationRiskType;
  riskUrgency: ClassificationRiskUrgency;
  selectedSafetyRiskType?: SafetyRiskType;
  emergencyResourcePolicy?: "always" | "when_immediate" | "not_by_default";
  safetyOverridesPersona: boolean;
  pendingConfirmation: boolean;
};

export const strategyByIntent = {
  casual_chat: "companionship",
  emotional_support: "reflective_listening",
  advice_request: "concrete_advice",
  memory_update: "memory_update",
  memory_correction: "memory_correction",
  companion_setting: "companion_adjustment",
  knowledge_question: "knowledge_answer",
  risk_signal: "clarification",
  unknown: "clarification"
} satisfies Record<ClassificationIntent, ResponseStrategy>;

export function summarizeStrategySelection(selection: StrategySelection) {
  return [
    `strategy=${selection.strategy}`,
    `priority=${selection.priority}`,
    `reason=${selection.reason.code}`,
    `intent=${selection.intent}`,
    `confidence=${selection.confidence.toFixed(2)}`,
    `riskLevel=${selection.riskLevel}`,
    `riskType=${selection.riskType}`,
    `riskUrgency=${selection.riskUrgency}`,
    `selectedSafetyRiskType=${selection.selectedSafetyRiskType ?? "none"}`,
    `emergencyResourcePolicy=${selection.emergencyResourcePolicy ?? "none"}`,
    `safetyOverridesPersona=${selection.safetyOverridesPersona ? "true" : "false"}`,
    `pendingConfirmation=${selection.pendingConfirmation ? "true" : "false"}`
  ].join(";");
}
