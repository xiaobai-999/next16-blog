import type { Message } from "@ai-companion/shared";
import type { ModelMessage, UIMessage } from "ai";

type MessageRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  token_count: number | null;
  created_at: string;
};

export type CreateMessageInput = {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
};

// MODEL_HISTORY_LIMIT：每次注入模型的最近消息数量，避免把完整历史塞进上下文。
const MODEL_HISTORY_LIMIT = 20;

/**
 * 将 D1 的 snake_case 消息行转换成前后端共享的 Message 类型。
 */
function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    tokenCount: row.token_count,
    createdAt: row.created_at
  };
}

/**
 * 粗略估算消息 token 数。
 *
 * 第一版只用于记录和观察，不作为计费或精确上下文裁剪依据。
 */
export function estimateTokenCount(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

/**
 * 将数据库消息转换成 AI SDK 模型入参。
 *
 * system 消息虽然数据库 schema 支持，但当前阶段默认只注入 user/assistant 历史。
 */
export function dbMessageToModelMessage(message: Message): ModelMessage {
  return {
    role: message.role,
    content: message.content
  };
}

/**
 * 将数据库消息转换成 AI SDK 前端 UIMessage。
 *
 * 用于聊天页刷新后把历史消息重新灌回 useChat。
 */
export function dbMessageToUIMessage(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }]
  };
}

/**
 * 从 AI SDK UIMessage 中提取纯文本内容。
 *
 * 当前产品只支持文本消息，因此会忽略工具、文件、reasoning 等非文本 parts。
 */
export function uiMessageContent(message: Pick<UIMessage, "parts">) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

/**
 * 保存一条用户或 assistant 消息。
 *
 * @param db D1 数据库绑定。
 * @param userId 当前登录用户 ID，会写入 messages.user_id。
 * @param input 消息所属会话、角色和正文。
 * @returns 创建后的消息对象。
 */
export async function createMessage(db: D1Database, userId: string, input: CreateMessageInput) {
  // now：消息创建时间，统一保存 ISO 字符串。
  const now = new Date().toISOString();
  // message：写入数据库前构造的消息领域对象。
  const message = {
    id: crypto.randomUUID(),
    userId,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    tokenCount: estimateTokenCount(input.content),
    createdAt: now
  } satisfies Message;

  await db
    .prepare(
      `INSERT INTO messages
        (id, user_id, conversation_id, role, content, token_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      message.id,
      message.userId,
      message.conversationId,
      message.role,
      message.content,
      message.tokenCount,
      message.createdAt
    )
    .run();

  return message;
}

/**
 * 查询某个会话下的完整消息列表。
 *
 * 查询条件同时包含 user_id 和 conversation_id，确保只能读取自己的消息。
 */
export async function listMessages(db: D1Database, userId: string, conversationId: string) {
  const result = await db
    .prepare(
      `SELECT id, user_id, conversation_id, role, content, token_count, created_at
       FROM messages
       WHERE user_id = ? AND conversation_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .bind(userId, conversationId)
    .all<MessageRow>();

  return result.results.map(mapMessage);
}

/**
 * 查询当前用户的一条消息。
 *
 * 用于反馈接口校验消息归属和消息角色。
 */
export async function getMessage(db: D1Database, userId: string, id: string) {
  const row = await db
    .prepare(
      `SELECT id, user_id, conversation_id, role, content, token_count, created_at
       FROM messages
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    )
    .bind(id, userId)
    .first<MessageRow>();

  return row ? mapMessage(row) : null;
}

/**
 * 查询最近一段可注入模型的聊天历史。
 *
 * SQL 先按倒序取最近 limit 条，再在内存中反转为时间正序，符合模型消息输入顺序。
 */
export async function listRecentModelMessages(
  db: D1Database,
  userId: string,
  conversationId: string,
  limit = MODEL_HISTORY_LIMIT
) {
  const result = await db
    .prepare(
      `SELECT id, user_id, conversation_id, role, content, token_count, created_at
       FROM messages
       WHERE user_id = ? AND conversation_id = ? AND role IN ('user', 'assistant')
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(userId, conversationId, limit)
    .all<MessageRow>();

  return result.results.map(mapMessage).reverse().map(dbMessageToModelMessage);
}
