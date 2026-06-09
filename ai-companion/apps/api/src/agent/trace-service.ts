import type { AppEnv } from "../env";
import type { AgentTraceStatus } from "./agent-state";

export type AgentTraceConfig = {
  graphVersion: string;
  successSampleRate: number;
  retentionDays: number;
  devUserIds: string[];
};

export type AgentRunRecord = {
  traceId: string;
  requestId: string;
  userId: string;
  companionId: string | null;
  conversationId: string | null;
  threadId: string | null;
  graphVersion: string;
  graphPath: string[];
  intent: string | null;
  emotion: string | null;
  riskLevel: string | null;
  strategy: string | null;
  status: AgentTraceStatus;
  degradedReason: string | null;
  sampled: boolean;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  retentionUntil: string;
  createdAt: string;
};

export type AgentSpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  nodeName: string;
  status: AgentTraceStatus;
  latencyMs: number;
  model: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string;
  createdAt: string;
};

export type CreateAgentRunInput = {
  traceId: string;
  requestId: string;
  userId: string;
  companionId?: string | null;
  conversationId?: string | null;
  threadId?: string | null;
  graphPath?: string[];
  intent?: string | null;
  emotion?: string | null;
  riskLevel?: string | null;
  strategy?: string | null;
  status: AgentTraceStatus;
  degradedReason?: string | null;
  startedAt: string;
  endedAt: string;
};

export type CreateAgentSpanInput = {
  traceId: string;
  spanId?: string;
  parentSpanId?: string | null;
  nodeName: string;
  status: AgentTraceStatus;
  model?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  endedAt: string;
};

export type TraceService = {
  recordRun(input: CreateAgentRunInput): Promise<AgentRunRecord>;
  recordSpan(input: CreateAgentSpanInput, sampled?: boolean): Promise<AgentSpanRecord | null>;
  recordTrace(input: {
    run: CreateAgentRunInput;
    spans?: CreateAgentSpanInput[];
  }): Promise<{ run: AgentRunRecord; spans: AgentSpanRecord[] }>;
};

type AgentRunRow = {
  trace_id: string;
  request_id: string;
  user_id: string;
  companion_id: string | null;
  conversation_id: string | null;
  thread_id: string | null;
  graph_version: string;
  graph_path: string;
  intent: string | null;
  emotion: string | null;
  risk_level: string | null;
  strategy: string | null;
  status: AgentTraceStatus;
  degraded_reason: string | null;
  sampled: number;
  started_at: string;
  ended_at: string;
  latency_ms: number;
  retention_until: string;
  created_at: string;
};

type AgentSpanRow = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  node_name: string;
  status: AgentTraceStatus;
  latency_ms: number;
  model: string | null;
  input_summary: string | null;
  output_summary: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  ended_at: string;
  created_at: string;
};

const SUMMARY_MAX_LENGTH = 500;

function parseSampleRate(value: string | undefined) {
  const rate = Number(value ?? 0.1);

  if (!Number.isFinite(rate)) {
    return 0.1;
  }

  return Math.min(1, Math.max(0, rate));
}

function parseRetentionDays(value: string | undefined) {
  const days = Number(value ?? 30);

  if (!Number.isFinite(days)) {
    return 30;
  }

  return Math.min(365, Math.max(1, Math.trunc(days)));
}

