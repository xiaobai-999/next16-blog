# 阶段 3：AI SDK 流式聊天

## 目标

完成最小聊天闭环。这个阶段结束后，用户可以在聊天页发送消息，并看到 AI 以 Vercel AI SDK 标准协议流式回复。

## 小册依据

- 015：Streaming 响应架构
- 091：Hono 流式响应与 SSE
- 116-136：Vercel AI SDK、`streamText`、`useChat`、AI SDK 与 Hono
- 008、121：Prompt 工程和 AI SDK prompt 组织

## 前置条件

- 阶段 2 已完成
- 用户可以登录
- 用户可以创建伴侣
- 已配置 LLM API Key

## 工程约定

- 优先使用 Vercel AI SDK 标准消息协议，不自定义 SSE 协议。
- 前端使用 `useChat`。
- 后端使用 `streamText`。
- API 返回 AI SDK 可消费的流式响应。
- 第一版模型 provider 先接 OpenAI，但封装到 `model-provider.ts`，避免散落在业务代码中。
- 本阶段不保存消息，持久化放到阶段 4。

## 任务清单

- [ ] 创建聊天页面 `/chat`
- [ ] 接入 Vercel AI SDK `useChat`
- [ ] API 实现 `POST /chat`
- [ ] API 使用 `streamText`
- [ ] 实现 `model-provider.ts`
- [ ] 构建基础 system prompt
- [ ] 将伴侣设定注入 prompt
- [ ] 支持流式返回
- [ ] 处理模型错误
- [ ] 处理用户未创建伴侣的情况
- [ ] 处理未登录用户调用聊天接口

## API 边界

```text
POST /chat
```

请求优先兼容 AI SDK messages 格式：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "今天有点累"
    }
  ]
}
```

可以兼容简化格式：

```json
{
  "conversationId": "optional-conversation-id",
  "message": "今天有点累"
}
```

## Prompt 组成

```text
基础系统规则
+ 伴侣名称
+ 伴侣人格
+ 说话风格
+ 关系定位
+ 边界要求
+ 当前用户消息
```

## 基础系统规则

```text
你是一个电子伴侣系统中的 AI 角色。
你需要自然、真诚、简洁地回应用户。
你不能声称自己是真人。
你不能替用户做重大医疗、法律、金融决定。
当用户表达明显危险或自伤倾向时，你需要优先给出安全建议。
```

## 推荐模块

```text
apps/api/src/services/chat-service.ts
apps/api/src/services/context-builder.ts
apps/api/src/services/model-provider.ts
packages/prompts/src/system-prompt.ts
packages/prompts/src/persona-prompt.ts
packages/shared/src/schemas/chat.ts
```

## 聊天页功能

- 输入文本
- 发送消息
- 展示用户消息
- 展示 AI 流式回复
- 发送中禁用重复提交
- 出错时展示重试入口

## 错误行为

- 模型调用失败时返回前端可识别的错误状态。
- 用户没有 companion 时返回 `COMPANION_REQUIRED`。
- 未登录时返回 `UNAUTHORIZED`。
- 本阶段不保存 assistant 空消息。

## 不做事项

- 不保存消息，保存放到阶段 4
- 不做长期记忆，记忆放到阶段 5
- 不做工具调用
- 不做联网搜索
- 不做语音输入
- 不做图片输入
- 不接 LangGraph

## 验收标准

- [ ] 用户可以打开 `/chat`
- [ ] 用户可以发送文本
- [ ] AI 可以流式回复
- [ ] 前后端使用 AI SDK 标准协议
- [ ] 回复风格会受到伴侣设定影响
- [ ] 模型调用失败时不会导致页面崩溃
- [ ] 未登录用户不能调用聊天接口
- [ ] 没有 companion 的用户不能开始聊天

## 阶段产出

- 可用聊天页
- 流式聊天接口
- 基础 prompt 体系
- 初版 `chat-service`
- 初版 `context-builder`
- 初版 `model-provider`
