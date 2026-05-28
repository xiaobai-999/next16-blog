# 阶段 12：V1 记忆使用策略和评测集

## 目标

让 assistant 自然使用记忆，而不是暴露内部状态；同时建立可重复的记忆评测集，覆盖提取、召回、冲突、过期和自然使用。阶段 12 完成后，记忆系统应具备可验证的质量基线。

## 设计原则

- 用户当前输入优先于历史记忆。
- 记忆是辅助上下文，不是绝对事实。
- assistant 不直接说出内部记忆列表。
- 用户纠正时，assistant 应承认并进入记忆纠错流程。
- 评测集要覆盖“该记”“不该记”“该用”“不该用”。

## 前置条件

- 阶段 8 已完成记忆模型和写入策略。
- 阶段 9 已完成记忆管理和确认。
- 阶段 10 已完成质量规则。
- 阶段 11 已完成语义召回。

## 记忆自然使用 Prompt

更新：

```text
apps/api/src/services/context-builder.ts
packages/prompts
```

system context 建议：

```text
以下是用户长期偏好和背景，只在相关时自然使用。
不要每次都刻意提起“我记得你...”。
不要向用户暴露内部记忆列表。
不要把记忆当作绝对事实。
如果用户当前输入纠正了历史记忆，以用户当前说法为准。
如果你发现历史记忆可能过时或冲突，用自然方式确认，而不是直接断言。
```

## 不暴露内部记忆状态

禁止回复：

```text
根据我的记忆库...
我查到你的 memory type 是 preference...
你的 active memory 显示...
系统记录了你...
```

允许自然表达：

```text
那可以偏清淡一点。
我先按你现在说的来。
如果你愿意，我以后可以按这个偏好来回应。
```

## 用户纠正时的回复规则

当用户说：

```text
不是，我现在可以吃辣了。
你记错了。
以后别这么叫我。
```

assistant 应该：

```text
1. 接受用户当前说法。
2. 不争辩历史记忆。
3. 不暴露内部字段。
4. 如果涉及长期偏好变化，可轻量确认。
5. 后端通过记忆质量规则生成 pending_confirmation 或更新记忆。
```

示例：

```text
明白，那我按你现在的说法来：可以接受一点辣。以后推荐吃的我会把这个变化考虑进去。
```

## 用户当前输入优先于历史记忆

context-builder 或 prompt 必须明确：

```text
当前用户消息 > 当前会话最近消息 > active memories > 旧消息摘要
```

如果用户当前输入与历史记忆冲突：

```text
本轮回复按当前输入。
记忆更新交给 memory-quality / confirmation 流程。
不要在本轮回复中机械引用旧记忆。
```

## 评测集目录

建议新增：

```text
packages/evals/memory/
```

文件：

```text
memory-extraction-cases.json
memory-retrieval-cases.json
memory-conflict-cases.json
memory-expiration-cases.json
memory-usage-cases.json
README.md
```

第一版总数：

```text
30-50 条
```

## Test Case 格式

基础格式：

```json
{
  "id": "memory-food-preference-001",
  "category": "retrieval",
  "givenMemories": [
    {
      "type": "preference",
      "status": "active",
      "content": "用户不喜欢吃辣",
      "importance": 4,
      "confidence": 0.9
    }
  ],
  "userInput": "晚上吃什么？",
  "expectedBehavior": "推荐清淡或不辣的食物",
  "forbiddenBehavior": "推荐重辣火锅、川菜重辣选项"
}
```

提取评测：

```json
{
  "id": "memory-extract-preference-001",
  "category": "extraction",
  "conversation": [
    {
      "role": "user",
      "content": "以后回答我尽量短一点，直接给结论。"
    }
  ],
  "expectedMemories": [
    {
      "type": "preference",
      "contentIncludes": ["回答", "短", "直接"]
    }
  ],
  "forbiddenMemories": []
}
```

不应保存评测：

