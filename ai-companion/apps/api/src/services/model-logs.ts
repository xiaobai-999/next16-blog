import type { ModelLog } from "@ai-companion/shared";

type ModelLogRow = {
  id: string;
  trace_id: string;
  user_id: string;
  conversation_id: string | null;
  provider: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  status: "success" | "error";
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

type CreateModelLogInput = {
  traceId: string;
  userId: string;
  conversationId?: string | null;
  provider: string;
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  status: "success" | "error";
  errorCode?: string | null;
  errorMessage?: string | null;
};

/**
 * 将 D1 的 snake_case 模型日志行转换成共享 ModelLog 类型。
 */
function mapModelLog(row: ModelLogRow): ModelLog {
  return {
    id: row.id,
    traceId: row.trace_id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    provider: row.provider,
    model: row.model,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    latencyMs: row.latency_ms,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

/**
 * 写入一次模型调用日志。
 *
 * 日志只保存模型元信息、耗时、token 和错误摘要，不保存完整 prompt。
 */
export async function createModelLog(db: D1Database, input: CreateModelLogInput) {
  // now：模型日志创建时间，统一保存 ISO 字符串。
  const now = new Date().toISOString();
  // log：写入数据库前构造的模型调用日志对象。
  const log = {
    id: crypto.randomUUID(),
    traceId: input.traceId,
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    provider: input.provider,
    model: input.model,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    latencyMs: input.latencyMs ?? null,
    status: input.status,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: now
  } satisfies ModelLog;

  await db
    .prepare(
      `INSERT INTO model_logs
        (id, trace_id, user_id, conversation_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status, error_code, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      log.id,
      log.traceId,
      log.userId,
      log.conversationId,
      log.provider,
      log.model,
      log.promptTokens,
      log.completionTokens,
      log.latencyMs,
      log.status,
      log.errorCode,
      log.errorMessage,
      log.createdAt
    )
    .run();

  console.log("model_log", {
    traceId: log.traceId,
    provider: log.provider,
    model: log.model,
    status: log.status,
    latencyMs: log.latencyMs,
    errorCode: log.errorCode
  });

  return log;
}

/**
 * 读取最近的模型调用日志。
 *
 * 只用于本地 debug 接口，不对普通线上用户开放。
 */
export async function listModelLogs(db: D1Database, limit = 50) {
  const result = await db
    .prepare(
      `SELECT id, trace_id, user_id, conversation_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status, error_code, error_message, created_at
       FROM model_logs
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<ModelLogRow>();

  return result.results.map(mapModelLog);
}
