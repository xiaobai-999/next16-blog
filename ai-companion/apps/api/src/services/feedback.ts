import type { CreateFeedbackInput, Feedback } from "@ai-companion/shared";
import { getMessage } from "./messages";
import { ServiceError } from "./service-error";

type FeedbackRow = {
  id: string;
  message_id: string;
  user_id: string;
  rating: "up" | "down";
  reason: string | null;
  created_at: string;
};

/**
 * 将 D1 的 snake_case 反馈行转换成共享 Feedback 类型。
 */
function mapFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    messageId: row.message_id,
    userId: row.user_id,
    rating: row.rating,
    reason: row.reason,
    createdAt: row.created_at
  };
}

/**
 * 新增或覆盖当前用户对 assistant 消息的反馈。
 *
 * 第一版采用覆盖策略：同一用户对同一条消息重复反馈时更新 rating 和 reason。
 */
export async function upsertFeedback(db: D1Database, userId: string, input: CreateFeedbackInput) {
  // message：被反馈的消息，必须属于当前用户且是 assistant 回复。
  const message = await getMessage(db, userId, input.messageId);

  if (!message) {
    throw new ServiceError("NOT_FOUND", "消息不存在");
  }

  if (message.role !== "assistant") {
    throw new ServiceError("BAD_REQUEST", "只能反馈 AI 回复");
  }

  // existing：同一用户对同一条消息的已有反馈，用于覆盖更新。
  const existing = await db
    .prepare(
      `SELECT id, message_id, user_id, rating, reason, created_at
       FROM feedback
       WHERE message_id = ? AND user_id = ?
       LIMIT 1`
    )
    .bind(input.messageId, userId)
    .first<FeedbackRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE feedback
         SET rating = ?, reason = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(input.rating, input.reason ?? null, existing.id, userId)
      .run();

    return {
      ...mapFeedback(existing),
      rating: input.rating,
      reason: input.reason ?? null
    } satisfies Feedback;
  }

  // feedback：写入数据库前构造的新反馈对象。
  const feedback = {
    id: crypto.randomUUID(),
    messageId: input.messageId,
    userId,
    rating: input.rating,
    reason: input.reason ?? null,
    createdAt: new Date().toISOString()
  } satisfies Feedback;

  await db
    .prepare(
      `INSERT INTO feedback
        (id, message_id, user_id, rating, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      feedback.id,
      feedback.messageId,
      feedback.userId,
      feedback.rating,
      feedback.reason,
      feedback.createdAt
    )
    .run();

  return feedback;
}