function parseDevUserIds(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 从 Worker 环境变量读取 Agent Trace 配置。
 */
export function getAgentTraceConfig(env: AppEnv["Bindings"]): AgentTraceConfig {
  return {
    graphVersion: env.AGENT_TRACE_GRAPH_VERSION ?? "v2-agent-foundation",
    successSampleRate: parseSampleRate(env.AGENT_TRACE_SUCCESS_SAMPLE_RATE),
    retentionDays: parseRetentionDays(env.AGENT_TRACE_RETENTION_DAYS),
    devUserIds: parseDevUserIds(env.AGENT_TRACE_DEV_USER_IDS)
  };
}

function retentionUntil(startedAt: string, retentionDays: number) {
  const startedTime = new Date(startedAt).getTime();
  const baseTime = Number.isNaN(startedTime) ? Date.now() : startedTime;

  return new Date(baseTime + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function latencyMs(startedAt: string, endedAt: string) {
  const startedTime = new Date(startedAt).getTime();
  const endedTime = new Date(endedAt).getTime();

  if (Number.isNaN(startedTime) || Number.isNaN(endedTime)) {
    return 0;
  }

  return Math.max(0, endedTime - startedTime);
}

/**
 * 判断本轮 Agent Trace 是否保存 span 明细。
 *
 * 错误、降级、高风险和开发用户全量保存；普通成功请求按配置比例采样。
 */
export function shouldSampleAgentTrace(input: {
  status: AgentTraceStatus;
  riskLevel?: string | null;
  userId: string;
  config: AgentTraceConfig;
}) {
  if (input.status === "error" || input.status === "degraded") {
    return true;
  }

  if (input.riskLevel === "high") {
    return true;
  }

  if (input.config.devUserIds.includes(input.userId)) {
    return true;
  }

  return Math.random() < input.config.successSampleRate;
}

/**
 * 脱敏并截断 Trace 摘要。
 *
 * Trace 不保存完整对话、system prompt、密钥、Cookie、Authorization 头或连接串。
 */
export function sanitizeTraceSummary(value: string | null | undefined, maxLength = SUMMARY_MAX_LENGTH) {
  if (!value) {
    return null;
  }

  const sanitized = value
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;}]+/gi, "$1[REDACTED]")
    .replace(/(cookie\s*[:=]\s*)[^\n\r]+/gi, "$1[REDACTED]")
    .replace(
      /(api[_-]?key|token|password|secret|database_url|connection_string)(\s*[:=]\s*)(["']?)[^\s,;}]+(["']?)/gi,
      "$1$2$3[REDACTED]$4"
    )
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[REDACTED_API_KEY]");

  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) : sanitized;
}

function normalizeRun(input: CreateAgentRunInput, config: AgentTraceConfig): AgentRunRecord {
  const sampled = shouldSampleAgentTrace({
    status: input.status,
    riskLevel: input.riskLevel,
    userId: input.userId,
    config
  });

  return {
    traceId: input.traceId,
    requestId: input.requestId,
    userId: input.userId,
    companionId: input.companionId ?? null,
    conversationId: input.conversationId ?? null,
    threadId: input.threadId ?? null,
    graphVersion: config.graphVersion,
    graphPath: input.graphPath ?? [],
    intent: input.intent ?? null,
    emotion: input.emotion ?? null,
    riskLevel: input.riskLevel ?? null,
    strategy: input.strategy ?? null,
    status: input.status,
    degradedReason: sanitizeTraceSummary(input.degradedReason),
    sampled,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    latencyMs: latencyMs(input.startedAt, input.endedAt),
    retentionUntil: retentionUntil(input.startedAt, config.retentionDays),
    createdAt: new Date().toISOString()
  };
}

function normalizeSpan(input: CreateAgentSpanInput): AgentSpanRecord {
  return {
    traceId: input.traceId,
    spanId: input.spanId ?? crypto.randomUUID(),
    parentSpanId: input.parentSpanId ?? null,
    nodeName: input.nodeName,
    status: input.status,
    latencyMs: latencyMs(input.startedAt, input.endedAt),
    model: input.model ?? null,
    inputSummary: sanitizeTraceSummary(input.inputSummary),
    outputSummary: sanitizeTraceSummary(input.outputSummary),
    errorCode: sanitizeTraceSummary(input.errorCode, 120),
    errorMessage: sanitizeTraceSummary(input.errorMessage),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    createdAt: new Date().toISOString()
  };
}

async function insertRun(db: D1Database, run: AgentRunRecord) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO agent_runs
        (trace_id, request_id, user_id, companion_id, conversation_id, thread_id, graph_version, graph_path, intent, emotion, risk_level, strategy, status, degraded_reason, sampled, started_at, ended_at, latency_ms, retention_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      run.traceId,
      run.requestId,
      run.userId,
      run.companionId,
      run.conversationId,
      run.threadId,
      run.graphVersion,
      JSON.stringify(run.graphPath),
      run.intent,
      run.emotion,
      run.riskLevel,
      run.strategy,
      run.status,
      run.degradedReason,
      run.sampled ? 1 : 0,
      run.startedAt,
      run.endedAt,
      run.latencyMs,
      run.retentionUntil,
      run.createdAt
    )
    .run();
}

