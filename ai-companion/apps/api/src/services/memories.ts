import type {
  CandidateMemory,
  CreateMemoryInput,
  Memory,
  MemoryStatus,
  MemorySource
} from "@ai-companion/shared";
import { listCompanions } from "./companions";
import { ServiceError } from "./service-error";

type MemoryRow = {
  // id：D1 中的记忆 ID。
  id: string;
  // user_id：记忆所属用户，用于所有查询的权限过滤。
  user_id: string;
  // companion_id：记忆所属伴侣，用于构建该伴侣的聊天上下文。
  companion_id: string;
  // type：记忆类型，来自 shared 的统一枚举。
  type: Memory["type"];
  // content：记忆正文，保存可长期复用的信息。
  content: string;
  // importance：记忆重要性，影响列表和 prompt 注入排序。
  importance: number;
  // source：记忆来源，区分手动新增和模型提取。
  source: MemorySource;
  // source_message_id：模型提取时的来源用户消息 ID。
  source_message_id: string | null;
  // status：记忆治理状态，只有 active 会进入 prompt。
  status: MemoryStatus;
  // confidence：模型提取置信度，手动记忆默认 1。
  confidence: number;
  // source_conversation_id：模型提取时的来源会话 ID。
  source_conversation_id: string | null;
  // expires_at：记忆过期时间，过期后不进入 prompt。
  expires_at: string | null;
  // archived_at：记忆归档时间，归档后不进入 prompt。
  archived_at: string | null;
  // deleted_at：记忆软删除时间，删除后不展示、不进入 prompt。
  deleted_at: string | null;
  // conflict_with_memory_id：冲突记忆 ID，预留给后续冲突检测。
  conflict_with_memory_id: string | null;
  // confirmation_reason：待确认或冲突时展示给用户的原因。
  confirmation_reason: string | null;
  // created_at：记忆创建时间，ISO 字符串。
  created_at: string;
  // updated_at：记忆最近更新时间，ISO 字符串。
  updated_at: string;
};

type CreateMemoryRecordInput = {
  // companionId：写入记忆所属伴侣 ID。
  companionId: string;
  // type：写入记忆类型。
  type: Memory["type"];
  // content：写入记忆正文，服务端会 trim 后保存。
  content: string;
  // importance：写入记忆重要性。
  importance: number;
  // source：写入记忆来源。
  source: MemorySource;
  // sourceMessageId：模型提取记忆的来源消息 ID，手动记忆为空。
  sourceMessageId?: string | null;
  // status：写入后的治理状态，默认 active。
  status?: MemoryStatus;
  // confidence：模型提取置信度，默认 1。
  confidence?: number;
  // sourceConversationId：模型提取记忆的来源会话 ID。
  sourceConversationId?: string | null;
  // expiresAt：记忆过期时间，主要用于 event。
  expiresAt?: string | null;
  // archivedAt：归档时间，创建时通常为空。
  archivedAt?: string | null;
  // deletedAt：软删除时间，创建时通常为空。
  deletedAt?: string | null;
  // conflictWithMemoryId：冲突记忆 ID，阶段 8 仅预留。
  conflictWithMemoryId?: string | null;
  // confirmationReason：待确认记忆展示给用户的原因。
  confirmationReason?: string | null;
};

type CreateExtractedMemoryInput = {
  // candidate：模型提取出的候选记忆。
  candidate: CandidateMemory;
  // status：memory-policy 决定的写入状态。
  status: Extract<MemoryStatus, "active" | "pending_confirmation">;
  // confirmationReason：待确认时给用户看的原因。
  confirmationReason?: string;
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
 * 按重要性和更新时间查询当前用户的非删除记忆列表。
 *
 * status 为空时返回全部非 deleted 记忆；传入时用于阶段 9 的待确认列表。
 */
export async function listMemories(db: D1Database, userId: string, status?: MemoryStatus) {
  const statement =
    status === undefined
      ? db
          .prepare(
            `SELECT ${MEMORY_SELECT_COLUMNS}
             FROM memories
             WHERE user_id = ? AND status != 'deleted' AND deleted_at IS NULL
             ORDER BY importance DESC, confidence DESC, updated_at DESC`
          )
          .bind(userId)
      : db
          .prepare(
            `SELECT ${MEMORY_SELECT_COLUMNS}
             FROM memories
             WHERE user_id = ? AND status = ? AND deleted_at IS NULL
             ORDER BY importance DESC, confidence DESC, updated_at DESC`
          )
          .bind(userId, status);

  const result = await statement.all<MemoryRow>();

  return result.results.map(mapMemory);
}

/**
 * 查询用于注入 prompt 的高价值记忆。
 *
 * 第一版不做向量检索，只注入 active、未归档、未删除且未过期的记忆。
 */
export async function listPromptMemories(
  db: D1Database,
  userId: string,
  companionId: string,
  limit = PROMPT_MEMORY_LIMIT
) {
  const result = await db
    .prepare(
      `SELECT ${MEMORY_SELECT_COLUMNS}
       FROM memories
       WHERE user_id = ?
         AND companion_id = ?
         AND status = 'active'
         AND deleted_at IS NULL
         AND archived_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY importance DESC, confidence DESC, updated_at DESC
       LIMIT ?`
    )
    .bind(userId, companionId, new Date().toISOString(), limit)
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
      `SELECT ${MEMORY_SELECT_COLUMNS}
       FROM memories
       WHERE user_id = ? AND companion_id = ? AND content = ? AND deleted_at IS NULL
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
    status: input.status ?? "active",
    confidence: input.confidence ?? 1,
    sourceConversationId: input.sourceConversationId ?? null,
    expiresAt: input.expiresAt ?? null,
    archivedAt: input.archivedAt ?? null,
    deletedAt: input.deletedAt ?? null,
    conflictWithMemoryId: input.conflictWithMemoryId ?? null,
    confirmationReason: input.confirmationReason ?? null,
    createdAt: now,
    updatedAt: now
  } satisfies Memory;

  await db
    .prepare(
      `INSERT INTO memories
        (
          id,
          user_id,
          companion_id,
          type,
          content,
          importance,
          source,
          source_message_id,
          status,
          confidence,
          source_conversation_id,
          expires_at,
          archived_at,
          deleted_at,
          conflict_with_memory_id,
          confirmation_reason,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      memory.status,
      memory.confidence,
      memory.sourceConversationId,
      memory.expiresAt,
      memory.archivedAt,
      memory.deletedAt,
      memory.conflictWithMemoryId,
      memory.confirmationReason,
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
  memories: CreateExtractedMemoryInput[],
  sourceMessageId: string,
  sourceConversationId: string
) {
  const savedMemories: Memory[] = [];

  for (const memoryInput of memories) {
    // candidate：模型提取的候选记忆；status 由 memory-policy 决定。
    const { candidate } = memoryInput;

    savedMemories.push(
      await createMemoryRecord(db, userId, {
        companionId,
        type: candidate.type,
        content: candidate.content,
        importance: candidate.importance,
        source: "extracted",
        sourceMessageId,
        status: memoryInput.status,
        confidence: candidate.confidence,
        sourceConversationId,
        expiresAt: candidate.expiresAt ?? null,
        confirmationReason: memoryInput.confirmationReason
      })
    );
  }

  return savedMemories;
}

/**
 * 软删除当前用户的一条记忆。
 *
 * 删除条件同时包含 id 和 user_id，避免越权删除。
 */
export async function deleteMemory(db: D1Database, userId: string, id: string) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE memories
       SET status = 'deleted', deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .bind(now, now, id, userId)
    .run();

  return result.meta.changes > 0;
}
