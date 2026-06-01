import type { CandidateMemory, MemoryStatus } from "@ai-companion/shared";

type MemorySaveDecision = {
  action: "save";
  status: Extract<MemoryStatus, "active" | "pending_confirmation">;
  confirmationReason?: string;
};

type MemorySkipDecision = {
  action: "skip";
  reason: string;
};

export type MemoryWriteDecision = MemorySaveDecision | MemorySkipDecision;

const SENSITIVE_PATTERNS = [
  /身份证/,
  /手机号|电话/,
  /住址|地址/,
  /银行卡|信用卡|账户|账号/,
  /病历|诊断|处方|医保/,
  /收入|存款|负债|贷款/,
  /\b\d{11}\b/,
  /\b\d{15,18}\b/
];

const MODEL_INFERENCE_PATTERNS = [
  /可能/,
  /也许/,
  /似乎/,
  /看起来/,
  /推测/,
  /猜测/,
  /应该是/,
  /可能是/
];

const SMALL_TALK_PATTERNS = [/今天天气/, /哈哈/, /随便聊/, /开玩笑/, /无所谓/];

/**
 * 判断候选记忆是否包含敏感隐私。
 *
 * 这是模型提取规则之外的服务端兜底，避免身份证、联系方式、财务和医疗信息入库。
 */
function isSensitiveMemory(memory: CandidateMemory) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(memory.content));
}

/**
 * 判断候选记忆是否更像模型推断，而不是用户明确表达。
 */
function isModelInference(memory: CandidateMemory) {
  const text = [memory.content, memory.reason ?? ""].join("\n");

  return MODEL_INFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 判断候选记忆是否像一次性闲聊。
 */
function isSmallTalk(memory: CandidateMemory) {
  return SMALL_TALK_PATTERNS.some((pattern) => pattern.test(memory.content));
}

/**
 * 对单条候选记忆做写入策略判断。
 *
 * memory-extractor 只提供候选事实；这里统一决定跳过、直接生效或等待用户确认。
 */
export function decideMemoryWrite(memory: CandidateMemory): MemoryWriteDecision {
  if (isSensitiveMemory(memory)) {
    return { action: "skip", reason: "候选记忆包含敏感隐私" };
  }

  if (isModelInference(memory)) {
    return { action: "skip", reason: "候选记忆像模型推断，不保存" };
  }

  if (isSmallTalk(memory)) {
    return { action: "skip", reason: "候选记忆像一次性闲聊" };
  }

  if (memory.confidence < 0.35) {
    return { action: "skip", reason: "候选记忆置信度过低" };
  }

  if (memory.type === "relationship") {
    return {
      action: "save",
      status: "pending_confirmation",
      confirmationReason: "关系类记忆需要你确认后再长期使用"
    };
  }

  if (memory.type === "boundary") {
    return {
      action: "save",
      status: "pending_confirmation",
      confirmationReason: "边界类记忆需要你确认后再长期使用"
    };
  }

  if (memory.type === "profile" && memory.importance >= 4) {
    return {
      action: "save",
      status: "pending_confirmation",
      confirmationReason: "高重要性的个人资料需要你确认"
    };
  }

  if (memory.confidence < 0.6) {
    return {
      action: "save",
      status: "pending_confirmation",
      confirmationReason: "候选记忆置信度偏低，需要你确认"
    };
  }

  return {
    action: "save",
    status: "active"
  };
}
