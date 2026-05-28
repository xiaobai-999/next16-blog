# 阶段 7：V0 聊天体验优化

## Context

当前 V0 已经实现基础文字对话、消息持久化、记忆提取、模型日志和反馈接口，但界面表达和部分会话状态同步仍偏工程化。阶段 7 用于把体验收敛成文字型 AI Companion：

- 聊天页应该是一条持续贯穿的伴侣对话，不应该把普通聊天切成多个显性会话。
- 记忆应该由系统自动判断和存储，不应作为聊天主界面的显性操作。
- 用户邮箱、关系字段、当前会话标题、长期记忆等系统上下文不应直接暴露在聊天页主界面。
- 反馈要保留数据价值，但不能像客服问卷一样破坏陪伴感。

## Global Principles

- 聊天页只呈现陪伴体验，不呈现系统调试信息。
- `conversation` 表示一段连续聊天，`message` 表示该聊天内的一条消息。
- `memory` 是内部上下文，由 `context-builder` 使用，不默认展示在聊天主界面。
- 反馈入口应该轻量、隐藏、贴近伴侣语境。
- 记忆提取失败不能影响主聊天回复。

## Execution Order

1. `OPT-001`: 稳固会话连续性
2. `OPT-002`: 清理聊天顶部系统信息
3. `OPT-003`: 移除聊天主界面的记忆按钮
4. `OPT-004`: 重做反馈入口
5. `OPT-005`: 移除左侧会话列表
6. `OPT-006`: 优化记忆参与生成方式

---

## OPT-001: 稳固会话连续性

### Priority

P0

### Problem

当前代码已经支持携带 `conversationId` 继续写入同一段会话；进入聊天页时也会加载最近会话。阶段 7 进一步收敛为单一连续聊天：即使前端暂时没有传 `conversationId`，后端也应该复用当前伴侣最近会话，而不是直接创建新会话。

### Goal

同一个聊天窗口内，用户和伴侣的多轮消息必须持续追加到同一个 `conversationId` 下，形成持续贯穿的上下文。

### Backend Requirements

`POST /chat` 请求继续兼容 AI SDK `messages` 请求体，不退回单一 `message` 字段：

```ts
type ChatRequest = {
  conversationId?: string;
  message?: string;
  messages?: ChatRequestMessage[];
};
```

后端处理逻辑：

```text
1. 获取当前登录用户。
2. 获取当前用户的 companion。
3. 如果请求包含 conversationId：
   - 校验 conversation 属于当前用户。
   - 校验 conversation 属于当前 companion（当前实现可补强）。
   - 使用该 conversation。
4. 如果请求不包含 conversationId：
   - 查找当前 companion 最近的 conversation。
   - 如果存在，继续使用该 conversation。
   - 如果不存在，创建新的 conversation。
5. 保存 user message。
6. context-builder 构建上下文：
   - companion persona
   - 最近 N 条 messages
   - memories
7. 调用模型并流式返回 assistant 回复。
8. 流式结束后保存 assistant message。
9. 通过响应头返回当前 conversationId 和 traceId。
10. CORS 需要暴露 `X-Conversation-Id` 和 `X-Trace-Id`，确保浏览器端可以读取。
```

### Frontend Requirements

前端处理逻辑：

```text
1. 进入 /chat 时加载 active conversation。
2. 将 activeConversationId 存入状态。
3. 每次发送消息都携带 activeConversationId。
4. 如果后端返回新的 `X-Conversation-Id`，立即写入 activeConversationId。
5. 刷新页面后根据 activeConversationId 或最近会话恢复完整 messages。
6. 不把普通聊天拆成多个可见会话。
7. 不要在每次发送消息后新建会话。
```

### Acceptance Criteria

- 连续发送 5 条用户消息，左侧只新增 1 个 conversation。
- 主聊天窗口展示完整 5 轮用户和 assistant 对话。
- 刷新页面后仍能恢复该 conversation 的完整 messages。
- 发送第 6 条消息时仍追加到同一个 conversation。
- 用户不能访问或追加消息到别人的 conversation。
- 首次新会话发送完成后，前端使用后端返回的 `X-Conversation-Id` 更新当前会话。
- 前端没有传 `conversationId` 时，后端仍优先复用当前伴侣最近会话。

---

## OPT-002: 清理聊天顶部系统信息

### Priority

P1

### Problem

聊天顶部当前展示了邮箱、登录状态、关系字段和当前会话标题。这些属于系统上下文或调试信息，不适合暴露在伴侣聊天页。长期记忆内容当前没有直接展示，但后续仍应保持不在聊天主界面暴露。

### Goal

聊天页顶部只展示对话人名和必要的轻状态。

