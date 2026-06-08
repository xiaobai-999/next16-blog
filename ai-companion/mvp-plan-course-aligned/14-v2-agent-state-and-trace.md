# 14：V2 Agent 状态与 Trace 基座

## Task ID

`V2-AGENT-001`

## Course Alignment

- `043`：Tracing
- `045`：StateGraph 与节点
- `046`：Reducer 与状态合并
- `048`：Checkpointer
- `061`：Runtime Context
- `016-018`：Trace、Span、Workers 异步写入

## Goal

先定义一轮 Agent 执行中哪些数据属于状态、哪些属于运行时上下文，以及如何记录节点级 Trace。此阶段不改变现有聊天行为。

## State Boundary

建议 `AgentState` 包含会随图流转、被节点更新的数据：

```ts
type AgentState = {
  messages: ChatMessage[];
  currentInput: string;
  intent?: IntentResult;
  emotion?: EmotionResult;
  risk?: RiskResult;
  retrievedMemories: RetrievedMemory[];
  responseStrategy?: ResponseStrategy;
  assistantDraft?: string;
  assistantMessageId?: string;
  pendingAction?: PendingAction;
  errors: AgentNodeError[];
};
```

需要 Reducer 的字段：

```text
messages             按消息语义合并
retrievedMemories    按 memory id 去重
errors               追加，不覆盖
```

建议 `RuntimeContext` 包含不应持久化进业务状态的依赖：

```ts
type AgentRuntimeContext = {
  userId: string;
  companionId: string;
  conversationId: string;
  traceId: string;
  requestId: string;
  services: {
    memoryService: MemoryService;
    modelService: ModelService;
    traceService: TraceService;
  };
};
```

## Tasks

- [ ] 定义 `AgentState` 和所有子类型。
- [ ] 定义 Reducer，明确覆盖、追加和去重语义。
- [ ] 定义 `RuntimeContext`，禁止把 service、密钥、数据库连接放进 State。
- [ ] 建立 `conversationId -> threadId` 规则。
- [ ] 为每次聊天请求生成 `traceId` 和 `requestId`。
- [ ] 定义 Trace 和 Span 数据结构。
- [ ] 设计 `agent_runs` 和 `agent_spans` 数据表或等价结构。
- [ ] 为 Trace 增加采样策略、保留周期和过期清理字段。
- [ ] 实现节点执行包装器，记录开始、结束、耗时、状态和错误。
- [ ] 为敏感字段实现脱敏，禁止保存完整系统 Prompt 和密钥。
- [ ] Trace 写入放到异步后处理，不阻塞流式回复。
- [ ] 为 Trace 写入失败增加本地日志降级。

## Trace Fields

```text
trace_id
request_id
user_id
companion_id
conversation_id
thread_id
node_name
node_status: ok | error | degraded
started_at
ended_at
latency_ms
model
input_summary
output_summary
error_code
error_message
```

分类结果、记忆 ID 和策略可以保存；不要默认保存完整私人对话文本。

## Production Trace Model

阶段 14 只搭建数据模型和写入接口，不做完整指标平台。建议最少拆成：

```text
agent_runs     一轮 Agent 执行摘要
agent_spans    单个节点、工具、模型或持久化动作的执行记录
```

`agent_runs` 至少包含：

```text
trace_id
request_id
conversation_id
user_id
companion_id
thread_id
graph_version
graph_path
intent
emotion
risk_level
strategy
status: ok | error | degraded
degraded_reason
sampled
started_at
ended_at
latency_ms
retention_until
```

`agent_spans` 至少包含：

```text
trace_id
span_id
parent_span_id
node_name
status: ok | error | degraded
latency_ms
input_summary
output_summary
error_code
error_message
started_at
ended_at
```

采样策略：

```text
错误运行              100% 保存
degraded 运行         100% 保存
高风险安全路由        100% 保存脱敏元数据
普通成功运行          按比例采样
内部开发和灰度用户    提高采样比例
```

采样比例必须可配置，采样决定本身也要写入 `agent_runs.sampled`。

## Privacy Boundary

Trace 和 Checkpoint 都遵守最小化存储原则。禁止保存：

```text
完整对话
完整 system prompt
API Key
Cookie
Authorization header
密码
数据库连接信息
完整 checkpoint data
```

只保存必要摘要、枚举值、ID、耗时和错误码。Trace 中如需保存输入输出摘要，必须先脱敏并截断。

## Code Boundary

阶段 14 同时定义 Agent 模块边界：

共享层只放公开协议和稳定枚举：

```text
公开 Agent event schema
UIMessage event 类型
pending confirmation payload
public error code
```

分类 schema、risk schema、response strategy enum 可以放在共享包供后端和评测复用，但普通聊天 UI 不直接消费这些内部标签。

后端内部实现保留在 API 内部：

```text
LangGraph graph
nodes
routing logic
tool implementations
checkpointer
trace service
prompt templates
memory service calls
model service calls
stream adapter implementation
```

Prompt、节点、工具、数据库访问、密钥和模型客户端不得放入前端共享层。

## Tests

- [ ] 同一 conversation 的多轮请求使用稳定 `threadId`。
- [ ] 不同请求生成不同 `traceId`。
- [ ] Reducer 不会覆盖已有 messages。
- [ ] 重复 memory id 不会被追加两次。
- [ ] 节点抛错时 Span 状态为 `error`。
- [ ] 降级执行时 Span 状态为 `degraded`。
- [ ] Trace 服务不可用时用户仍能收到回复。
- [ ] Trace 中不存在 API Key、Cookie、密码和完整认证头。
- [ ] 可以通过 `traceId` 查询一轮 graph path 和关键节点状态。
- [ ] 普通成功请求按采样策略写入，错误和降级请求全量写入脱敏 Trace。

## Acceptance Criteria

- 状态和运行时上下文边界明确并有类型约束。
- 每轮对话具备稳定 `threadId` 和唯一 `traceId`。
- 任意节点可以使用统一包装器记录 Span。
- Trace 不阻塞主链路且经过隐私脱敏。
- Trace 具备采样、保留周期和过期清理策略。
- 共享协议与后端 Agent 内部实现边界明确。
- 当前 V1 聊天功能没有行为回归。

## Deliverables

```text
agent-state.ts
agent-context.ts
agent-reducers.ts
trace-service.ts
with-node-trace.ts
agent-run schema / migration
agent-span schema / migration
相关数据库 migration
单元测试
```
