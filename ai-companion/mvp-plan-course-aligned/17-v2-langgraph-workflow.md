# 17：V2 LangGraph 工作流迁移

## Task ID

`V2-AGENT-004`

## Course Alignment

- `044-047`：图、状态、Reducer、条件边
- `048`：Checkpointer
- `050`：Streaming
- `051`：Command
- `059-061`：容错、实践、Runtime Context

## Goal

把已经验证的状态、分类、策略、V1 记忆能力迁移为单 Agent LangGraph 工作流，同时保持现有聊天 API 和流式 UI 行为。

LangGraph 是后端内部编排实现，不能破坏现有 `POST /chat`、AI SDK `useChat` 和 UIMessage 流式协议。

## Proposed Graph

```text
START
→ load_context
→ classify_input
→ route_safety
  ├─ high risk → generate_safety_response
  └─ normal → retrieve_memory
→ select_response_strategy
  ├─ memory correction → apply_memory_correction
  ├─ confirmation → request_confirmation
  └─ normal → generate_response
→ persist_assistant_message
→ extract_memory
→ finalize_trace
→ END
```

记忆提取和 Trace 后处理失败不得让已生成回复失败。

## Node Contracts

每个节点必须：

- 只读取需要的 State 字段。
- 返回部分状态更新，不直接修改全局对象。
- 通过 Runtime Context 获取 service。
- 定义超时、可重试性和降级结果。
- 记录节点级 Span。

## Tasks

- [ ] 安装并配置 LangGraph 依赖。
- [ ] 用阶段 14 的 State、Reducer 和 Context 创建 `StateGraph`。
- [ ] 实现各节点的输入输出契约。
- [ ] 实现条件边和明确终止条件。
- [ ] 配置 D1 持久化 Checkpointer；`InMemorySaver` 仅允许用于本地开发和单元测试。
- [ ] 使用 `conversationId` 作为稳定 `thread_id`。
- [ ] 接入 `messages` 流式模式，保持现有 token streaming。
- [ ] 实现 LangGraph stream 到 AI SDK UIMessage stream 的适配层。
- [ ] 保持 `POST /chat` 请求格式、`X-Conversation-Id` 和 `X-Trace-Id` 兼容。
- [ ] 定义稳定 `assistant_message_id`、`request_id` 和 idempotency key。
- [ ] 定义前后端流事件协议。
- [ ] 对分类、召回、生成、持久化分别定义容错策略。
- [ ] 为 assistant message 落库失败实现 pending persistence 和有限重试。
- [ ] 保留旧聊天链路作为 Feature Flag Fallback。
- [ ] 完成新旧链路结果对比。

## AI SDK Compatibility

必须继续支持：

```text
POST /chat
AI SDK useChat
AI SDK UIMessage stream
X-Conversation-Id
X-Trace-Id
```

流式适配层：

```text
LangGraph stream
→ graph-stream-adapter
→ AI SDK UIMessage stream
→ useChat
```

适配层负责：

- 将 LangGraph token/message stream 转换成现有 UIMessage 数据流。
- 保持文本增量顺序。
- 发送稳定的 assistant message id。
- 在响应头返回 conversation id 和 trace id。
- 将需要用户确认的中断转换为公开事件或 pending action 数据。
- 隐藏所有内部图状态。

## Streaming Events

建议只向前端暴露用户需要的事件：

```text
message_start
message_delta
message_end
confirmation_required
error
```

不要向普通 UI 暴露：

```text
intent label
emotion label
risk label
node name
memory ids
internal prompt
checkpoint data
model reasoning
```

`confirmation_required` 必须明确协议形态：可以是 UIMessage custom part、AI SDK data event，或只返回 pending action id 后由独立 API 查询。普通聊天 UI 不能依赖 LangGraph 节点名或内部分类标签。

## D1 Checkpointer

生产环境推荐表：

```text
agent_checkpoints
agent_checkpoint_writes
```

