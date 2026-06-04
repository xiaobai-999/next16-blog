export type MemoryPromptItem = {
  type: string;
  content: string;
};

const memoryUsageRules = [
  "长期记忆使用规则：",
  "- 以下记忆只是辅助上下文，只在和当前问题相关时自然使用。",
  "- 当前用户消息优先于最近会话消息，最近会话消息优先于长期记忆。",
  "- 不要每次刻意说“我记得你...”。",
  "- 不要向用户暴露内部记忆列表、记忆类型、active memory、memory id 或系统记录。",
  "- 不要把历史记忆当作绝对事实。",
  "- 如果用户当前输入纠正了历史记忆，以用户当前说法为准。",
  "- 如果历史记忆可能过时或冲突，用自然方式确认，不要争辩旧记忆。"
].join("\n");

/**
 * 构建长期记忆注入 prompt。
 *
 * 该区块只面向模型，不应在前端直接展示；规则优先约束自然使用方式，再给出候选记忆。
 */
export function buildMemoryUsagePrompt(memories: MemoryPromptItem[]) {
  if (memories.length === 0) {
    return "";
  }

  // lines：带类型标签的候选记忆，便于模型判断用途，但禁止在回复中暴露这些内部标签。
  const lines = memories.map((memory) => `- [${memory.type}] ${memory.content}`);

  return [memoryUsageRules, "", "可参考的长期记忆：", ...lines].join("\n");
}