```json
{
  "id": "memory-noise-001",
  "category": "extraction",
  "conversation": [
    {
      "role": "user",
      "content": "哈哈今天太阳好大。"
    }
  ],
  "expectedMemories": [],
  "forbiddenBehavior": "保存一次性闲聊"
}
```

冲突评测：

```json
{
  "id": "memory-conflict-food-001",
  "category": "conflict",
  "givenMemories": [
    {
      "type": "preference",
      "status": "active",
      "content": "用户不吃辣"
    }
  ],
  "userInput": "我最近可以接受微辣了。",
  "expectedBehavior": "生成 pending_confirmation，指向旧记忆",
  "expectedFields": ["conflict_with_memory_id", "confirmation_reason"]
}
```

过期评测：

```json
{
  "id": "memory-expiration-event-001",
  "category": "expiration",
  "givenMemories": [
    {
      "type": "event",
      "status": "active",
      "content": "用户这周在准备面试",
      "expiresAt": "2026-05-01T00:00:00.000Z"
    }
  ],
  "now": "2026-05-28T00:00:00.000Z",
  "userInput": "今天做点什么？",
  "forbiddenBehavior": "把过期面试事件当成当前状态"
}
```

自然使用评测：

```json
{
  "id": "memory-natural-use-001",
  "category": "usage",
  "givenMemories": [
    {
      "type": "preference",
      "status": "active",
      "content": "用户不喜欢吃辣"
    }
  ],
  "userInput": "晚上吃什么？",
  "expectedBehavior": "自然推荐不辣或清淡选项",
  "forbiddenBehavior": "说出“根据我的记忆库”或“你的 active memory”"
}
```

## 评测执行方式

第一版可先做手动/半自动：

```text
1. 读取 JSON case。
2. 构造 memories 和 userInput。
3. 调用 extractor/retriever/context-builder 或人工对话。
4. 记录 expected/actual。
5. 标记 pass/fail。
```

后续可新增脚本：

```text
packages/evals/memory/run-memory-evals.ts
```

脚本输出：

```text
总用例数
通过数
失败数
失败原因
涉及模块
```

## 覆盖范围

至少覆盖：

```text
偏好提取
身份信息提取
relationship 提取
boundary 提取
event 提取和过期
不应保存的一次性闲聊
敏感信息过滤
记忆确认
记忆去重
记忆合并
记忆冲突
语义召回相关记忆
语义召回不相关记忆
自然使用记忆
用户当前输入纠正历史记忆
不暴露内部状态
```

## 任务清单

- [ ] 优化 context-builder 记忆 prompt。
- [ ] 明确当前输入优先级。
- [ ] 用户纠正时回复不争辩旧记忆。
- [ ] 禁止暴露内部记忆状态。
- [ ] 新增 memory evals 目录。
- [ ] 编写 30-50 条测试 case。
- [ ] 覆盖提取类 case。
- [ ] 覆盖召回类 case。
- [ ] 覆盖冲突类 case。
- [ ] 覆盖过期类 case。
- [ ] 覆盖自然使用类 case。
- [ ] 可选新增 eval runner。
- [ ] 补中文注释和 JSDoc。
- [ ] `pnpm typecheck` 通过。

## 验收标准

- [ ] assistant 能自然使用相关记忆。
- [ ] assistant 不频繁说“我记得你...”。
- [ ] assistant 不暴露内部记忆列表和状态。
- [ ] 用户当前输入与历史记忆冲突时，本轮回复优先当前输入。
- [ ] 用户纠正后，系统进入记忆更新或确认流程。
- [ ] 至少有 30 条记忆评测用例。
- [ ] 评测覆盖提取、召回、冲突、过期和自然使用。
- [ ] 每次修改记忆模块后可以复测核心用例。

## 不做事项

- 不做完整运营后台。
- 不做自动评分大模型裁判的强依赖。
- 不做语音/图片评测。
- 不做多 Agent 记忆评测。
