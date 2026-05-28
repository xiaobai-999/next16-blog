# 阶段 11：V1 语义记忆召回

## 目标

当记忆数量变多后，不再固定注入前 10 条记忆，而是根据当前用户输入召回最相关的记忆。阶段 11 完成后，系统应能通过 embedding / Vectorize 或等价向量库，在 `user_id + companion_id` 隔离下召回相关记忆，并按相似度、重要性、新鲜度和置信度排序。

## 设计原则

- 向量召回必须在权限过滤后使用，不能跨用户或跨伴侣泄露记忆。
- deleted/archived/pending/expired 记忆不能被召回。
- embedding 同步必须覆盖新增、编辑、删除、归档。
- 召回结果只是上下文候选，最终注入仍要经过 `context-builder` 过滤。
- 向量库不可作为唯一事实源，D1 `memories` 表仍是主数据源。

## 前置条件

- 阶段 8 已完成 V1 memory schema。
- 阶段 9 已完成编辑、软删除、确认。
- 阶段 10 已完成去重、合并、冲突、过期规则。

## 技术方向

使用：

```text
Embedding Model
Cloudflare Vectorize 或其他向量库
D1 memories 作为主数据源
```

建议 Worker 绑定：

```toml
[[vectorize]]
binding = "MEMORY_VECTORIZE"
index_name = "ai-companion-memories"
```

如果本地暂不支持 Vectorize，先抽象接口：

```text
memory-vector-store.ts
```

后续可切换实现。

## 数据模型补充

可新增字段：

```text
embedding_id
embedded_at
embedding_model
```

或者新增表：

```text
memory_embeddings
```

建议第一版新增表，避免污染主表：

```text
memory_embeddings
- memory_id
- user_id
- companion_id
- vector_id
- model
- content_hash
- created_at
- updated_at
```

`content_hash` 用于判断内容编辑后是否需要重新 embedding。

## embedding 生成

触发时机：

```text
记忆新增为 active
pending_confirmation 被确认成 active
记忆内容被编辑
合并后的记忆内容更新
```

不生成：

```text
pending_confirmation
deleted
archived
expired event
```

embedding 输入建议：

```text
type: preference
content: 用户不喜欢吃辣
importance: 4
```

不要把内部 ID、用户邮箱、系统 prompt 放入 embedding 文本。

## Vectorize 元数据

每条向量写入 metadata：

```json
{
  "memoryId": "memory-id",
  "userId": "user-id",
  "companionId": "companion-id",
  "type": "preference",
  "status": "active"
}
```

查询时必须过滤：

```text
userId = 当前用户
companionId = 当前伴侣
status = active
```

D1 回查时再次过滤：

```text
status = active
deleted_at IS NULL
archived_at IS NULL
expires_at IS NULL OR expires_at > now
```

## 语义召回流程

聊天请求进入后：

```text
1. 提取最新用户输入。
2. 对用户输入生成 query embedding。
3. Vectorize 查询 topK，例如 12。
4. 按 user_id + companion_id metadata 过滤。
5. 根据 memory_id 回查 D1。
6. 过滤非 active / deleted / archived / expired。
7. 按 ranking 规则重排。
8. 取 3-8 条注入 context-builder。
```

如果 Vectorize 或 embedding 失败：

```text
记录日志
回退到阶段 10 的 importance + confidence + updated_at 排序
不影响主聊天
```

## ranking 规则

综合：

```text
semantic_similarity
importance
recency
confidence
```

建议第一版得分：

```text
score =
  similarity * 0.55
  + normalizedImportance * 0.20
  + confidence * 0.15
  + recencyScore * 0.10
```

recencyScore：

```text
7 天内：1
30 天内：0.7
90 天内：0.4
更早：0.2
```

event 需要额外要求未过期。

## embedding 同步

### 新增

```text
active memory 新增后生成 embedding。
写入 Vectorize。
写入 memory_embeddings。
```

### 编辑

```text
content/type 更新后重新生成 embedding。
旧 vector 删除或 upsert 覆盖。
更新 memory_embeddings.content_hash。
```

### 删除

```text
软删除 memory 后删除 vector 或标记 metadata status=deleted。
推荐删除 vector，并保留 D1 memory_embeddings 记录用于审计。
```

### 归档

```text
archived 后删除 vector 或更新 metadata status=archived。
推荐删除 vector。
```

### 过期

```text
archiveExpiredMemories 执行后同步删除对应 vector。
```

## Service 建议

新增：

```text
apps/api/src/services/memory-embeddings.ts
apps/api/src/services/memory-retriever.ts
apps/api/src/services/memory-vector-store.ts
```

函数建议：

```ts
embedMemory(memory)
embedQuery(input)
upsertMemoryEmbedding(memory)
deleteMemoryEmbedding(memoryId)
retrieveRelevantMemories(db, env, input)
rankRetrievedMemories(results)
```

`context-builder` 调整：

```text
从 listPromptMemories 固定排序
升级为 retrieveRelevantMemories(userInput)
失败时 fallback listPromptMemories
```

## API 和环境变量

需要新增：

```text
EMBEDDING_PROVIDER
EMBEDDING_MODEL
EMBEDDING_API_KEY 或复用现有 LLM_API_KEY
```

如果使用 OpenAI：

```text
text-embedding-3-small
```

如果使用其他供应商，必须确认 Worker 兼容和维度。

## 本地开发策略

如果本地无法完整模拟 Vectorize：

```text
1. vector store 提供 in-memory/mock 实现。
2. typecheck 和 service 单测不依赖真实 Vectorize。
3. 手动联调时使用远程或 Wrangler 支持环境。
```

## 任务清单

- [ ] 新增 Vectorize 绑定或 vector store 抽象。
- [ ] 新增 memory_embeddings migration。
- [ ] 新增 embedding provider 配置。
- [ ] 实现 memory embedding 生成。
- [ ] active memory 新增后写入向量库。
- [ ] 记忆编辑后更新向量。
- [ ] 记忆删除后删除向量。
- [ ] 记忆归档后删除向量。
- [ ] 过期归档后同步向量。
- [ ] 实现 query embedding。
- [ ] 实现语义召回。
- [ ] 实现 user_id + companion_id 隔离。
- [ ] 实现 ranking。
- [ ] context-builder 接入语义召回。
- [ ] 召回失败回退固定排序。
- [ ] 补中文注释和 JSDoc。
- [ ] `pnpm typecheck` 通过。

## 验收标准

- [ ] 用户问饮食问题时能召回饮食偏好。
- [ ] 用户问工作学习问题时不会召回无关饮食记忆。
- [ ] 召回结果严格隔离 user_id。
- [ ] 召回结果严格隔离 companion_id。
- [ ] deleted/archived/pending/expired 记忆不会被召回。
- [ ] 编辑记忆后召回使用新内容。
- [ ] 删除记忆后召回不到该记忆。
- [ ] Vectorize 失败时聊天仍可回复。

## 不做事项

- 不做复杂 Agent 编排。
- 不做跨用户群体记忆。
- 不把向量库作为事实源。
- 不在聊天 UI 展示召回详情。