如果当前 LangGraph 适配不需要独立 writes 表，可以先只使用 `agent_checkpoints`，但必须保留扩展空间。

`agent_checkpoints` 至少包含：

```text
thread_id
conversation_id
user_id
companion_id
checkpoint_id
parent_checkpoint_id
checkpoint_data
metadata
checkpoint_version
serializer_version
created_at
updated_at
expires_at
```

索引建议：

```text
(user_id, conversation_id, thread_id)
(thread_id, checkpoint_id)
(expires_at)
```

任何读取、写入和恢复必须同时校验：

```text
thread_id
conversation_id
user_id
companion_id
```

不能只凭 `thread_id` 读取 Checkpoint。

必须定义：

- Checkpoint 保留周期。
- 过期 Checkpoint 清理任务。
- 会话删除后的级联清理。
- 用户删除账号后的完整清理。
- Checkpoint 大小限制。
- Checkpoint 数据版本升级方案。
- 敏感字段过滤和加密需求。

## Persistence Idempotency

需要处理这种失败：

```text
assistant 回复已流式发送给用户
→ assistant message 落库失败
```

策略：

```text
1. 回复开始前生成稳定 assistant_message_id。
2. message_id 作为数据库幂等键。
3. 流式完成后使用该 id 保存完整 assistant message。
4. 保存失败时记录 pending_persistence。
5. 使用 waitUntil 或队列执行有限重试。
6. 唯一约束防止重复消息。
7. 重试耗尽后将 Agent Run 标记为 degraded。
```

幂等要求：

- `messages.id` 必须唯一。
- 同一 assistant message 的重试必须使用相同 ID。
- 聊天请求支持客户端传入 `Idempotency-Key`。
- 服务端生成并记录 `request_id`，绑定 user message 和 assistant message。
- 客户端重试必须复用 idempotency key 才能避免重复写入。
- 图节点重试不能创建重复 assistant message。

如果重试耗尽，可以轻量提示：

```text
这条回复可能暂时无法保存。
```

不要中断已经完成的回复，也不要显示内部数据库错误。

## Error Policy

```text
分类失败       → fallback 分类结果，继续
记忆召回失败   → degraded，无记忆继续
模型生成失败   → 有限重试，失败后返回可重试错误
消息保存失败   → 标记 error，禁止假装成功持久化
记忆提取失败   → 回复成功，异步记录失败
Trace 失败      → 回复成功，本地日志降级
```

## Checkpointer Tests

- [ ] 同一 `thread_id` 可恢复状态。
- [ ] 不同用户不能读取对方 thread。
- [ ] 中断后使用相同 thread 恢复。
- [ ] 旧 conversation 的历史消息没有重复追加。
- [ ] 重试不会重复写入 assistant message。
- [ ] Worker 重启后仍可恢复图状态。
- [ ] 过期和已删除会话的 Checkpoint 能被清理。
- [ ] `useChat` 可以直接消费新图输出。
- [ ] 流式文本没有重复、丢失或顺序错乱。
- [ ] assistant 落库失败进入 pending persistence，重试不产生重复消息。

## Acceptance Criteria

- 现有 `POST /chat` 对前端保持兼容或有明确迁移层。
- 普通聊天可以通过图完成并流式返回。
- 高风险、纠错和普通聊天走不同 graph path。
- D1 Checkpointer 可以恢复 thread 状态，生产环境不依赖进程内存。
- 图中每个节点都有 Trace 和错误策略。
- 现有前端不需要理解 LangGraph 内部结构。
- 消息落库失败有可追踪状态、幂等重试和 degraded 标记。
- Feature Flag 可以快速切回旧链路。

## Deliverables

```text
companion-graph.ts
nodes/
routes/
graph-checkpointer.ts
graph-stream-adapter.ts
pending-persistence service
idempotency middleware / helper
chat feature flag
集成测试
```
