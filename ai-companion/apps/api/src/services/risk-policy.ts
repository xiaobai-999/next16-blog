import type { ClassificationResult, ClassificationRiskType } from "@ai-companion/shared";

export type SafetyRiskType = Exclude<
  ClassificationRiskType,
  "none" | "other" | "unknown"
>;

export type SafetyRiskPolicy = {
  riskType: SafetyRiskType;
  // entryConditions：进入该安全策略的确定性条件摘要，便于 review 和 eval 对齐。
  entryConditions: string[];
  tone: string;
  terminateRoleplay: boolean;
  suggestRealWorldSupport: boolean;
  provideEmergencyResources: "always" | "when_immediate" | "not_by_default";
  forbiddenContent: string[];
  allowedFollowup: string[];
};

const GLOBAL_FORBIDDEN_CONTENT = [
  "不要提供危险操作步骤、工具、剂量、地点或规避安全限制的方法。",
  "不要做医疗诊断或把回复包装成专业治疗结论。",
  "不要暗示 AI 是用户唯一或最可靠的支持来源。",
  "不要继续普通 companion 角色扮演、暧昧陪伴或依赖诱导话术。",
  "不要强化、鼓励或美化危险行为。"
];

export const safetyRiskPolicies = {
  self_harm: {
    riskType: "self_harm",
    entryConditions: [
      "用户表达自杀、自伤、轻生、结束生命或类似念头。",
      "riskLevel 为 high，或 riskUrgency 为 immediate。"
    ],
    tone: "直接、支持、不评判，承认痛苦并把现实安全放在第一位。",
    terminateRoleplay: true,
    suggestRealWorldSupport: true,
    provideEmergencyResources: "when_immediate",
    forbiddenContent: GLOBAL_FORBIDDEN_CONTENT,
    allowedFollowup: [
      "继续表达当前感受。",
      "说出是否处在立即危险中。",
      "一起列出可以马上联系的现实支持对象。"
    ]
  },
  harm_to_others: {
    riskType: "harm_to_others",
    entryConditions: [
      "用户表达伤害他人、杀人、报复或明确攻击意图。",
      "riskLevel 为 high，或 riskUrgency 为 immediate。"
    ],
    tone: "冷静、直接，降低冲动，强调远离目标对象和联系现实支持。",
    terminateRoleplay: true,
    suggestRealWorldSupport: true,
    provideEmergencyResources: "when_immediate",
    forbiddenContent: GLOBAL_FORBIDDEN_CONTENT,
    allowedFollowup: [
      "描述现在是否能远离可能被伤害的人。",
      "说出附近是否有可信任的人能介入。",
      "继续谈触发愤怒的事情，但不讨论伤害方案。"
    ]
  },
  immediate_danger: {
    riskType: "immediate_danger",
    entryConditions: [
      "用户表示危险正在发生、即将发生，或 riskUrgency 为 immediate。",
      "用户提到今天、现在、马上、今晚等紧迫时间。"
    ],
    tone: "简短、明确、行动导向，优先现实世界的即时安全。",
    terminateRoleplay: true,
    suggestRealWorldSupport: true,
    provideEmergencyResources: "always",
    forbiddenContent: GLOBAL_FORBIDDEN_CONTENT,
    allowedFollowup: [
      "确认是否能立刻联系当地紧急服务。",
      "确认是否能移动到有人在场的安全位置。",
      "只讨论降低即时危险的下一步。"
    ]
  },
  abuse: {
    riskType: "abuse",
    entryConditions: [
      "用户表达家暴、虐待、威胁、控制或被迫害处境。",
      "riskLevel 为 medium 或 high。"
    ],
    tone: "支持、不责备，尊重用户节奏，强调安全计划和可信任支持。",
    terminateRoleplay: true,
    suggestRealWorldSupport: true,
    provideEmergencyResources: "when_immediate",
    forbiddenContent: GLOBAL_FORBIDDEN_CONTENT,
    allowedFollowup: [
      "继续描述是否安全。",
      "讨论可以联系的可信任对象或本地支持机构。",
      "规划不激化风险的下一步。"
    ]
  },
  minor_safety: {
    riskType: "minor_safety",
    entryConditions: [
      "用户表达未成年人相关安全风险、诱导、私下约见、裸照或伤害风险。",
      "riskLevel 为 medium 或 high。"
    ],
    tone: "清晰、保护性、不过度追问细节，优先让可信任成年人介入。",
    terminateRoleplay: true,
    suggestRealWorldSupport: true,
    provideEmergencyResources: "when_immediate",
    forbiddenContent: GLOBAL_FORBIDDEN_CONTENT,
    allowedFollowup: [
      "确认是否有可信任成年人可以马上知道这件事。",
      "讨论如何停止危险互动并保留证据。",
      "继续表达担心，但不交换敏感细节。"
    ]
  }
} satisfies Record<SafetyRiskType, SafetyRiskPolicy>;

export function requiresSafetyResponse(classification: ClassificationResult) {
  if (classification.riskLevel === "high" || classification.riskUrgency === "immediate") {
    return true;
  }

  // abuse 和 minor_safety 通常不是普通聊天问题，即使是 medium 也应进入安全模板。
  return (
    classification.riskLevel === "medium" &&
    (classification.riskType === "abuse" || classification.riskType === "minor_safety")
  );
}

export function normalizeSafetyRiskType(classification: ClassificationResult): SafetyRiskType {
  if (
    classification.riskType === "self_harm" ||
    classification.riskType === "harm_to_others" ||
    classification.riskType === "immediate_danger" ||
    classification.riskType === "abuse" ||
    classification.riskType === "minor_safety"
  ) {
    return classification.riskType;
  }

  if (classification.riskUrgency === "immediate") {
    return "immediate_danger";
  }

  // unknown/other 的 immediate 高风险保守归入 immediate_danger；已知风险类型不被 urgency 覆盖。
  return classification.riskLevel === "high" ? "immediate_danger" : "minor_safety";
}

export function getSafetyRiskPolicy(classification: ClassificationResult) {
  return safetyRiskPolicies[normalizeSafetyRiskType(classification)];
}
