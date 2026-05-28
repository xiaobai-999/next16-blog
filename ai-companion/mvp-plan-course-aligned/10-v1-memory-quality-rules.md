# 阶段 10：V1 记忆质量规则

## 目标

建立记忆去重、合并、冲突和过期规则，让记忆库长期保持准确、紧凑和可用。阶段 10 完成后，系统不会反复保存相似记忆，不会同时使用冲突记忆，临时事件会按策略过期。

## 设计原则

- 质量规则发生在候选记忆写入前和上下文读取前。
- 相似记忆优先合并，不重复新增。
- 冲突记忆不直接覆盖，先进入 `pending_confirmation`。
- 临时事件可以过期，过期后不再影响回复。
- 规则必须可解释，必要时写入 `confirmation_reason`。

## 前置条件

- 阶段 8 已完成 V1 memory schema。
- 阶段 9 已完成 pending confirmation 的确认/拒绝闭环。
- `conflict_with_memory_id` 和 `confirmation_reason` 字段已存在。

## 质量规则执行时机

### 写入前

候选记忆来自 `memory-extractor` 后，执行顺序：

```text
1. 基础 policy 判断：skip / active / pending。
2. 敏感信息过滤。
3. 同类型记忆查询。
4. 去重判断。
5. 合并判断。
6. 冲突判断。
7. event 过期时间推断。
8. 最终写入 active 或 pending_confirmation。
```

### 读取前

`context-builder` 和后续语义召回都必须过滤：

```text
status = active
deleted_at IS NULL
archived_at IS NULL
expires_at IS NULL OR expires_at > now
```

### 定时或懒执行

过期归档可使用：

```text
懒执行：每次 list/context-builder 时过滤过期。
显式扫描：提供 service 函数 archiveExpiredMemories。
```

第一版建议：

```text
先做读取过滤，再提供 archiveExpiredMemories 供后续 cron 或手动 debug 使用。
```

## 记忆去重

### 目标

避免完全相同或高度相似的内容重复保存。

### 第一版规则

精确去重：

```text
同 user_id
同 companion_id
同 type
status = active
content 标准化后完全相同
```

标准化：

```text
trim
连续空白合并
中文全角/半角暂不处理
大小写仅对英文可 lower-case
```

命中重复时：

```text
不新增记忆
更新旧记忆 updated_at
importance = max(old.importance, new.importance)
confidence = max(old.confidence, new.confidence)
```

## 记忆合并

### 目标

当新记忆是旧记忆的补充，不新增碎片，而是合并为更准确的一条。

### 第一版合并范围

```text
preference
profile
relationship
boundary
```

`event` 默认不合并，除非后续明确是同一事件。

### 合并判断

第一版可使用模型或规则。

规则版：

```text
同 type
内容关键词高度重叠
没有明显否定或反向词
```

模型版：

```text
输入旧记忆和候选记忆
输出 duplicate / merge / conflict / separate
如果 merge，返回 mergedContent
```

建议第一版：

```text
精确去重先落地。
语义合并可以用 LLM 判断，但失败时回退为 separate。
```

合并后：

```text
更新旧记忆 content
importance = max
confidence = max 或加权平均
updated_at = now
保留 source_message_id 原值
可后续扩展 memory_sources 表记录多来源
```

## 记忆冲突检测

### 目标

用户偏好变化时，不同时注入互相矛盾的记忆。

### 冲突判断范围

优先处理：

```text
preference
boundary
relationship
```

示例：

```text
旧：用户不吃辣。
新：用户最近可以接受微辣。
```

### 冲突处理

检测到冲突后，不直接归档旧记忆。新记忆写入：

```text
status = pending_confirmation
conflict_with_memory_id = 旧记忆 id
confirmation_reason = "这条新记忆可能和已有记忆冲突，需要确认。"
```

待用户确认：

