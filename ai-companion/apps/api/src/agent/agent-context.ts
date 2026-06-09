import type { AppEnv } from "../env";
import type { CreateAgentSpanInput, TraceService } from "./trace-service";

export type AgentRuntimeServices = {
  // memoryService：阶段 17 后由图节点注入记忆召回、写入和确认能力。
  memoryService?: unknown;
  // modelService：阶段 17 后由图节点注入模型调用能力，禁止进入 AgentState。
  modelService?: unknown;
  // traceService：节点包装器使用的 trace 写入接口。
  traceService: TraceService;
};

export type AgentRuntimeContext = {
  userId: string;
  companionId: string;
  conversationId: string;
  threadId: string;
  traceId: string;
  requestId: string;
  traceSpans: CreateAgentSpanInput[];
  services: AgentRuntimeServices;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type AgentRequestIds = {
  traceId: string;
  requestId: string;
};

/**
 * 根据 conversationId 生成稳定 threadId。
 *
 * 同一会话的多轮请求必须落到同一个 thread，便于后续 Checkpointer 恢复图状态。
 */
export function threadIdFromConversationId(conversationId: string) {
  return `thread:${conversationId}`;
}

/**
 * 为一次聊天请求生成唯一追踪 ID。
 */
export function createAgentRequestIds(): AgentRequestIds {
  return {
    traceId: crypto.randomUUID(),
    requestId: crypto.randomUUID()
  };
}

/**
 * 创建 Agent 运行时上下文。
 *
 * RuntimeContext 可以持有 service 和 Worker waitUntil，但这些依赖不得被合并进 AgentState。
 */
export function createAgentRuntimeContext(input: {
  userId: string;
  companionId: string;
  conversationId: string;
  traceId: string;
  requestId: string;
  traceService: TraceService;
  waitUntil?: (promise: Promise<unknown>) => void;
  env?: AppEnv["Bindings"];
}): AgentRuntimeContext {
  void input.env;

  return {
    userId: input.userId,
    companionId: input.companionId,
    conversationId: input.conversationId,
    threadId: threadIdFromConversationId(input.conversationId),
    traceId: input.traceId,
    requestId: input.requestId,
    traceSpans: [],
    services: {
      traceService: input.traceService
    },
    waitUntil: input.waitUntil
  };
}

/**
 * 追加一个节点 span 到当前请求内存缓冲区。
 *
 * 节点执行时 agent_runs 可能还未落库，因此 span 必须等 run 结束后由 recordTrace 统一写入。
 */
export function appendAgentTraceSpan(context: AgentRuntimeContext, span: CreateAgentSpanInput) {
  context.traceSpans.push(span);
}

/**
 * 取出并清空当前请求缓存的节点 span。
 */
export function drainAgentTraceSpans(context: AgentRuntimeContext) {
  const spans = [...context.traceSpans];

  context.traceSpans.length = 0;

  return spans;
}
