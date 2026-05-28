# 阶段 9：V1 记忆管理和确认闭环

## 目标

在设置页提供用户可控的记忆管理能力，并完整落地 `pending_confirmation` 的确认/拒绝流程。阶段 9 完成后，用户可以查看、编辑、软删除记忆，也可以处理系统认为需要确认的候选记忆。

## 设计原则

- 聊天主界面不暴露内部记忆列表和调试字段。
- 记忆管理属于设置页或独立记忆页。
- 用户可以纠正系统记错的信息。
- 删除采用软删除，避免破坏来源追踪和后续评测。
- `pending_confirmation` 在用户确认前不能进入 `context-builder`。

## 前置条件

- 阶段 8 已完成。
- `memories` 表已有 `status`、`confidence`、`confirmation_reason` 等字段。
- `context-builder` 已过滤 pending/deleted/archived/expired 记忆。

## 页面规划

当前已有：

```text
/memories
```

阶段 9 可保留该路径，或后续迁移为：

```text
/settings/memories
```

V1 页面分区：

```text
待确认
长期记忆
已归档（可选）
已删除（默认不展示）
```

## UI 不暴露内部调试字段

页面可以展示：

```text
记忆内容
类型
状态的人类可读文案
重要性
来源：自动提取 / 手动
更新时间
确认原因
```

页面不展示：

```text
user_id
companion_id
source_message_id 原始 ID
source_conversation_id 原始 ID
conflict_with_memory_id 原始 ID
embedding id
内部 prompt
完整系统上下文
```

如需展示来源，使用人类可读摘要：

```text
来自最近一次对话
来自你手动添加
因为可能影响长期回复方式，需要确认
```

## API 设计

新增或完善：

```text
GET    /memories
PATCH  /memories/:id
DELETE /memories/:id
POST   /memories/:id/confirm
POST   /memories/:id/reject
```

### GET /memories

支持 query：

```text
status=active
status=pending_confirmation
includeArchived=true
```

默认返回：

```text
status IN ('active', 'pending_confirmation')
deleted_at IS NULL
```

### PATCH /memories/:id

允许用户编辑：

```text
type
content
importance
expires_at
```

更新规则：

```text
只能修改自己的记忆。
不能修改 deleted 记忆。
编辑后 updated_at 更新。
编辑 pending_confirmation 记忆时可保持 pending，也可确认后变 active。
```

### DELETE /memories/:id

软删除：

```text
status = deleted
deleted_at = now
updated_at = now
```

删除后：

```text
不进入 context-builder
不进入语义召回
后续 embedding 同步在阶段 11 处理
```

### POST /memories/:id/confirm

确认待确认记忆：

```text
status 从 pending_confirmation 变 active
updated_at = now
confirmation_reason 可保留
```

约束：

```text
只能确认自己的记忆。
只能确认 pending_confirmation。
deleted 记忆不能确认。
```

### POST /memories/:id/reject

拒绝待确认记忆：

```text
status = deleted 或 archived
deleted_at / archived_at = now
updated_at = now
```

建议第一版使用：

```text
status = deleted
deleted_at = now
```

## “记错了”反馈进入纠错流程

当前阶段 7 已有：

```text
记错了 -> feedback.rating = down, reason = "[memory_error]"
```

阶段 9 的处理建议：

```text
1. 用户在某条 assistant 回复上点击“记错了”。
2. 前端提交 feedback。
3. 前端给出轻量入口：去记忆设置页检查。
4. 记忆设置页展示 active/pending 记忆，用户可编辑或删除错误记忆。
```

不建议阶段 9 做自动定位错误记忆，除非已有简单关联：

```text
source_message_id
source_conversation_id
```

可选增强：

```text
GET /memories?sourceConversationId=xxx
```

## 前端任务

更新：

```text
apps/web/app/memories/page.tsx
apps/web/lib/api.ts
```

新增 API client：

```ts
updateMemory(id, input)
confirmMemory(id)
rejectMemory(id)
```

页面能力：

```text
加载 active + pending_confirmation 记忆
按 type 分组
待确认区域优先展示
编辑 content/type/importance/expiresAt
删除记忆
确认记忆
拒绝记忆
返回聊天
退出登录
```

## 后端任务

更新：

```text
apps/api/src/routes/memories.ts
apps/api/src/services/memories.ts
packages/shared/src/schemas/memory.ts
packages/shared/src/schemas/index.ts
apps/web/lib/api.ts
```

Service 函数建议：

```ts
listMemories(db, userId, filters)
updateMemory(db, userId, id, input)
softDeleteMemory(db, userId, id)
confirmMemory(db, userId, id)
rejectMemory(db, userId, id)
```

所有查询必须带：

```text
user_id = 当前用户
```

## 任务清单

- [ ] 扩展 shared updateMemory schema。
- [ ] 扩展 memories route：PATCH。
- [ ] 扩展 memories route：confirm。
- [ ] 扩展 memories route：reject。
- [ ] DELETE 改为软删除。
- [ ] listMemories 支持 status 过滤。
- [ ] 记忆页展示 pending_confirmation。
- [ ] 记忆页支持编辑。
- [ ] 记忆页支持确认。
- [ ] 记忆页支持拒绝。
- [ ] 记忆页支持软删除。
- [ ] “记错了”反馈后提供进入记忆管理的轻量入口。
- [ ] UI 不展示内部 ID 和调试字段。
- [ ] 补中文注释和 JSDoc。
- [ ] `pnpm typecheck` 通过。

## 验收标准

- [ ] 用户可以看到 active 记忆。
- [ ] 用户可以看到 pending_confirmation 记忆。
- [ ] 用户可以确认待确认记忆。
- [ ] 用户可以拒绝待确认记忆。
- [ ] 用户可以编辑记忆内容。
- [ ] 用户可以软删除错误记忆。
- [ ] 删除后的记忆不会影响后续回复。
- [ ] pending 记忆确认前不会影响回复。
- [ ] 普通用户不能访问或修改他人的记忆。
- [ ] 页面不暴露内部调试字段。

## 不做事项

- 不做冲突检测生成。
- 不做向量召回。
- 不做完整后台运营页。
- 不做自动定位“哪条记忆错了”的复杂算法。
