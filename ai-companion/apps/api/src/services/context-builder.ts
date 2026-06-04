import { buildMemoryUsagePrompt, buildSystemPrompt } from "@ai-companion/prompts";
import type { AppEnv } from "../env";
import { listCompanions } from "./companions";
import { listPromptMemories } from "./memories";
import { retrieveRelevantMemories } from "./memory-retriever";
import { ServiceError } from "./service-error";

/**
 * 构建注入 system prompt 的长期记忆区块。
 */
function buildMemoryPromptBlock(memories: Awaited<ReturnType<typeof listPromptMemories>>) {
  return buildMemoryUsagePrompt(
    memories.map((memory) => ({
      type: memory.type,
      content: memory.content
    }))
  );
}

/**
 * 构建聊天上下文。
 *
 * 包含当前伴侣配置生成的 system prompt，以及按重要性排序的长期记忆。
 */
export async function buildChatContext(
  env: AppEnv["Bindings"],
  userId: string,
  latestUserInput: string
) {
  // db：当前 Worker 的 D1 绑定，仍是记忆和伴侣配置的事实源。
  const { DB: db } = env;
  const [companion] = await listCompanions(db, userId);

  if (!companion) {
    throw new ServiceError("COMPANION_REQUIRED", "请先创建伴侣");
  }

  // memories：优先按当前用户输入语义召回；召回失败或无结果时回退到固定排序。
  const semanticMemories = await retrieveRelevantMemories(db, env, {
    userId,
    companionId: companion.id,
    query: latestUserInput
  }).catch((error) => {
    console.error("Semantic memory retrieval failed, fallback to prompt memories", {
      userId,
      companionId: companion.id,
      error
    });

    return [];
  });
  const memories =
    semanticMemories.length > 0
      ? semanticMemories
      : await listPromptMemories(db, userId, companion.id);
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
