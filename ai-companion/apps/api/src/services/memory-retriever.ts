import type { Memory } from "@ai-companion/shared";
import type { AppEnv } from "../env";
import { embedQuery } from "./memory-embeddings";
import { queryMemoryVectors, type MemoryVectorMatch } from "./memory-vector-store";

type RetrievedMemory = {
  // memory：从 D1 回查并过滤后的事实源记忆。
  memory: Memory;
  // similarity：向量召回相似度。
  similarity: number;
};

type MemoryRow = {
  id: string;
  user_id: string;
  companion_id: string;
  type: Memory["type"];
  content: string;
  importance: number;
  source: Memory["source"];
  source_message_id: string | null;
  status: Memory["status"];
  confidence: number;
  source_conversation_id: string | null;
  expires_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  conflict_with_memory_id: string | null;
  confirmation_reason: string | null;
  created_at: string;
  updated_at: string;
};

const MEMORY_SELECT_COLUMNS = [
  "id",
  "user_id",
  "companion_id",
  "type",
  "content",
  "importance",
  "source",
  "source_message_id",
  "status",
  "confidence",
  "source_conversation_id",
  "expires_at",
  "archived_at",
  "deleted_at",
  "conflict_with_memory_id",
  "confirmation_reason",
  "created_at",
  "updated_at"
].join(", ");

/**
 * 将 D1 记忆行转换成共享 Memory 类型。
 */
function mapMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    companionId: row.companion_id,
    type: row.type,
    content: row.content,
    importance: row.importance,
    source: row.source,
    sourceMessageId: row.source_message_id,
    status: row.status,
    confidence: row.confidence,
    sourceConversationId: row.source_conversation_id,
    expiresAt: row.expires_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    conflictWithMemoryId: row.conflict_with_memory_id,
    confirmationReason: row.confirmation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 根据更新时间计算新鲜度得分。
 */
function recencyScore(updatedAt: string, now = Date.now()) {
  // ageDays：距离更新时间的天数。
  const ageDays = (now - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000);

  if (Number.isNaN(ageDays) || ageDays <= 7) {
    return 1;
  }

  if (ageDays <= 30) {
    return 0.7;
  }

  if (ageDays <= 90) {
    return 0.4;
  }

  return 0.2;
}

/**
 * 综合语义相似度、重要性、置信度和新鲜度重排召回结果。
 */
export function rankRetrievedMemories(results: RetrievedMemory[]) {
  return [...results].sort((left, right) => {
    const leftScore =
      left.similarity * 0.55 +
      (left.memory.importance / 5) * 0.2 +
      left.memory.confidence * 0.15 +
      recencyScore(left.memory.updatedAt) * 0.1;
    const rightScore =
      right.similarity * 0.55 +
      (right.memory.importance / 5) * 0.2 +
      right.memory.confidence * 0.15 +
      recencyScore(right.memory.updatedAt) * 0.1;

    return rightScore - leftScore;
  });
}

/**
 * 按向量匹配结果回查 D1，并再次过滤权限和状态。
 */
async function fetchMatchedMemories(
  db: D1Database,
  userId: string,
  companionId: string,
  matches: MemoryVectorMatch[]
) {
  if (matches.length === 0) {
    return [];
  }

  // memoryIds：向量库返回的记忆 ID 列表，必须回查 D1。
  const memoryIds = [...new Set(matches.map((match) => match.memoryId))];
  // placeholders：D1 IN 查询占位符。
  const placeholders = memoryIds.map(() => "?").join(", ");
  // similarityById：memoryId 到相似度的映射，用于重排。
  const similarityById = new Map(matches.map((match) => [match.memoryId, match.similarity]));
  const result = await db
    .prepare(
      `SELECT ${MEMORY_SELECT_COLUMNS}
       FROM memories
       WHERE id IN (${placeholders})
         AND user_id = ?
         AND companion_id = ?
         AND status = 'active'
         AND deleted_at IS NULL
         AND archived_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`
    )
    .bind(...memoryIds, userId, companionId, new Date().toISOString())
    .all<MemoryRow>();

  return result.results.map((row) => ({
    memory: mapMemory(row),
    similarity: similarityById.get(row.id) ?? 0
  }));
}

/**
 * 根据当前用户输入召回相关长期记忆。
 */
export async function retrieveRelevantMemories(
  db: D1Database,
  env: AppEnv["Bindings"],
  input: {
    userId: string;
    companionId: string;
    query: string;
    limit?: number;
    topK?: number;
  }
) {
  // queryVector：当前用户输入的 embedding。
  const queryVector = await embedQuery(env, input.query);
  // matches：向量库或 D1 fallback 返回的候选记忆 ID。
  const matches = await queryMemoryVectors(db, env, {
    userId: input.userId,
    companionId: input.companionId,
    vector: queryVector,
    topK: input.topK ?? 12
  });
  // matchedMemories：从 D1 回查后的合法 active 记忆。
  const matchedMemories = await fetchMatchedMemories(db, input.userId, input.companionId, matches);

  return rankRetrievedMemories(matchedMemories)
    .slice(0, input.limit ?? 6)
    .map((result) => result.memory);
}
