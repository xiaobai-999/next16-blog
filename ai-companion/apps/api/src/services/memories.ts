import type {
  CreateMemoryInput,
  ExtractedMemory,
  Memory,
  MemorySource
} from "@ai-companion/shared";
import { listCompanions } from "./companions";
import { ServiceError } from "./service-error";

type MemoryRow = {
  id: string;
  user_id: string;
  companion_id: string;
  type: "profile" | "preference" | "event";
  content: string;
  importance: number;
  source: MemorySource;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
};

type CreateMemoryRecordInput = {
  companionId: string;
  type: Memory["type"];
  content: string;
  importance: number;
  source: MemorySource;
  sourceMessageId?: string | null;
};

const PROMPT_MEMORY_LIMIT = 10;

/**
 * 将 D1 的 snake_case 记忆行转换成前后端共享的 Memory 类型。
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 读取当前用户的默认伴侣 ID。
 *
 * 第一版只支持一个伴侣，因此记忆也默认挂到用户当前伴侣下。
 */
async function getCurrentCompanionId(db: D1Database, userId: string) {
  // companion：当前用户默认伴侣；不存在时无法创建或读取伴侣记忆。
  const [companion] = await listCompanions(db, userId);

  if (!companion) {
    throw new ServiceError("COMPANION_REQUIRED", "请先创建伴侣");
  }

  return companion.id;
}

/**
 * 按重要性和更新时间查询当前用户的记忆列表。
 */
export async function listMemories(db: D1Database, userId: string) {
  const result = await db
    .prepare(
      `SELECT id, user_id, companion_id, type, content, importance, source, source_message_id, created_at, updated_at
       FROM memories
       WHERE user_id = ?
       ORDER BY importance DESC, updated_at DESC`
    )
    .bind(userId)
    .all<MemoryRow>();

  return result.results.map(mapMemory);
}

/**
 * 查询用于注入 prompt 的高价值记忆。
 *
 * 第一版不做向量检索，只按 importance 和 updated_at 取前 10 条。
 */
export async function listPromptMemories(
  db: D1Database,
  userId: string,
  companionId: string,
  limit = PROMPT_MEMORY_LIMIT
) {
  const result = await db
    .prepare(
      `SELECT id, user_id, companion_id, type, content, importance, source, source_message_id, created_at, updated_at
       FROM memories
       WHERE user_id = ? AND companion_id = ?
       ORDER BY importance DESC, updated_at DESC
       LIMIT ?`
    )
    .bind(userId, companionId, limit)
    .all<MemoryRow>();

  return result.results.map(mapMemory);
}

/**
 * 创建一条记忆记录。
 *
 * 同一用户和伴侣下 content 完全相同的记忆会复用旧记录，避免重复写入。
 */
export async function createMemoryRecord(
  db: D1Database,
  userId: string,
  input: CreateMemoryRecordInput
) {
  const normalizedContent = input.content.trim();

  if (!normalizedContent) {
    throw new ServiceError("BAD_REQUEST", "记忆内容不能为空");
  }

  // existing：同用户同伴侣下完全相同的记忆内容，用于第一版精确去重。
  const existing = await db
    .prepare(
      `SELECT id, user_id, companion_id, type, content, importance, source, source_message_id, created_at, updated_at
       FROM memories
       WHERE user_id = ? AND companion_id = ? AND content = ?
       LIMIT 1`
    )
    .bind(userId, input.companionId, normalizedContent)
    .first<MemoryRow>();

  if (existing) {
    return mapMemory(existing);
  }

  // now：记忆创建和更新时间，统一保存 ISO 字符串。
  const now = new Date().toISOString();
  // memory：写入数据库前构造的记忆领域对象。
  const memory = {
    id: crypto.randomUUID(),
    userId,
    companionId: input.companionId,
    type: input.type,
    content: normalizedContent,
    importance: input.importance,
    source: input.source,
    sourceMessageId: input.sourceMessageId ?? null,
    createdAt: now,
    updatedAt: now
  } satisfies Memory;

  await db
    .prepare(
      `INSERT INTO memories
        (id, user_id, companion_id, type, content, importance, source, source_message_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      memory.id,
      memory.userId,
      memory.companionId,
      memory.type,
      memory.content,
      memory.importance,
      memory.source,
      memory.sourceMessageId,
      memory.createdAt,
      memory.updatedAt
    )
    .run();

  return memory;
}

/**
 * 手动新增当前用户的记忆。
 */
export async function createManualMemory(db: D1Database, userId: string, input: CreateMemoryInput) {
  const companionId = await getCurrentCompanionId(db, userId);

  return createMemoryRecord(db, userId, {
    companionId,
    type: input.type,
    content: input.content,
    importance: input.importance,
    source: "manual"
  });
}

/**
 * 保存模型提取出的候选记忆。
 *
 * @returns 实际新增或命中的记忆列表。
 */
export async function createExtractedMemories(
  db: D1Database,
  userId: string,
  companionId: string,
  memories: ExtractedMemory[],
  sourceMessageId: string
) {
  const savedMemories: Memory[] = [];

  for (const memory of memories) {
    savedMemories.push(
      await createMemoryRecord(db, userId, {
        companionId,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        source: "extracted",
        sourceMessageId
      })
    );
  }

  return savedMemories;
}

/**
 * 删除当前用户的一条记忆。
 *
 * 删除条件同时包含 id 和 user_id，避免越权删除。
 */
export async function deleteMemory(db: D1Database, userId: string, id: string) {
  const result = await db
    .prepare(
      `DELETE FROM memories
       WHERE id = ? AND user_id = ?`
    )
    .bind(id, userId)
    .run();

  return result.meta.changes > 0;
}
