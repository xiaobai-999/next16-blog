import type { CandidateMemory, Memory, MemoryStatus, MemorySource } from "@ai-companion/shared";
import type { AppEnv } from "../env";
import { deleteMemoryEmbedding } from "./memory-embeddings";

type MemoryRow = {
  // id：D1 中的记忆 ID。
  id: string;
  // user_id：记忆所属用户，用于权限隔离。
  user_id: string;
  // companion_id：记忆所属伴侣，用于同伴侣内的去重、合并和冲突判断。
  companion_id: string;
  // type：记忆类型，质量规则只在同类型记忆之间执行。
  type: Memory["type"];
  // content：记忆正文。
  content: string;
  // importance：记忆重要性，重复命中时保留更高值。
  importance: number;
  // source：记忆来源。
  source: MemorySource;
  // source_message_id：来源消息 ID。
  source_message_id: string | null;
  // status：记忆状态，质量规则只和 active 旧记忆比较。
  status: MemoryStatus;
  // confidence：模型提取置信度，重复命中时保留更高值。
  confidence: number;
  // source_conversation_id：来源会话 ID。
  source_conversation_id: string | null;
  // expires_at：记忆过期时间。
  expires_at: string | null;
  // archived_at：记忆归档时间。
  archived_at: string | null;
  // deleted_at：记忆软删除时间。
  deleted_at: string | null;
  // conflict_with_memory_id：冲突旧记忆 ID。
  conflict_with_memory_id: string | null;
  // confirmation_reason：需要用户确认时展示的解释。
  confirmation_reason: string | null;
  // created_at：创建时间。
  created_at: string;
  // updated_at：更新时间。
  updated_at: string;
};

type CandidateWriteInput = {
  // candidate：模型提取后、通过基础 policy 的候选记忆。
  candidate: CandidateMemory;
  // status：基础 policy 给出的初始写入状态。
  status: Extract<MemoryStatus, "active" | "pending_confirmation">;
  // confirmationReason：基础 policy 给出的待确认原因。
  confirmationReason?: string;
};

type CreateMemoryQualityResult = {
  action: "create";
  // candidate：经过过期时间兜底后的候选记忆。
  candidate: CandidateMemory;
  // status：质量规则后的最终写入状态。
  status: Extract<MemoryStatus, "active" | "pending_confirmation">;
  // confirmationReason：冲突或基础 policy 产生的用户可读确认原因。
  confirmationReason?: string;
  // conflictWithMemoryId：检测到冲突时指向旧 active 记忆。
  conflictWithMemoryId?: string | null;
  // expiresAt：质量规则推断出的过期时间。
  expiresAt?: string | null;
};

type ExistingMemoryQualityResult = {
  action: "use_existing";
  // memory：被去重或合并后复用的旧记忆。
  memory: Memory;
};

export type MemoryQualityResult = CreateMemoryQualityResult | ExistingMemoryQualityResult;

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

