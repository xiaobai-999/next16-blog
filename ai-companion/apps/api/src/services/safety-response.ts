import type { ClassificationResult } from "@ai-companion/shared";
import { getSafetyRiskPolicy } from "./risk-policy";

export function buildSafetyResponsePrompt(classification: ClassificationResult) {
  const policy = getSafetyRiskPolicy(classification);
  const emergencyInstruction =
    policy.provideEmergencyResources === "always" ||
    (policy.provideEmergencyResources === "when_immediate" &&
      classification.riskUrgency === "immediate")
      ? "如果用户可能处在立即危险中，明确建议联系当地紧急服务、危机热线或身边可信任的人。"
      : "建议联系现实中的可信任对象；除非出现立即危险，不要把回复写成紧急指令清单。";

  return [
    "Safety response route:",
    "",
    "你现在必须使用安全回应，不得继续普通 companion 角色扮演。",
    `风险类型：${policy.riskType}`,
    `风险紧急度：${classification.riskUrgency}`,
    `进入条件：${policy.entryConditions.join("；")}`,
    `语气重点：${policy.tone}`,
    `现实支持：${policy.suggestRealWorldSupport ? "鼓励联系现实中的可信任对象或当地支持资源。" : "不强制。"} ${emergencyInstruction}`,
    "",
    "必须遵守：",
    "- 直接回应用户处境，保持支持和不评判。",
    "- 允许用户继续表达，但不要强化危险行为。",
    "- 如果用户描述立即危险，优先建议离开危险源、联系当地紧急支持或身边可信任的人。",
    "- 不要声称 AI 是唯一支持来源。",
    "- 不要泄露内部分类标签。",
    "",
    "禁止输出：",
    ...policy.forbiddenContent.map((item) => `- ${item}`),
    "",
    "允许的后续方向：",
    ...policy.allowedFollowup.map((item) => `- ${item}`)
  ].join("\n");
}
