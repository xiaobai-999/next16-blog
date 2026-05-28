import type { Conversation } from "@ai-companion/shared";
import { listCompanions } from "./companions";
import { ServiceError } from "./service-error";

type ConversationRow = {
  id: string;
  user_id: string;
  companion_id: string;
  title: string | null;
  last_message_preview?: string | null;
  created_at: string;
  updated_at: string;
};

type CreateConversationInput = {
  companionId: string;
  title?: string | null;
};

/**
 * 将 D1 的 snake_case 会话行转换成前后端共享的 Conversation 类型。
 */
function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    companionId: row.companion_id,
    title: row.title,
    lastMessagePreview: row.last_message_preview ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 根据首条用户消息生成会话标题。
 *
 * 第一版只取前 20 个字符，后续可以升级为模型总结标题。
 */
export function titleFromMessage(content: string) {
  // normalized：去除多余空白后的用户消息，用作稳定的会话标题来源。
  const normalized = content.replace(/\s+/g, " ").trim();

  return normalized.length > 20 ? normalized.slice(0, 20) : normalized;
}

/**
 * 创建聊天会话。
 *
 * @param db D1 数据库绑定。
 * @param userId 当前登录用户 ID，会写入 conversations.user_id。
 * @param input 会话所属伴侣和可选标题。
 * @returns 创建后的会话对象。
 */
export async function createConversation(
  db: D1Database,
  userId: string,
  input: CreateConversationInput
) {
  // now：会话创建和首次更新时间，统一保存 ISO 字符串。
  const now = new Date().toISOString();
  // conversation：写入数据库前构造的领域对象，字段使用前端共享命名。
  const conversation = {
    id: crypto.randomUUID(),
    userId,
    companionId: input.companionId,
    title: input.title ?? null,
    createdAt: now,
    updatedAt: now
  } satisfies Conversation;

  await db
    .prepare(
      `INSERT INTO conversations
        (id, user_id, companion_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      conversation.id,
      conversation.userId,
      conversation.companionId,
      conversation.title,
      conversation.createdAt,
      conversation.updatedAt
    )
    .run();

  return conversation;
}

/**
 * 为当前用户的默认伴侣创建会话。
 *
 * 第一版只支持一个伴侣，因此取当前用户最新的伴侣作为会话归属。
 */
export async function createConversationForCurrentCompanion(
  db: D1Database,
  userId: string,
  title?: string | null
) {
  // companion：当前用户的默认伴侣；不存在时说明用户还没完成伴侣创建流程。
  const [companion] = await listCompanions(db, userId);

  if (!companion) {
    throw new ServiceError("COMPANION_REQUIRED", "请先创建伴侣");
  }

  return createConversation(db, userId, {
    companionId: companion.id,
    title
  });
}

/**
 * 查询当前用户的会话列表。
 *
 * 查询必须带 user_id 条件，避免用户读取到其他人的会话。
 */
export async function listConversations(db: D1Database, userId: string) {
  const result = await db
    .prepare(
      `SELECT
         conversations.id,
         conversations.user_id,
         conversations.companion_id,
         conversations.title,
         conversations.created_at,
         conversations.updated_at,
         (
           SELECT messages.content
           FROM messages
           WHERE messages.conversation_id = conversations.id
             AND messages.user_id = conversations.user_id
           ORDER BY messages.created_at DESC, messages.id DESC
           LIMIT 1
         ) AS last_message_preview
       FROM conversations
       WHERE conversations.user_id = ?
       ORDER BY conversations.updated_at DESC`
    )
    .bind(userId)
    .all<ConversationRow>();

  return result.results.map(mapConversation);
}

/**
 * 查询当前用户某个伴侣下最近一条会话。
 *
 * 用于单一连续聊天模式：当前端没有传 conversationId 时，优先延续最近会话。
 */
export async function getLatestConversationForCompanion(
  db: D1Database,
  userId: string,
  companionId: string
) {
  const row = await db
    .prepare(
      `SELECT id, user_id, companion_id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = ? AND companion_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .bind(userId, companionId)
    .first<ConversationRow>();

  return row ? mapConversation(row) : null;
}

/**
 * 按 ID 查询当前用户的一条会话。
 *
 * @returns 找到时返回会话，否则返回 null。
 */
export async function getConversation(db: D1Database, userId: string, id: string) {
  const row = await db
    .prepare(
      `SELECT id, user_id, companion_id, title, created_at, updated_at
       FROM conversations
       WHERE id = ? AND user_id = ?`
    )
    .bind(id, userId)
    .first<ConversationRow>();

  return row ? mapConversation(row) : null;
}

/**
 * 读取会话并强制校验归属。
 *
 * 会话不存在或不属于当前用户时统一抛 FORBIDDEN，避免泄露资源是否存在。
 */
export async function requireConversation(db: D1Database, userId: string, id: string) {
  // conversation：通过 id + user_id 双条件查出的会话，天然带权限校验。
  const conversation = await getConversation(db, userId, id);

  if (!conversation) {
    throw new ServiceError("FORBIDDEN", "无权访问该会话");
  }

  return conversation;
}

/**
 * 更新会话的最近活动时间。
 *
 * 每次保存用户消息或 assistant 回复后调用，用于会话列表按最近对话排序。
 */
export async function touchConversation(db: D1Database, userId: string, id: string) {
  // now：最近活动时间，写入 conversations.updated_at。
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE conversations
       SET updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .bind(now, id, userId)
    .run();
}
