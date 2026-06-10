import type {
  ClassificationEmotion,
  ClassificationIntent,
  ClassificationResult,
  ClassificationRiskLevel,
  ClassificationRiskType,
  ClassificationRiskUrgency,
  Memory,
  Message
} from "@ai-companion/shared";
import type { ResponseStrategy } from "../services/response-strategy";

export type AgentTraceStatus = "ok" | "error" | "degraded";

export type AgentMessage = Pick<Message, "id" | "role" | "content" | "createdAt">;

export type RetrievedMemory = {
  // memory：召回后允许进入 Agent 状态的长期记忆，不包含 embedding 或完整检索请求。
  memory: Memory;
  // score：召回排序分数或相似度，用于后续策略节点判断使用强度。
  score?: number;
  // reason：可选召回原因，只保存简短摘要。
  reason?: string;
};

export type IntentResult = {
  label: ClassificationIntent;
  confidence: number;
};

export type EmotionResult = {
  label: ClassificationEmotion;
  confidence: number;
};

export type RiskResult = {
  level: ClassificationRiskLevel;
  type: ClassificationRiskType;
  urgency: ClassificationRiskUrgency;
  signals: string[];
};

export type PendingAction = {
  // type：等待用户确认或后续恢复的动作类型。
  type: "memory_confirmation" | "tool_confirmation";
  // payload：只允许保存可展示给用户的脱敏确认数据。
  payload: Record<string, unknown>;
};

export type AgentNodeError = {
  // nodeName：出错节点名，用于 trace 和后续降级策略定位。
  nodeName: string;
  // code：稳定错误码，避免在状态里依赖完整异常对象。
  code: string;
  // message：脱敏后的错误摘要。
  message: string;
  // createdAt：错误写入状态的时间。
  createdAt: string;
};

export type AgentState = {
  messages: AgentMessage[];
  currentInput: string;
  classification?: ClassificationResult;
  intent?: IntentResult;
  emotion?: EmotionResult;
  risk?: RiskResult;
  retrievedMemories: RetrievedMemory[];
  responseStrategy?: ResponseStrategy;
  assistantDraft?: string;
  assistantMessageId?: string;
  pendingAction?: PendingAction;
  errors: AgentNodeError[];
};

/**
 * 创建一轮 Agent 执行的初始状态。
 *
 * State 只保存会随图流转的数据，不保存 service、密钥、数据库连接或模型客户端。
 */
export function createInitialAgentState(input: { currentInput: string; messages?: AgentMessage[] }): AgentState {
  return {
    messages: input.messages ?? [],
    currentInput: input.currentInput,
    retrievedMemories: [],
    errors: []
  } satisfies AgentState;
}