### Remove From Chat Header

必须移除：

```text
用户邮箱
已登录
关系字段
当前会话标题
prompt/context 调试信息
数据库状态信息
```

聊天主界面也不得新增：

```text
长期记忆内容
记忆状态条
用户偏好摘要
```

### Keep In Chat Header

保留：

```text
companion.name
```

可选保留：

```text
在线
正在回复
```

### Recommended Header

```text
左侧：小南
右侧：设置 / 退出
```

### Acceptance Criteria

- 聊天顶部只看到 companion name。
- 页面不展示用户邮箱。
- 页面不展示关系字段。
- 页面不展示长期记忆文本。
- 页面不展示当前会话标题作为调试摘要。
- 页面不展示系统上下文或调试字段。

---

## OPT-003: 移除聊天主界面的记忆按钮

### Priority

P1

### Problem

记忆被设计成用户在聊天页主动点击的功能按钮，不符合电子伴侣体验。电子伴侣应该自然记住重要信息，而不是让用户像管理数据库一样操作记忆。

### Goal

从聊天主界面移除显性的“记忆”按钮。记忆由系统自动判断、提取和保存。

### UI Requirements

聊天页右上角移除：

```text
记忆
```

记忆管理入口可以后续放到：

```text
/settings
/companion/profile
/memories
```

但不要作为聊天页主操作。

### Backend Requirements

当前代码已经在 assistant 回复保存后异步调用 `memory-extractor`，并且提取失败不会影响主聊天回复。阶段 7 只需要继续保留这个边界，并补强模型兼容性。

聊天完成后的记忆流程：

```text
1. 用户发送消息。
2. assistant 完成回复。
3. 后端异步调用 memory-extractor。
4. memory-extractor 判断是否有值得长期保存的信息。
5. 如果有，写入 memories 表。
6. 如果没有，跳过。
7. 如果记忆提取失败，只记录错误，不影响主聊天。
```

模型兼容要求：

```text
如果当前供应商不稳定支持 AI SDK generateObject / response_format：
1. memory-extractor 改用 generateText 输出 JSON。
2. 服务端用 JSON.parse + Zod safeParse 校验。
3. 校验失败只记录日志，不影响聊天主回复。
```

### Memory Extraction Rules

只保存：

```text
用户明确表达的信息
后续对话有复用价值的信息
稳定偏好
长期目标
近期重要事件
```

不要保存：

```text
一次性闲聊
模型猜测
敏感隐私
临时情绪碎片
医疗、财务、法律等高风险细节
```

### Acceptance Criteria

- 聊天页没有显性的“记忆”按钮。
- 用户正常聊天时不需要手动点击记忆。
- 用户说“我不爱吃辣”后，系统可以自动保存该偏好。
- memory-extractor 失败不会导致聊天失败。

---

## OPT-004: 重做反馈入口

### Priority

P1

### Problem

每条 assistant 回复下方固定展示“有帮助 / 没帮助”，更像工具型问答或客服问卷，不像电子伴侣。

### Goal

保留反馈数据，但把反馈入口变成轻量、隐藏、贴近陪伴语境的消息操作。

### Remove

从 assistant 消息下方移除常驻按钮：

```text
有帮助
没帮助
```

### Add

改成消息 hover、长按或更多菜单：

```text
...
```

菜单项：

```text
喜欢
重新说
记错了
不太像你
```

### Feedback Types

V0 不立即迁移数据库字段，继续复用当前 `feedback.rating`：

```ts
type FeedbackRating = "up" | "down";
```

界面语义和数据映射：

```text
喜欢 -> rating: "up"
记错了 -> rating: "down", reason: "[memory_error]"
不太像你 -> rating: "down", reason: "[persona_mismatch]"
```

V1 再考虑把 `feedback.rating` 升级为更明确的 `feedback.type`：

```ts
type FeedbackType =
  | "like"
  | "memory_error"
  | "persona_mismatch";
```

### Behavior

```text
喜欢:
  保存 positive feedback。

重新说:
  不作为普通 feedback 保存。V0 暂时隐藏或禁用，直到后端支持基于同一条 user message 重新生成且不会重复保存 user message。

记错了:
  V0 保存为 down + reason 标记，后续进入记忆纠错流程。

不太像你:
  V0 保存为 down + reason 标记，用于优化 companion persona 和 prompt。
```

### Data Requirements

反馈仍可写入当前 `feedback` 表。

V0 字段：

```text
id
message_id
user_id
rating
reason
created_at
```

不要在阶段 7 里强制修改 migration，除非同时更新 shared schema、API service、前端提交逻辑和历史数据兼容策略。

### Acceptance Criteria