```text
确认新记忆：
  新记忆 status = active
  旧记忆 status = archived
  旧记忆 archived_at = now

拒绝新记忆：
  新记忆 status = deleted
  新记忆 deleted_at = now
  旧记忆保持 active
```

确认/拒绝 API 已在阶段 9 建立，阶段 10 补充冲突确认后的联动逻辑。

## conflict_with_memory_id / confirmation_reason

### 字段使用规则

`conflict_with_memory_id`：

```text
只在 pending_confirmation 冲突记忆上设置。
指向当前用户同 companion 下的 active 旧记忆。
确认后可保留用于审计。
```

`confirmation_reason`：

```text
用于解释为什么需要确认。
必须是用户可读文案。
不得包含内部 ID、prompt 或模型原始输出。
```

示例：

```text
我之前记得你不太吃辣，现在你说可以接受微辣。需要确认以后按哪个为准。
```

## event 过期策略

### 默认规则

```text
profile：默认不过期
preference：默认不过期
relationship：默认不过期
boundary：默认不过期
event：默认可过期
```

### event expires_at 推断

第一版规则：

```text
包含明确日期：过期时间 = 日期结束后
包含“今天”：expires_at = 明天 00:00
包含“这周”：expires_at = 7 天后
包含“最近/近期”：expires_at = 14 天后
无明确时间但 type=event：expires_at = 14 天后
```

LLM 候选记忆如果返回 `expiresAt`，仍需服务端兜底校验。

## 过期扫描和归档规则

### 读取过滤

所有上下文读取必须先过滤过期：

```text
expires_at IS NULL OR expires_at > now
```

### 归档扫描

新增 service：

```ts
archiveExpiredMemories(db, now)
```

执行：

```text
status = archived
archived_at = now
updated_at = now
WHERE status = active
AND expires_at IS NOT NULL
AND expires_at <= now
```

第一版可以不接 cron，只在 debug 或后续部署任务中调用。

## Service 建议

新增：

```text
apps/api/src/services/memory-quality.ts
```

函数建议：

```ts
normalizeMemoryContent(content)
findDuplicateMemory(db, input)
mergeMemory(db, oldMemory, candidate)
detectMemoryConflict(db, candidate)
inferMemoryExpiresAt(candidate, now)
archiveExpiredMemories(db, now)
applyMemoryQualityRules(db, candidate)
```

## 任务清单

- [ ] 新增 memory-quality service。
- [ ] 实现内容标准化。
- [ ] 实现精确去重。
- [ ] 实现重复记忆更新策略。
- [ ] 实现基础合并判断。
- [ ] 实现冲突检测。
- [ ] 冲突时生成 pending_confirmation。
- [ ] 写入 conflict_with_memory_id。
- [ ] 写入 confirmation_reason。
- [ ] 确认冲突新记忆后归档旧记忆。
- [ ] 拒绝冲突新记忆后保留旧记忆。
- [ ] 实现 event expires_at 推断。
- [ ] context-builder 继续过滤过期。
- [ ] 实现 archiveExpiredMemories。
- [ ] 补中文注释和 JSDoc。
- [ ] `pnpm typecheck` 通过。

## 验收标准

- [ ] 完全相同记忆不会重复新增。
- [ ] 重复记忆会更新 importance/confidence/updated_at。
- [ ] 可合并记忆会生成更准确内容。
- [ ] 明显冲突记忆进入 pending_confirmation。
- [ ] 冲突记忆带 conflict_with_memory_id。
- [ ] 冲突记忆带用户可读 confirmation_reason。
- [ ] 用户确认新冲突记忆后，旧记忆归档。
- [ ] 用户拒绝新冲突记忆后，旧记忆仍 active。
- [ ] event 默认带合理 expires_at。
- [ ] 过期 event 不进入上下文。

## 不做事项

- 不做 Vectorize。
- 不做 embedding。
- 不做复杂多来源表。
- 不做运营后台。