async function insertSpan(db: D1Database, span: AgentSpanRecord) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO agent_spans
        (trace_id, span_id, parent_span_id, node_name, status, latency_ms, model, input_summary, output_summary, error_code, error_message, started_at, ended_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      span.traceId,
      span.spanId,
      span.parentSpanId,
      span.nodeName,
      span.status,
      span.latencyMs,
      span.model,
      span.inputSummary,
      span.outputSummary,
      span.errorCode,
      span.errorMessage,
      span.startedAt,
      span.endedAt,
      span.createdAt
    )
    .run();
}

/**
 * 创建 TraceService。
 *
 * 写入失败由调用方降级到本地日志，不能影响主聊天链路。
 */
export function createTraceService(db: D1Database, config: AgentTraceConfig): TraceService {
  return {
    async recordRun(input) {
      const run = normalizeRun(input, config);

      await insertRun(db, run);

      return run;
    },
    async recordSpan(input, sampled = true) {
      if (!sampled) {
        return null;
      }

      const span = normalizeSpan(input);

      await insertSpan(db, span);

      return span;
    },
    async recordTrace(input) {
      const run = normalizeRun(input.run, config);

      await insertRun(db, run);

      const spans: AgentSpanRecord[] = [];

      if (run.sampled) {
        for (const spanInput of input.spans ?? []) {
          const span = normalizeSpan(spanInput);

          await insertSpan(db, span);
          spans.push(span);
        }
      }

      return { run, spans };
    }
  };
}

function mapAgentRun(row: AgentRunRow): AgentRunRecord {
  return {
    traceId: row.trace_id,
    requestId: row.request_id,
    userId: row.user_id,
    companionId: row.companion_id,
    conversationId: row.conversation_id,
    threadId: row.thread_id,
    graphVersion: row.graph_version,
    graphPath: JSON.parse(row.graph_path || "[]") as string[],
    intent: row.intent,
    emotion: row.emotion,
    riskLevel: row.risk_level,
    strategy: row.strategy,
    status: row.status,
    degradedReason: row.degraded_reason,
    sampled: row.sampled === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    latencyMs: row.latency_ms,
    retentionUntil: row.retention_until,
    createdAt: row.created_at
  };
}

function mapAgentSpan(row: AgentSpanRow): AgentSpanRecord {
  return {
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    nodeName: row.node_name,
    status: row.status,
    latencyMs: row.latency_ms,
    model: row.model,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at
  };
}

/**
 * 按 traceId 查询一轮 Agent 执行和节点状态。
 */
export async function getAgentTraceByTraceId(db: D1Database, traceId: string) {
  const run = await db
    .prepare(
      `SELECT trace_id, request_id, user_id, companion_id, conversation_id, thread_id, graph_version, graph_path, intent, emotion, risk_level, strategy, status, degraded_reason, sampled, started_at, ended_at, latency_ms, retention_until, created_at
       FROM agent_runs
       WHERE trace_id = ?
       LIMIT 1`
    )
    .bind(traceId)
    .first<AgentRunRow>();

  if (!run) {
    return null;
  }

  const spans = await db
    .prepare(
      `SELECT trace_id, span_id, parent_span_id, node_name, status, latency_ms, model, input_summary, output_summary, error_code, error_message, started_at, ended_at, created_at
       FROM agent_spans
       WHERE trace_id = ?
       ORDER BY started_at ASC, span_id ASC`
    )
    .bind(traceId)
    .all<AgentSpanRow>();

  return {
    run: mapAgentRun(run),
    spans: spans.results.map(mapAgentSpan)
  };
}

/**
 * 清理超过保留周期的 Agent Trace。
 */
export async function deleteExpiredAgentTraces(db: D1Database, now = new Date().toISOString()) {
  const expiredRuns = await db
    .prepare("SELECT trace_id FROM agent_runs WHERE retention_until <= ?")
    .bind(now)
    .all<{ trace_id: string }>();
  const traceIds = expiredRuns.results.map((row) => row.trace_id);

  if (traceIds.length === 0) {
    return 0;
  }

  const placeholders = traceIds.map(() => "?").join(", ");

  await db
    .prepare(`DELETE FROM agent_spans WHERE trace_id IN (${placeholders})`)
    .bind(...traceIds)
    .run();
  await db
    .prepare(`DELETE FROM agent_runs WHERE trace_id IN (${placeholders})`)
    .bind(...traceIds)
    .run();

  return traceIds.length;
}
