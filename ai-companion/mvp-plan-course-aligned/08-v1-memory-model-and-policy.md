# 阶段 8：V1 记忆模型和写入策略

## 目标

把 V0 的基础 `memories` 表升级成 V1 可治理记忆模型，并建立记忆候选写入前的策略判断。阶段 8 完成后，系统应能表达一条记忆的类型、状态、置信度、来源、过期时间和确认原因，并且 `context-builder` 只会注入有效记忆。

## 设计原则

- `memory-extractor` 只负责提取候选记忆，不直接决定是否保存。
- `memory-policy` 负责判断候选记忆应该 `active`、`pending_confirmation`、`skip`。
- `context-builder` 只读取 `status = active` 且未过期的记忆。
- V1 模型字段一次预留后续冲突、确认和归档需要的数据，避免反复 migration。
- 不保存敏感隐私、模型推断、一次性闲聊。

## 前置条件

- 阶段 7 已完成。
- 当前单一连续聊天链路可用。
- V0 `memories` 表、`memory-extractor`、`context-builder` 已存在。

## 数据库升级

新增 migration，例如：

```text
packages/database/migrations/0002_v1_memory_model.sql
```

### 字段调整

当前 `memories` 表已有：

```text
id
user_id
companion_id
type
content
importance
source
source_message_id
created_at
updated_at
```

V1 需要新增：

```text
status
confidence
source_conversation_id
expires_at
archived_at
deleted_at
conflict_with_memory_id
confirmation_reason
```

### type 扩展

从：

```text
profile
preference
event
```

扩展为：

```text
profile
preference
event
relationship
boundary
```

### status 枚举

```text
active
archived
deleted
pending_confirmation
```

### 字段语义

```text
status：记忆当前状态，只有 active 可进入上下文。
confidence：模型提取置信度，范围建议 0-1。
source_conversation_id：来源会话 ID。
expires_at：记忆过期时间，主要用于 event。
archived_at：归档时间。
deleted_at：软删除时间。
conflict_with_memory_id：冲突时指向旧记忆。
confirmation_reason：需要确认或发生冲突时给用户看的简短原因。
```

### 数据迁移规则

已有 V0 记忆默认迁移为：

```text
status = active
confidence = 1
expires_at = null
archived_at = null
deleted_at = null
conflict_with_memory_id = null
confirmation_reason = null
```

### 索引建议

```text
idx_memories_active_context(user_id, companion_id, status, expires_at)
idx_memories_source_conversation(source_conversation_id)
idx_memories_conflict(conflict_with_memory_id)
```

## Shared Schema 升级

更新：

```text
packages/shared/src/schemas/memory.ts
packages/shared/src/schemas/common.ts
packages/shared/src/schemas/index.ts
```

新增或扩展：

```ts
memoryTypeSchema = z.enum([
  "profile",
  "preference",
  "event",
  "relationship",
  "boundary"
]);

memoryStatusSchema = z.enum([
  "active",
  "archived",
  "deleted",
  "pending_confirmation"
]);
```

`memorySchema` 增加：

```ts
status: memoryStatusSchema
confidence: z.number().min(0).max(1)
sourceConversationId: z.string().nullable()
expiresAt: z.string().nullable()
archivedAt: z.string().nullable()
deletedAt: z.string().nullable()
conflictWithMemoryId: z.string().nullable()
confirmationReason: z.string().nullable()
```

候选记忆 schema 建议：

```ts
candidateMemorySchema = z.object({
  type: memoryTypeSchema,
  content: z.string().min(1).max(500),
  importance: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300).optional(),
  expiresAt: z.string().datetime().nullable().optional()
});
```

## Service 拆分

新增：

```text
apps/api/src/services/memory-policy.ts
```

保留：

```text
apps/api/src/services/memory-extractor.ts
apps/api/src/services/memories.ts
apps/api/src/services/context-builder.ts
```

### memory-extractor 职责

```text
输入：最新 user message、assistant message、conversationId、companionId。
输出：候选记忆数组。
不做：状态判断、确认判断、去重、冲突处理、直接入库。
```

如果供应商不稳定支持 `generateObject`，改为：

```text
generateText -> JSON.parse -> Zod safeParse
```

解析失败时：

```text
记录 model_logs 错误
返回空候选记忆
不影响主聊天
```

### memory-policy 职责

输入候选记忆，输出写入决策：

```ts
type MemoryWriteDecision =
  | {
      action: "save";
      status: "active" | "pending_confirmation";
      confirmationReason?: string;
    }
  | {
      action: "skip";
      reason: string;
    };
```

基础判断：

```text
低风险 preference：可 active。
明确回答风格偏好：可 active。
普通 profile 且 confidence 高：可 active。
relationship：pending_confirmation。
boundary：pending_confirmation。
高重要性 profile：pending_confirmation。
event：可 active，但应带 expires_at 或留给阶段 10 策略补齐。
敏感隐私：skip。
模型推断：skip。
一次性闲聊：skip。
confidence 过低：skip 或 pending_confirmation。
```

## 记忆写入决策流程

聊天主回复完成后：

```text
1. memory-extractor 生成 candidate memories。
2. 对每条 candidate 调用 memory-policy。
3. action = skip：只写 debug 日志，不入库。
4. action = save + active：写入 memories，status = active。
5. action = save + pending_confirmation：写入 memories，status = pending_confirmation。
6. 记忆写入失败只记录日志，不影响主聊天回复。
```

写入时需要保存：

```text
source_message_id = 最新 user message id
source_conversation_id = 当前 conversation id
status
confidence
confirmation_reason
expires_at
```

## context-builder 调整

当前 `listPromptMemories` 应升级为只返回：

```text
user_id = 当前用户
companion_id = 当前伴侣
status = active
deleted_at IS NULL
archived_at IS NULL
expires_at IS NULL OR expires_at > now
```

排序第一版：

```text
importance DESC
confidence DESC
updated_at DESC
LIMIT 10
```

## API 影响

`GET /memories` 第一版可以返回所有非 deleted 记忆，也可以按状态过滤。阶段 8 不要求 UI 完整处理 pending，阶段 9 落地。

建议预留 query：

```text
GET /memories?status=active
GET /memories?status=pending_confirmation
```

## 任务清单

- [ ] 新增 V1 memory migration。
- [ ] 扩展 memory type。
- [ ] 新增 memory status。
- [ ] 新增 confidence/source_conversation_id/expires_at 等字段。
- [ ] 更新 shared memory schema。
- [ ] 新增 candidate memory schema。
- [ ] 新增 memory-policy service。
- [ ] 改造 memory-extractor 输出候选记忆。
- [ ] 改造 createExtractedMemories 写入 V1 字段。
- [ ] context-builder 只注入 active 且未过期记忆。
- [ ] 更新相关中文注释和 JSDoc。
- [ ] 本地 migration 可执行。
- [ ] `pnpm typecheck` 通过。

## 验收标准

- [ ] 旧记忆迁移后仍可被读取和注入。
- [ ] pending_confirmation 记忆不会进入 prompt。
- [ ] deleted/archived 记忆不会进入 prompt。
- [ ] expires_at 已过期的 event 不会进入 prompt。
- [ ] 低风险偏好可以直接 active。
- [ ] boundary/relationship 默认进入 pending_confirmation。
- [ ] 敏感或低置信度候选记忆不会保存。
- [ ] 记忆提取失败不影响聊天主回复。

## 不做事项

- 不做记忆编辑 UI。
- 不做确认/拒绝 UI。
- 不做冲突检测。
- 不做语义召回。
- 不做评测集。
