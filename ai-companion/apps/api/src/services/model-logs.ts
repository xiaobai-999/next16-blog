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

export type DebugMetrics = {
  windowHours: number;
  since: string;
  modelLogs: {
    total: number;
    success: number;
    error: number;
    averageLatencyMs: number | null;
  };
  memories: {
    active: number;
    pendingConfirmation: number;
    archived: number;
    deleted: number;
  };
  feedback: {
    up: number;
    down: number;
    memoryError: number;
    personaMismatch: number;
  };
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

/**
 * 按 trace_id 读取一次请求链路相关模型日志。
 */
export async function listModelLogsByTraceId(db: D1Database, traceId: string) {
  const result = await db
    .prepare(
      `SELECT id, trace_id, user_id, conversation_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status, error_code, error_message, created_at
       FROM model_logs
       WHERE trace_id = ?
       ORDER BY created_at ASC`
    )
    .bind(traceId)
    .all<ModelLogRow>();

  return result.results.map(mapModelLog);
}

type CountRow = {
  count: number;
};

type ModelLogMetricsRow = {
  total: number;
  success: number;
  error: number;
  average_latency_ms: number | null;
};

/**
 * 读取最近一段时间的 MVP 调试指标。
 *
 * 指标只用于本地 debug，不包含 prompt 明文和消息正文。
 */
export async function getDebugMetrics(db: D1Database, windowHours = 24): Promise<DebugMetrics> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const modelLogs = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
         AVG(latency_ms) AS average_latency_ms
       FROM model_logs
       WHERE created_at >= ?`
    )
    .bind(since)
    .first<ModelLogMetricsRow>();

  const activeMemories = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM memories WHERE status = 'active' AND created_at >= ?",
    since
  );
  const pendingMemories = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM memories WHERE status = 'pending_confirmation' AND created_at >= ?",
    since
  );
  const archivedMemories = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM memories WHERE status = 'archived' AND updated_at >= ?",
    since
  );
  const deletedMemories = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM memories WHERE status = 'deleted' AND updated_at >= ?",
    since
  );
  const upFeedback = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM feedback WHERE rating = 'up' AND created_at >= ?",
    since
  );
  const downFeedback = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM feedback WHERE rating = 'down' AND created_at >= ?",
    since
  );
  const memoryErrorFeedback = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM feedback WHERE rating = 'down' AND reason = '[memory_error]' AND created_at >= ?",
    since
  );
  const personaMismatchFeedback = await countRows(
    db,
    "SELECT COUNT(*) AS count FROM feedback WHERE rating = 'down' AND reason = '[persona_mismatch]' AND created_at >= ?",
    since
  );

  return {
    windowHours,
    since,
    modelLogs: {
      total: modelLogs?.total ?? 0,
      success: modelLogs?.success ?? 0,
      error: modelLogs?.error ?? 0,
      averageLatencyMs:
        modelLogs?.average_latency_ms === null || modelLogs?.average_latency_ms === undefined
          ? null
          : Math.round(modelLogs.average_latency_ms)
    },
    memories: {
      active: activeMemories,
      pendingConfirmation: pendingMemories,
      archived: archivedMemories,
      deleted: deletedMemories
    },
    feedback: {
      up: upFeedback,
      down: downFeedback,
      memoryError: memoryErrorFeedback,
      personaMismatch: personaMismatchFeedback
    }
  };
}

/**
 * 执行单值 COUNT 查询。
 */
async function countRows(db: D1Database, sql: string, since: string) {
  const row = await db.prepare(sql).bind(since).first<CountRow>();

  return row?.count ?? 0;
}
