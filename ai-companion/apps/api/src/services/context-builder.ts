import { buildSystemPrompt } from "@ai-companion/prompts";
import { listCompanions } from "./companions";
import { listPromptMemories } from "./memories";
import { ServiceError } from "./service-error";

/**
 * 构建注入 system prompt 的长期记忆区块。
 */
function buildMemoryPromptBlock(memories: Awaited<ReturnType<typeof listPromptMemories>>) {
  if (memories.length === 0) {
    return "";
  }

  // lines：按类型标记的长期记忆列表，方便模型区分偏好、资料和近期事件。
  const lines = memories.map((memory) => `- [${memory.type}] ${memory.content}`);

  return ["以下是用户允许系统长期记住的信息：", ...lines].join("\n");
}

/**
 * 构建聊天上下文。
 *
 * 包含当前伴侣配置生成的 system prompt，以及按重要性排序的长期记忆。
 */
export async function buildChatContext(db: D1Database, userId: string) {
  const [companion] = await listCompanions(db, userId);

  if (!companion) {
    throw new ServiceError("COMPANION_REQUIRED", "请先创建伴侣");
  }

  // memories：只取 active、未归档、未删除、未过期的高价值记忆，不做向量检索。
  const memories = await listPromptMemories(db, userId, companion.id);
  // memoryPromptBlock：独立的长期记忆 prompt 区块，空列表时不注入。
  const memoryPromptBlock = buildMemoryPromptBlock(memories);
  // personaPrompt：伴侣基础人设 prompt，由用户配置生成。
  const personaPrompt = buildSystemPrompt({
    name: companion.name,
    persona: companion.persona,
    tone: companion.tone,
    relationship: companion.relationship,
    boundaries: companion.boundaries
  });

  return {
    companion,
    memories,
    systemPrompt: [personaPrompt, memoryPromptBlock].filter(Boolean).join("\n\n")
  };
}
