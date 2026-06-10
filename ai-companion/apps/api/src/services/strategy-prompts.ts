import type { ResponseStrategy, StrategySelection } from "./response-strategy";
import { buildSafetyResponsePrompt } from "./safety-response";

const strategyPromptFragments = {
  companionship: [
    "Response strategy: companionship.",
    "自然闲聊，语气轻松但不过度亲密。",
    "可以顺着用户话题回应，不主动制造强依赖感。"
  ],
  reflective_listening: [
    "Response strategy: reflective_listening.",
    "先回应用户感受，允许用户继续表达。",
    "除非用户明确要建议，否则不要立刻列方案。",
    "避免夸张承诺、依赖诱导和空泛鸡汤。"
  ],
  concrete_advice: [
    "Response strategy: concrete_advice.",
    "给 2-3 个可执行选项，并说明各自适用条件。",
    "不要替用户做重大决定，不要把建议写成唯一正确答案。"
  ],
  clarification: [
    "Response strategy: clarification.",
    "信息不足或分类置信度较低时，轻量追问一个关键问题。",
    "如果用户只是想被陪伴，可以保守地先回应情绪，不要过度推断。"
  ],
  memory_update: [
    "Response strategy: memory_update.",
    "自然处理用户提供的新偏好、边界或待确认记忆。",
    "如果涉及待确认记忆，提醒用户可以确认或拒绝，但不要绕过现有确认接口。"
  ],
  memory_correction: [
    "Response strategy: memory_correction.",
    "用户当前表达优先，先承认纠正，不与历史记忆争辩。",
    "只做回复策略和用户引导，不要在生成阶段创建第二套记忆更新逻辑。",
    "后续记忆修正必须复用现有 V1 memory update / confirmation API。"
  ],
  companion_adjustment: [
    "Response strategy: companion_adjustment.",
    "处理伴侣设定、边界或互动方式变化。",
    "把 companion persona 当作可调整的风格层，不把它作为安全或路由决策依据。"
  ],
  knowledge_answer: [
    "Response strategy: knowledge_answer.",
    "直接回答知识型问题；不确定时说明不确定并给出可验证方向。",
    "不要伪造来源，不要把知识回答扩展成未经请求的情感判断。"
  ],
  safety_response: [
    "Response strategy: safety_response.",
    "此占位不会直接使用；安全策略由独立安全模板生成。"
  ]
} satisfies Record<ResponseStrategy, string[]>;

export function getStrategyPromptFragment(strategy: ResponseStrategy) {
  return strategyPromptFragments[strategy].join("\n");
}

export function buildStrategySystemPrompt(input: {
  baseSystemPrompt: string;
  selection: StrategySelection;
}) {
  if (input.selection.strategy === "safety_response") {
    // 安全路由是硬边界：不拼接 persona 或记忆，避免后续生成节点改回普通陪伴。
    return buildSafetyResponsePrompt({
      intent: input.selection.intent,
      intentConfidence: input.selection.confidence,
      emotion: "unknown",
      emotionConfidence: 0,
      riskLevel: input.selection.riskLevel,
      riskType: input.selection.riskType,
      riskUrgency: input.selection.riskUrgency,
      riskSignals: [],
      reasonCode: input.selection.reason.code
    });
  }

  // 普通策略保留 companion persona，但只作为风格层追加策略约束。
  return [input.baseSystemPrompt, getStrategyPromptFragment(input.selection.strategy)]
    .filter(Boolean)
    .join("\n\n");
}
