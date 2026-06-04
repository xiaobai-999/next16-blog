# 项目问题复盘：长期记忆 Active 但没有参与回复

## 背景

项目中已经实现了长期记忆系统，并在阶段 11 加入了语义记忆召回。预期行为是：用户保存“用户主要做 Next.js 前端开发”后，后续询问“帮我准备面试题”时，assistant 应该能自然围绕 Next.js / 前端方向给出建议。

## 问题现象

用户在 `/memories` 中看到一条记忆：

```text
用户主要做 Next.js 前端开发
```

但在聊天中要求准备面试题时，assistant 仍然反问“你的技术栈是什么”，没有使用这条记忆。

这说明问题不是“页面没有展示记忆”，而是“记忆没有进入模型上下文”。

## 排查路径

我没有直接改 prompt，而是先按链路排查：

1. 查询 `memories` 表，确认这条记忆是否存在。
2. 检查它的 `status`、`type`、`expires_at`、`deleted_at`、`archived_at`。
3. 查询 `memory_embeddings` 表，确认是否生成 embedding。
4. 对照 `context-builder` 和 `memory-retriever` 的过滤条件。
5. 判断是语义召回没命中，还是记忆被过滤掉。

最终查到这条记忆的数据是：

```text
type: event
status: active
content: 用户主要做 Next.js 前端开发
expires_at: 2025-12-01T00:00:00.000Z
created_at: 2026-06-04T06:39:16.893Z
```

`created_at` 是今天，说明这条记忆确实是当天创建的；但 `expires_at` 是 2025 年，已经过期。

聊天上下文读取时会过滤：

```sql
status = 'active'
deleted_at IS NULL
archived_at IS NULL
expires_at IS NULL OR expires_at > now
```

所以这条记忆虽然在页面上看起来是 active，但因为过期时间已经早于当前时间，实际不会进入 prompt。

## 根因

这个问题有两个根因。

第一，模型或编辑流程把一条稳定用户资料误归类成了 `event`。

```text
用户主要做 Next.js 前端开发
```

这类信息应该是 `profile`，不是 `event`。`event` 适合“用户下周要面试”“用户这周在准备项目复盘”这类短期事件。

第二，后端没有对 `expires_at` 做足够兜底。

当一条记忆从 `event` 被编辑为 `profile`，或者模型返回了一个已经过去的 `expiresAt` 时，服务端仍可能保留这个过期时间，导致出现“active 但永远不会注入上下文”的脏状态。

另外，阶段 11 的语义召回还有一个边界问题：如果某条记忆没有 embedding，`retrieveRelevantMemories` 可能返回空数组；而 `context-builder` 原先只有在召回异常时 fallback，没有在召回为空时 fallback。

## 修复方案

### 1. 规范化 expiresAt

在记忆创建和编辑路径中统一处理 `expiresAt`：

- 非 `event` 类型一律清空 `expires_at`。
- 过去时间一律清空。
- 编辑时如果从 `event` 改成 `profile` / `preference` / `boundary` / `relationship`，自动清空过期时间。

这样可以避免长期资料、偏好、边界类记忆被错误过期。

### 2. 修正自动提取的过期时间兜底

自动提取时，如果模型给了一个过去的 `expiresAt`，服务端不再直接使用，而是清空或重新推断。

模型可以提供候选字段，但最终能不能写入，必须由服务端规则兜底。

### 3. 召回为空时 fallback

`context-builder` 改为：

```text
优先语义召回；
如果语义召回失败或返回空数组；
回退到 listPromptMemories 固定排序。
```

这样即使 embedding 尚未生成，或者本地 Vectorize / embedding 临时失败，也不会导致所有长期记忆完全不参与回复。

### 4. 修正已有脏数据

将已有错误记录改为：

```text
type: profile
content: 用户主要做 Next.js 前端开发
expires_at: null
status: active
```

修正后，这条记忆满足上下文过滤条件，可以参与后续回复。

## 面试表达

这个问题我会这样回答：

我在做长期记忆系统时遇到过一个比较隐蔽的问题：记忆管理页里明明有一条 active 记忆“用户主要做 Next.js 前端开发”，但用户让 assistant 准备面试题时，模型仍然反问技术栈。

我排查时没有直接认为是 prompt 问题，而是从数据链路看：记忆是否存在、状态是否 active、是否被删除或归档、是否过期、是否有 embedding、最后是否进入 `context-builder`。最后发现这条记录虽然是当天创建的，但 `expires_at` 被写成了一个 2025 年的过去时间，所以它在页面上是 active，实际在上下文查询时被过滤掉了。

根因是记忆类型和过期时间治理不够严谨：稳定资料被错误标成了 event，且服务端没有在非 event 类型或过去 expiresAt 上做兜底。于是出现了 active 但不可用的脏记忆。

我的修复方式是把规则收敛到服务端：非 event 类型强制清空过期时间，过去的 expiresAt 不写入；编辑类型时也会自动规范化。同时，语义召回返回空时回退到固定 active 记忆列表，避免 embedding 缺失导致记忆完全不可用。

这个 case 的经验是：长期记忆不是简单的 CRUD，它有状态、类型、过期、召回和上下文注入多个环节。页面上看到 active 不代表模型一定能用，必须从数据治理和上下文构建两个层面保证一致性。

## 工程经验

- `active` 只是治理状态，不代表一定会进入模型上下文。
- 记忆是否可用还取决于 `deleted_at`、`archived_at`、`expires_at` 和 companion/user 隔离。
- `profile`、`preference`、`boundary` 这类稳定记忆不应该保留过期时间。
- LLM 提取出的类型和过期时间只能作为候选，不能完全信任。
- 语义召回为空不一定代表没有可用记忆，应该有固定排序 fallback。
- 记忆系统排障要看完整链路：提取、写入、治理、embedding、召回、prompt 注入。
