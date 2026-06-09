import type { AgentMessage, AgentNodeError, AgentState, RetrievedMemory } from "./agent-state";

export type AgentStatePatch = Partial<Omit<AgentState, "messages" | "retrievedMemories" | "errors">> & {
  messages?: AgentMessage[];
  retrievedMemories?: RetrievedMemory[];
  errors?: AgentNodeError[];
};

/**
 * 为消息生成语义合并键。
 *
 * 有 id 时优先按 id 去重；没有 id 的临时消息按 role/content/createdAt 判断是否重复。
 */
function messageKey(message: AgentMessage) {
  return message.id || `${message.role}:${message.createdAt}:${message.content}`;
}

/**
 * 合并消息数组。
 *
 * 已存在的消息不会被 patch 覆盖；新消息只追加到尾部，保持聊天历史稳定。
 */
export function reduceMessages(current: AgentMessage[], incoming: AgentMessage[] = []) {
  const seenKeys = new Set(current.map(messageKey));
  const merged = [...current];

  for (const message of incoming) {
    const key = messageKey(message);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    merged.push(message);
  }

  return merged;
}

/**
 * 合并召回记忆。
 *
 * 同一个 memory.id 只保留第一次进入状态的版本，避免节点重复追加同一条长期记忆。
 */
export function reduceRetrievedMemories(
  current: RetrievedMemory[],
  incoming: RetrievedMemory[] = []
) {
  const seenIds = new Set(current.map((result) => result.memory.id));
  const merged = [...current];

  for (const result of incoming) {
    if (seenIds.has(result.memory.id)) {
      continue;
    }

    seenIds.add(result.memory.id);
    merged.push(result);
  }

  return merged;
}

/**
 * 合并节点错误。
 *
 * 错误只追加、不覆盖，用于保留一轮 Agent 执行中的完整降级轨迹。
 */
export function reduceErrors(current: AgentNodeError[], incoming: AgentNodeError[] = []) {
  return [...current, ...incoming];
}

/**
 * 合并 AgentState patch。
 *
 * 数组字段使用显式 reducer；分类结果、策略、草稿和 pendingAction 采用后写覆盖语义。
 */
export function reduceAgentState(current: AgentState, patch: AgentStatePatch): AgentState {
  return {
    ...current,
    ...patch,
    messages: reduceMessages(current.messages, patch.messages),
    retrievedMemories: reduceRetrievedMemories(current.retrievedMemories, patch.retrievedMemories),
    errors: reduceErrors(current.errors, patch.errors)
  };
}
