import type { ClassificationResult } from "@ai-companion/shared";
import {
  type ResponseStrategy,
  type ResponseStrategyPriority,
  type StrategySelection,
  strategyByIntent
} from "./response-strategy";
import { getSafetyRiskPolicy, requiresSafetyResponse } from "./risk-policy";

const LOW_CONFIDENCE_THRESHOLD = 0.45;

function buildSelection(input: {
  classification: ClassificationResult;
  strategy: ResponseStrategy;
  priority: ResponseStrategyPriority;
  reasonCode: string;
  reasonDetail: string;
  safetyOverridesPersona?: boolean;
  pendingConfirmation?: boolean;
}): StrategySelection {
  const safetyPolicy =
    input.strategy === "safety_response" ? getSafetyRiskPolicy(input.classification) : null;

  return {
    strategy: input.strategy,
    priority: input.priority,
    reason: {
      code: input.reasonCode,
      detail: input.reasonDetail
    },
    intent: input.classification.intent,
    confidence: input.classification.intentConfidence,
    riskLevel: input.classification.riskLevel,
    riskType: input.classification.riskType,
    riskUrgency: input.classification.riskUrgency,
    selectedSafetyRiskType: safetyPolicy?.riskType,
    emergencyResourcePolicy: safetyPolicy?.provideEmergencyResources,
    safetyOverridesPersona: input.safetyOverridesPersona ?? false,
    pendingConfirmation: input.pendingConfirmation ?? false
  };
}

export function selectResponseStrategy(input: {
  classification: ClassificationResult;
  currentInput: string;
  pendingConfirmationHandled?: boolean;
}) {
  const { classification } = input;

  if (requiresSafetyResponse(classification)) {
    return buildSelection({
      classification,
      strategy: "safety_response",
      priority: "high_risk",
      reasonCode: "risk_policy_override",
      reasonDetail: "riskLevel/riskUrgency/riskType requires independent safety response",
      safetyOverridesPersona: true
    });
  }

  if (classification.intent === "memory_correction") {
    return buildSelection({
      classification,
      strategy: "memory_correction",
      priority: "memory_or_confirmation",
      reasonCode: "memory_correction_intent",
      reasonDetail: "user correction must reuse existing memory correction and confirmation flow"
    });
  }

  if (input.pendingConfirmationHandled === true) {
    return buildSelection({
      classification,
      strategy: "memory_update",
      priority: "memory_or_confirmation",
      reasonCode: "pending_confirmation_handled",
      reasonDetail: "current input completed an existing pending memory confirmation through V1 API",
      pendingConfirmation: true
    });
  }

  if (classification.intent === "companion_setting") {
    return buildSelection({
      classification,
      strategy: "companion_adjustment",
      priority: "companion_boundary_or_setting",
      reasonCode: "companion_setting_intent",
      reasonDetail: "companion style or boundary changes are handled before ordinary support"
    });
  }

  if (classification.intent === "emotional_support") {
    return buildSelection({
      classification,
      strategy: "reflective_listening",
      priority: "emotional_support",
      reasonCode: "emotional_support_intent",
      reasonDetail: "emotional expression should receive reflective listening before advice"
    });
  }

  if (classification.intentConfidence < LOW_CONFIDENCE_THRESHOLD) {
    return buildSelection({
      classification,
      strategy: "clarification",
      priority: "unknown_fallback",
      reasonCode: "low_confidence_clarification",
      reasonDetail: "intent confidence is below the conservative clarification threshold"
    });
  }

  if (classification.intent === "risk_signal") {
    return buildSelection({
      classification,
      strategy: "clarification",
      priority: "unknown_fallback",
      reasonCode: "non_high_risk_signal_clarification",
      reasonDetail: "risk signal did not meet safety route threshold, so ask a light clarification"
    });
  }

  const strategy = strategyByIntent[classification.intent];

  return buildSelection({
    classification,
    strategy,
    priority:
      strategy === "clarification" ? "unknown_fallback" : "advice_knowledge_or_chat",
    reasonCode: `${classification.intent}_mapping`,
    reasonDetail: "deterministic classification-to-strategy mapping"
  });
}
