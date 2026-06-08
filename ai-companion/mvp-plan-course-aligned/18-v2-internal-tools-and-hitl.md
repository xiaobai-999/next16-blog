# 18：V2 内部工具与 Human-in-the-loop

## Task ID

`V2-AGENT-005`

## Course Alignment

- `040-041`：Tool Calling 与单 Agent 多工具
- `049`：ReAct Agent
- `051`：Command
- `052-053`：Interrupt 与 Human-in-the-loop
- `058`：Store 与长期记忆
- `059`：人工介入作为容错

## Goal

为 Agent 增加少量受控内部工具，并用 `interrupt` 处理需要用户确认的动作。V2 不允许模型自由调用任意外部能力。

## Allowed Internal Tools

第一版白名单：

```text
propose_memory_update
apply_confirmed_memory_update
archive_memory
update_companion_preference
```

可选：

```text
create_light_reminder
```

只有项目已经具备可靠提醒基础设施时才加入提醒。

## Tool Contract

每个工具必须具备：

```text
Zod 输入 Schema
当前 user_id / companion_id 归属检查
幂等键
权限判断
结构化结果
错误码
Trace Span
```

禁止模型直接提供：

```text
user_id
companion_id
数据库主键归属
权限级别
```

这些必须从 Runtime Context 获取。

## HITL Boundary

阶段 18 负责：

- 用 `interrupt` 暂停图。
- 向前端返回待确认动作。
- 接收确认或拒绝。
- 使用相同 `thread_id` 恢复。
- 确认后调用已授权工具。

V1 负责：

- 记忆是否重复、冲突、过期。
- 哪种记忆需要确认的业务规则。
- 记忆数据的编辑、归档和状态变更规则。

V2 不复制 V1 的记忆质量判断，只编排确认流程。

## Store 与长期记忆边界

课程中的 LangGraph Store 只能作为可选运行时适配层，不能替代现有记忆系统。

事实源划分：

```text
D1 memories             = 长期记忆事实源
memory_embeddings       = 语义检索索引
LangGraph Store         = 可选运行时适配层
Checkpointer            = 图执行状态
```

如果引入 Store，只允许：

```text
适配 LangGraph 的长期记忆访问接口
调用现有 memory service
提供运行时缓存
向图暴露统一 search/get 接口
```

Store 不得创建：

```text
第二套长期记忆事实源
新的记忆写入规则
新的冲突规则
新的过期规则
独立于 D1 的用户记忆生命周期
```

所有写入必须经过：

```text
Agent / Tool
→ existing memory service
→ V1 memory policy and quality rules
→ D1 memories
→ embedding synchronization
```

不能绕过 V1 记忆规则直接写 Store。

## Confirmation Payload

```ts
type PendingAction = {
  id: string;
  type: "memory_update" | "memory_conflict" | "companion_setting";
  summary: string;
  proposedValue: unknown;
  reasonCode: string;
};
```

不要把完整内部 Prompt、模型推理或敏感来源内容返回前端。

## Tasks

- [ ] 定义工具注册表和白名单。
- [ ] 为每个工具定义 Zod Schema。
- [ ] 工具执行前从 Runtime Context 校验归属。
- [ ] 为有副作用工具增加幂等键。
- [ ] 对重要记忆和冲突更新接入 `interrupt`。
- [ ] 实现确认、拒绝和取消 API。
- [ ] 使用相同 thread 恢复图执行。
- [ ] 确认前不执行副作用。
- [ ] 拒绝后结束待确认动作，不重复询问。
- [ ] 记录工具调用和确认结果到 Trace。
- [ ] 为工具失败增加重试或人工可恢复状态。
- [ ] 定义 Store adapter 接口，读取和写入都复用现有 memory service。
- [ ] 确保 Checkpointer 数据不得混入长期记忆。
- [ ] 测试 Store 缓存失效后仍能从 D1 恢复。

## API Sketch

```text
GET  /agent/pending-actions
POST /agent/pending-actions/:id/confirm
POST /agent/pending-actions/:id/reject
```

接口必须校验：

```text
当前登录用户
conversation/thread 归属
pending action 状态
动作是否已经处理
```

## Tests

- [ ] 未确认前数据库没有副作用。
- [ ] 用户确认后工具只执行一次。
- [ ] 重复确认请求不会重复更新。
- [ ] 用户拒绝后图可以正常结束。
- [ ] 用户不能确认别人的 pending action。
- [ ] 恢复时使用错误 thread 会被拒绝。
- [ ] 工具参数校验失败不会破坏 conversation。
- [ ] 模型不能绕过白名单调用未注册工具。
- [ ] Store 清空不会导致长期记忆丢失。
- [ ] Checkpoint 清理不会删除用户长期记忆。
- [ ] 所有记忆写入仍经过 V1 规则和 embedding 同步。

## Acceptance Criteria

- Agent 只能调用白名单内部工具。
- 有副作用动作具备身份校验和幂等性。
- 重要操作可以暂停、确认和恢复。
- V1 记忆规则被复用，没有第二套冲突或过期逻辑。
- D1 `memories` 是唯一长期记忆事实源。
- Store 只是图运行适配层或缓存层，不产生第二套长期记忆。
- 工具失败可追踪且不会伪装成功。

## Deliverables

```text
tool-registry.ts
internal-tools/
pending-action-service.ts
hitl-nodes.ts
store-adapter.ts
pending action API
确认 UI
集成测试
```
