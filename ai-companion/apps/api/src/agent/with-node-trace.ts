import { appendAgentTraceSpan, type AgentRuntimeContext } from "./agent-context";
import type { AgentTraceStatus } from "./agent-state";
import { sanitizeTraceSummary } from "./trace-service";

export type WithNodeTraceOptions<T> = {
  nodeName: string;
  parentSpanId?: string | null;
  model?: string | null;
  inputSummary?: string | null;
  outputSummary?: (result: T) => string | null | undefined;
  status?: (result: T) => AgentTraceStatus;
};

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      code: error.name || "Error",
      message: error.message
    };
  }

  return {
    code: "UnknownError",
    message: String(error)
  };
}

/**
 * 包装一个 Agent 节点并记录 Span。
 *
 * Span 先缓存到 RuntimeContext，等待 run 结束时由 recordTrace 统一写入，避免外键顺序问题。
 */
export async function withNodeTrace<T>(
  context: AgentRuntimeContext,
  options: WithNodeTraceOptions<T>,
  execute: () => Promise<T>
) {
  const spanId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  try {
    const result = await execute();
    const endedAt = new Date().toISOString();
    const status = options.status?.(result) ?? "ok";

    appendAgentTraceSpan(context, {
      traceId: context.traceId,
      spanId,
      parentSpanId: options.parentSpanId,
      nodeName: options.nodeName,
      status,
      model: options.model,
      inputSummary: options.inputSummary,
      outputSummary: options.outputSummary?.(result) ?? null,
      startedAt,
      endedAt
    });

    return result;
  } catch (error) {
    const endedAt = new Date().toISOString();
    const summary = errorSummary(error);

    appendAgentTraceSpan(context, {
      traceId: context.traceId,
      spanId,
      parentSpanId: options.parentSpanId,
      nodeName: options.nodeName,
      status: "error",
      model: options.model,
      inputSummary: options.inputSummary,
      errorCode: sanitizeTraceSummary(summary.code, 120),
      errorMessage: sanitizeTraceSummary(summary.message),
      startedAt,
      endedAt
    });

    throw error;
  }
}
