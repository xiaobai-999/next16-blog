# 阶段 5：记忆提取和记忆管理

## 目标

让电子伴侣具备基础长期记忆。这个阶段结束后，系统可以从对话中提取有价值的用户信息，并在后续对话中使用，同时用户可以管理这些记忆。

## 小册依据

- 004、009：记忆调度和混合记忆架构
- 035-036：LangChain memory 与持久化思路
- 058：LangGraph Store 长期记忆思路
- 102-115：Zod 与 LLM 结构化输出
- 123：AI SDK `generateObject`

## 前置条件

- 阶段 4 已完成
- 聊天记录可以保存和读取
- `memories` 表已可用

## 工程约定

- 第一版不接 Vectorize，不做 embedding 检索。
- 第一版只用 D1 按 `importance` 和时间排序读取记忆。
- 自动记忆提取使用结构化 JSON 输出，并用 Zod 校验。
- 记忆提取失败不能影响主聊天回复。
- 手动新增记忆的 `source` 为 `manual`。
- 自动提取记忆的 `source` 为 `extracted`。

## 任务清单

- [ ] 定义记忆类型
- [ ] 创建 memory service
- [ ] 实现记忆列表接口
- [ ] 实现手动新增记忆接口
- [ ] 实现删除记忆接口
- [ ] 实现记忆提取器
- [ ] 在聊天完成后触发记忆提取
- [ ] 将相关记忆注入 `context-builder`
- [ ] 创建记忆管理页面 `/memories`
- [ ] 验证下一轮对话能使用记忆
- [ ] 增加重复记忆过滤

## 记忆类型

第一版只保留 3 类：

```text
profile
preference
event
```

定义：

```text
profile: 用户稳定信息，例如职业、长期目标、身份背景
preference: 用户偏好，例如回答风格、语言偏好、互动禁忌
event: 用户近期重要事件，例如正在准备面试、最近在做某项目
```

## API 边界

```text
GET    /memories
POST   /memories
DELETE /memories/:id
```

可选：

```text
PATCH /memories/:id
```

## 手动新增记忆请求

```json
{
  "type": "preference",
  "content": "用户喜欢直接、结构化、少废话的回答",
  "importance": 3
}
```

## 记忆提取 Schema

```ts
export const extractedMemorySchema = z.object({
  type: z.enum(["profile", "preference", "event"]),
  content: z.string().min(1).max(500),
  importance: z.number().int().min(1).max(5),
});

export const memoryExtractionResultSchema = z.object({
  memories: z.array(extractedMemorySchema).max(3),
});
```

## 记忆提取规则

只保存满足以下条件的信息：

- 用户明确表达
- 后续对话有复用价值
- 不是一次性闲聊
- 不是敏感隐私
- 不是模型猜测

不要保存：

- 医疗隐私
- 财务隐私
- 身份证、手机号、住址等敏感信息
- 模型推断出的性格标签
- 临时情绪碎片

## 记忆提取 Prompt

```text
你是记忆提取器。
请从用户最新消息和上下文中提取值得长期保存的信息。
只提取用户明确表达的信息，不要猜测。
如果没有值得保存的信息，返回空数组。

可用类型：
- profile
- preference
- event

返回 JSON：
{
  "memories": [
    {
      "type": "preference",
      "content": "用户喜欢简洁直接的回答",
      "importance": 3
    }
  ]
}
```

## 去重策略

第一版采用简单规则：

```text
同一 user_id + companion_id 下，如果 content 完全相同，则不重复写入。
```

语义合并、版本历史和自动过期后续再做。

## 记忆注入策略

第一版直接按规则取：

```text
取当前 user_id + companion_id 下 importance 最高的 10 条记忆
同分时取 updated_at 较新的
```

注入 prompt 时使用独立区块：

```text
以下是用户允许系统长期记住的信息：
- [preference] 用户喜欢直接、结构化的回答
- [event] 用户最近在准备面试
```

后续再升级为：

```text
向量召回 + 类型过滤 + 重要性排序 + 时间衰减
```

## 记忆管理页

`/memories` 至少支持：

- 查看记忆
- 按类型分组
- 手动新增记忆
- 删除错误记忆

## 权限规则

- 用户只能查看自己的记忆。
- 用户只能删除自己的记忆。
- 删除记忆必须同时校验 `id` 和 `user_id`。

## 不做事项

- 不做向量库
- 不做记忆合并
- 不做记忆版本历史
- 不做自动过期
- 不做复杂置信度
- 不做用户确认弹窗
- 不做 LangGraph Store

## 验收标准

- [ ] 用户可以查看自己的记忆
- [ ] 用户可以手动新增记忆
- [ ] 用户可以删除记忆
- [ ] 系统可以从明确表达中提取记忆
- [ ] 系统不会把每句话都保存成记忆
- [ ] 系统不会保存敏感隐私信息
- [ ] 重复 content 不会重复写入
- [ ] 下一轮对话会使用已保存记忆
- [ ] 用户不能读取或删除别人的记忆
- [ ] 记忆提取失败不影响聊天主回复

## 阶段产出

- 记忆管理接口
- 记忆管理页面
- 初版 `memory-extractor`
- 支持记忆注入的 `context-builder`
- 可体现“它记得我”的聊天体验