- assistant 回复下方不再常驻展示“有帮助 / 没帮助”。
- 用户仍能对某条 assistant 消息进行反馈。
- “喜欢”能写入 `rating: "up"`。
- “记错了”能写入 `rating: "down"` 并带 memory error 标记。
- “不太像你”能写入 `rating: "down"` 并带 persona mismatch 标记。
- “重新说”不会导致重复保存同一条 user message。

---

## OPT-005: 移除左侧会话列表

### Priority

P2

### Problem

左侧会话列表会把体验拉回“聊天记录管理器”。对于 V0 的电子伴侣体验，用户更自然的预期是一进入页面就继续和同一个伴侣对话，而不是主动选择会话线程。

### Goal

聊天页只保留一个主聊天窗口，默认延续当前伴侣最近一段会话。

### API Requirements

```text
GET /conversations 仍可保留给后续历史入口使用。
聊天页进入时只读取最近 conversation 并加载 messages。
POST /chat 缺少 conversationId 时，后端复用最近 conversation 或创建第一条 conversation。
```

### UI Behavior

```text
1. 不展示左侧 conversation sidebar。
2. 主区域直接展示连续聊天。
3. 刷新页面恢复最近 conversation 的完整 messages。
4. 后续如果需要历史入口，放到设置或独立历史页，不作为聊天主界面。
```

### Acceptance Criteria

- 聊天页不展示左侧会话列表。
- 用户进入聊天页后直接看到最近连续上下文。
- 连续发送多条消息不会新增多个可见会话条目。
- 刷新页面后仍恢复同一条连续聊天。

---

## OPT-006: 优化记忆参与生成方式

### Priority

P2

### Problem

当前 `context-builder` 已经读取长期记忆并注入 system prompt，聊天主界面也没有直接展示记忆内容。剩余问题是 prompt 需要更明确地要求模型自然使用记忆，避免频繁暴露“我记得...”或内部记忆列表。

### Goal

记忆继续进入 `context-builder`，参与 assistant 回复生成，但使用方式更自然，不在聊天主界面直接展示。

### Context Builder Requirements

`context-builder` 构建上下文时继续保持：

```text
1. 获取当前 user_id。
2. 获取当前 companion_id。
3. 查询该用户和 companion 下的 memories。
4. 过滤低价值或不适用记忆（可后续增强）。
5. 选取 importance 较高的 5-10 条。
6. 注入 system context。
7. 不把 memory content 返回给聊天 UI 展示。
```

### Prompt Instruction

可加入 system context：

```text
以下是用户长期偏好和背景，只在相关时自然使用。
不要每次都刻意提起“我记得你...”。
不要向用户暴露内部记忆列表。

- 用户不喜欢吃辣
- 用户喜欢简洁直接的回答
```

### Response Style Rule

错误示例：

```text
我记得你不爱吃辣，所以不要吃辣。
```

更自然的示例：

```text
可以吃点清淡的，比如粥、云吞、日式定食，避开重辣的会舒服些。
```

### UI Requirements

聊天主界面不要展示：

```text
长期记忆列表
记忆状态条
用户偏好摘要
内部 context
```

设置页可以保留用户控制权：

```text
查看系统记住的信息
删除错误记忆
修改错误记忆
```

### Acceptance Criteria

- 聊天主界面不展示 memory content。
- assistant 回复能自然使用相关记忆。
- assistant 不会每次都说“我记得你...”。
- 用户说“我不爱吃辣”后，后续问吃什么，assistant 会自然避开辣味推荐。
- 用户仍可在设置页查看或删除记忆。

---

## Final Verification Checklist

- [ ] 连续 5 轮聊天只保留 1 个 active conversation。
- [ ] 首次创建会话后，前端明确使用 `X-Conversation-Id` 更新当前会话。
- [ ] 前端没有传 `conversationId` 时，后端仍复用当前伴侣最近会话。
- [ ] API CORS 暴露 `X-Conversation-Id` 和 `X-Trace-Id`。
- [ ] 刷新页面后完整恢复历史消息。
- [ ] 聊天顶部只展示 companion name。
- [ ] 聊天页不展示邮箱、关系字段、当前会话标题、长期记忆文本。
- [ ] 聊天页没有主操作级别的“记忆”按钮。
- [ ] 记忆由系统自动提取并保存。
- [ ] 当前模型供应商不支持结构化输出时，记忆提取有兼容降级方案。
- [ ] assistant 消息下不再常驻展示“有帮助 / 没帮助”。
- [ ] 反馈入口变成轻量消息操作。
- [ ] 聊天页不展示左侧会话列表。
- [ ] 记忆能参与回复生成，但不作为状态条暴露。