const MERGEABLE_TYPES: Memory["type"][] = ["profile", "preference", "relationship", "boundary"];
const CONFLICT_TYPES: Memory["type"][] = ["preference", "relationship", "boundary"];
const NEGATION_PATTERNS = [
  /不/,
  /没/,
  /无/,
  /别/,
  /不要/,
  /不能/,
  /不再/,
  /讨厌/,
  /拒绝/,
  /避免/,
  /禁止/,
  /\bnot\b/i,
  /\bnever\b/i,
  /\bno\b/i
];
const PUNCTUATION_PATTERN = /[，。！？、；：,.!?;:\-—"'“”‘’()[\]{}]/g;

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
 * 标准化记忆正文，用于精确去重。
 */
export function normalizeMemoryContent(content: string) {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * 提取用于粗略相似度判断的关键词。
 */
function contentTokens(content: string) {
  // normalizedContent：去掉标点和多余空白后的正文，降低格式差异影响。
  const normalizedContent = normalizeMemoryContent(content).replace(PUNCTUATION_PATTERN, " ");
  // englishWords：英文和数字词，主要处理用户偏好里夹杂的英文关键词。
  const englishWords = normalizedContent.match(/[a-z0-9]+/g) ?? [];
  // chineseChars：中文字符，使用相邻二元组表示局部语义重叠。
  const chineseChars = normalizedContent.match(/[\u4e00-\u9fff]/g) ?? [];
  // chineseBigrams：中文二元组，避免单字导致相似度过高。
  const chineseBigrams = chineseChars
    .slice(0, -1)
    .map((char, index) => `${char}${chineseChars[index + 1]}`);

  return new Set([...englishWords.filter((word) => word.length > 1), ...chineseBigrams]);
}

/**
 * 计算两个正文的粗略关键词重叠比例。
 */
function tokenOverlap(left: string, right: string) {
  // leftTokens/rightTokens：两段正文的去重关键词集合。
  const leftTokens = contentTokens(left);
  const rightTokens = contentTokens(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  // intersectionSize：共同关键词数量。
  const intersectionSize = [...leftTokens].filter((token) => rightTokens.has(token)).length;

  return intersectionSize / Math.min(leftTokens.size, rightTokens.size);
}

/**
 * 判断正文是否包含明显否定表达。
 */
function hasNegation(content: string) {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * 判断两条记忆是否存在明显否定差异。
 */
function hasNegationMismatch(left: string, right: string) {
  return hasNegation(left) !== hasNegation(right);
}

/**
 * 查询同用户、同伴侣、同类型的 active 旧记忆。
 */
async function listActiveMemoriesByType(
  db: D1Database,
  userId: string,
  companionId: string,
  type: Memory["type"]
) {
  const result = await db
    .prepare(
      `SELECT ${MEMORY_SELECT_COLUMNS}
       FROM memories
       WHERE user_id = ?
         AND companion_id = ?
         AND type = ?
         AND status = 'active'
         AND deleted_at IS NULL
         AND archived_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY importance DESC, confidence DESC, updated_at DESC`
    )
    .bind(userId, companionId, type, new Date().toISOString())
    .all<MemoryRow>();

  return result.results.map(mapMemory);
}

/**
 * 查找完全重复的 active 记忆。
 */
export async function findDuplicateMemory(
  db: D1Database,
  userId: string,
  companionId: string,
  candidate: CandidateMemory
) {
  // normalizedCandidate：候选记忆的标准化正文。
  const normalizedCandidate = normalizeMemoryContent(candidate.content);
  // existingMemories：同类型 active 旧记忆，用于标准化后精确比较。
  const existingMemories = await listActiveMemoriesByType(db, userId, companionId, candidate.type);

  return (
    existingMemories.find(
      (memory) => normalizeMemoryContent(memory.content) === normalizedCandidate
    ) ?? null
  );
}

/**
 * 更新重复旧记忆的质量字段，并复用旧记录。
 */
async function touchDuplicateMemory(db: D1Database, oldMemory: Memory, candidate: CandidateMemory) {
  // now：重复命中时间，写入 updated_at 方便后续排序。
  const now = new Date().toISOString();
  // nextImportance：重复命中后保留更高重要性。
  const nextImportance = Math.max(oldMemory.importance, candidate.importance);
  // nextConfidence：重复命中后保留更高置信度。
  const nextConfidence = Math.max(oldMemory.confidence, candidate.confidence);

  await db
    .prepare(
      `UPDATE memories
       SET importance = ?, confidence = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .bind(nextImportance, nextConfidence, now, oldMemory.id, oldMemory.userId)
    .run();

  return {
    ...oldMemory,
    importance: nextImportance,
    confidence: nextConfidence,
    updatedAt: now
  } satisfies Memory;
}

/**
 * 判断候选记忆是否能和旧记忆合并。
 */
function canMergeMemory(oldMemory: Memory, candidate: CandidateMemory) {
  if (!MERGEABLE_TYPES.includes(candidate.type)) {
    return false;
  }

  if (hasNegationMismatch(oldMemory.content, candidate.content)) {
    return false;
  }

  // normalizedOld/normalizedNew：用于快速判断包含关系。
  const normalizedOld = normalizeMemoryContent(oldMemory.content);
  const normalizedNew = normalizeMemoryContent(candidate.content);

  return (
    normalizedOld.includes(normalizedNew) ||
    normalizedNew.includes(normalizedOld) ||
    tokenOverlap(oldMemory.content, candidate.content) >= 0.7
  );
}

/**
 * 生成第一版合并后的正文。
 */
function mergedMemoryContent(oldMemory: Memory, candidate: CandidateMemory) {
  // normalizedOld/normalizedNew：用于判断谁包含谁。
  const normalizedOld = normalizeMemoryContent(oldMemory.content);
  const normalizedNew = normalizeMemoryContent(candidate.content);

  if (normalizedOld.includes(normalizedNew)) {
    return oldMemory.content;
  }

  if (normalizedNew.includes(normalizedOld)) {
    return candidate.content.trim();
  }

  return `${oldMemory.content.trim()}；${candidate.content.trim()}`;
}

/**
 * 合并旧记忆和候选记忆。
 */
export async function mergeMemory(db: D1Database, oldMemory: Memory, candidate: CandidateMemory) {
  // now：合并时间，写入 updated_at。
  const now = new Date().toISOString();
  // nextContent：合并后的正文，第一版使用包含关系或分号拼接。
  const nextContent = mergedMemoryContent(oldMemory, candidate);
  // nextImportance：合并后保留更高重要性。
  const nextImportance = Math.max(oldMemory.importance, candidate.importance);
  // nextConfidence：合并后保留更高置信度。
  const nextConfidence = Math.max(oldMemory.confidence, candidate.confidence);

  await db
    .prepare(
      `UPDATE memories
       SET content = ?, importance = ?, confidence = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .bind(nextContent, nextImportance, nextConfidence, now, oldMemory.id, oldMemory.userId)
    .run();

  return {
    ...oldMemory,
    content: nextContent,
    importance: nextImportance,
    confidence: nextConfidence,
    updatedAt: now
  } satisfies Memory;
}

/**
 * 查找可合并的旧记忆。
 */
async function findMergeableMemory(
  db: D1Database,
  userId: string,
  companionId: string,
  candidate: CandidateMemory
) {
  // existingMemories：同类型 active 旧记忆，按质量排序后优先尝试高价值记忆。
  const existingMemories = await listActiveMemoriesByType(db, userId, companionId, candidate.type);

  return existingMemories.find((memory) => canMergeMemory(memory, candidate)) ?? null;
}

/**
 * 检测候选记忆是否和旧 active 记忆冲突。
 */
export async function detectMemoryConflict(
  db: D1Database,
  userId: string,
  companionId: string,
  candidate: CandidateMemory
) {
  if (!CONFLICT_TYPES.includes(candidate.type)) {
    return null;
  }

  // existingMemories：同类型 active 旧记忆，只有这些记忆会进入上下文，因此需要检测冲突。
  const existingMemories = await listActiveMemoriesByType(db, userId, companionId, candidate.type);

  return (
    existingMemories.find(
      (memory) =>
        hasNegationMismatch(memory.content, candidate.content) &&
        tokenOverlap(memory.content, candidate.content) >= 0.25
    ) ?? null
  );
}

/**
 * 推断 event 记忆的过期时间。
 */
export function inferMemoryExpiresAt(candidate: CandidateMemory, now = new Date()) {
  if (candidate.expiresAt) {
    const explicitExpiresAt = new Date(candidate.expiresAt);

    if (!Number.isNaN(explicitExpiresAt.getTime()) && explicitExpiresAt.getTime() > now.getTime()) {
      return candidate.expiresAt;
    }
  }

  if (candidate.type !== "event") {
    return null;
  }

  // content：事件正文，用于匹配相对时间表达。
  const { content } = candidate;
  // explicitDate：匹配 2026-06-01 或 2026/06/01 这类明确日期。
  const explicitDate = content.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);

  if (explicitDate) {
    const [, year, month, day] = explicitDate;
    const expiresAt = new Date(Number(year), Number(month) - 1, Number(day) + 1, 0, 0, 0, 0);

    return expiresAt.toISOString();
  }

  // monthDay：匹配 6月1日 这类没有年份的日期，年份按当前年处理。
  const monthDay = content.match(/(\d{1,2})月(\d{1,2})日/);

  if (monthDay) {
    const [, month, day] = monthDay;
    const expiresAt = new Date(now.getFullYear(), Number(month) - 1, Number(day) + 1, 0, 0, 0, 0);

    return expiresAt.toISOString();
  }

  if (/今天/.test(content)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).toISOString();
  }

  if (/这周|本周/.test(content)) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (/最近|近期/.test(content)) {
    return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 归档已经过期的 active 记忆。
 *
 * 预留给后续 cron/debug 使用；聊天上下文读取仍会实时过滤过期记忆。
 */
export async function archiveExpiredMemories(
  env: AppEnv["Bindings"],
  now = new Date().toISOString()
) {
  // expiredRows：本次会被归档的记忆 ID，用于同步删除向量。
  const expiredRows = await env.DB.prepare(
    `SELECT id
     FROM memories
     WHERE status = 'active'
       AND deleted_at IS NULL
       AND archived_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= ?`
  )
    .bind(now)
    .all<{ id: string }>();

  const result = await env.DB
    .prepare(
      `UPDATE memories
       SET status = 'archived', archived_at = ?, updated_at = ?
       WHERE status = 'active'
         AND deleted_at IS NULL
         AND archived_at IS NULL
         AND expires_at IS NOT NULL
         AND expires_at <= ?`
    )
    .bind(now, now, now)
    .run();

  for (const row of expiredRows.results) {
    await deleteMemoryEmbedding(env, row.id).catch((error) => {
      console.error("Failed to delete expired memory embedding", { memoryId: row.id, error });
    });
  }

  return result.meta.changes;
}

/**
 * 对候选记忆执行第一版质量规则。
 */
export async function applyMemoryQualityRules(
  db: D1Database,
  userId: string,
  companionId: string,
  input: CandidateWriteInput
): Promise<MemoryQualityResult> {
  const duplicateMemory = await findDuplicateMemory(db, userId, companionId, input.candidate);

  if (duplicateMemory) {
    return {
      action: "use_existing",
      memory: await touchDuplicateMemory(db, duplicateMemory, input.candidate)
    };
  }

  const mergeableMemory = await findMergeableMemory(db, userId, companionId, input.candidate);

  if (mergeableMemory) {
    return {
      action: "use_existing",
      memory: await mergeMemory(db, mergeableMemory, input.candidate)
    };
  }

  const conflictMemory = await detectMemoryConflict(db, userId, companionId, input.candidate);

  if (conflictMemory) {
    return {
      action: "create",
      candidate: input.candidate,
      status: "pending_confirmation",
      conflictWithMemoryId: conflictMemory.id,
      confirmationReason: `我之前记得：${conflictMemory.content}。现在你说：${input.candidate.content}。需要确认以后按哪个为准。`,
      expiresAt: inferMemoryExpiresAt(input.candidate)
    };
  }

  return {
    action: "create",
    candidate: input.candidate,
    status: input.status,
    confirmationReason: input.confirmationReason,
    conflictWithMemoryId: null,
    expiresAt: inferMemoryExpiresAt(input.candidate)
  };
}
