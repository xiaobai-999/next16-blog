# 阶段 4：消息持久化和上下文恢复

## 目标

保存会话和消息，让用户刷新页面后仍能继续之前的聊天。这个阶段结束后，系统具备连续对话的基础。

## 小册依据

- 035-036：记忆与对话持久化
- 087-088：D1 和数据库访问
- 116-127：AI SDK 消息协议、UIMessage
- 076-085：Hono 权限控制

## 前置条件

- 阶段 3 已完成
- `conversations` 和 `messages` 表已可用
- 聊天接口可以流式回复

## 工程约定

- 数据库中保存 `user` 和 `assistant` 消息。
- `system` 消息只用于 prompt 构建，默认不保存到消息列表。
- AI SDK `UIMessage` 和数据库 `messages` 之间需要显式转换。
- 第一版流式保存策略：完整 assistant 回复生成结束后再保存。
- 所有 conversation 和 message 查询必须带 `user_id` 权限条件。

## 任务清单

- [ ] 创建 conversation service
- [ ] 创建 message repository
- [ ] 用户首次聊天时自动创建会话
- [ ] 保存用户消息
- [ ] 保存 AI 回复
- [ ] 查询会话列表
- [ ] 查询会话消息
- [ ] 聊天页加载历史消息
- [ ] 刷新页面后恢复历史
- [ ] 限制每次注入 prompt 的历史消息数量
- [ ] 实现 AI SDK message 和 DB message 的转换

## API 边界

```text
GET  /conversations
POST /conversations
GET  /conversations/:id/messages
POST /chat
```

`POST /chat` 在本阶段需要同时负责：

- 创建或读取 conversation
- 校验 conversation 属于当前用户
- 保存用户消息
- 调用模型
- 保存 AI 消息
- 返回流式回复

## 会话创建策略

第一版采用：

```text
用户第一次发送消息时自动创建 conversation
title 先取用户第一条消息前 20 个字
```

## 上下文窗口策略

第一版不要把所有历史消息都塞进 prompt。

建议规则：

```text
取最近 10-20 条消息
按 created_at ASC 注入模型
后续再通过长期记忆补充重要信息
```

## 消息映射

数据库消息：

```text
id
user_id
conversation_id
role
content
token_count
created_at
```

发送给 AI SDK 时转换为：

```ts
{
  role: "user" | "assistant" | "system",
  content: string
}
```

## 失败处理

- 创建 conversation 成功但模型失败时，用户消息可以保留，assistant 消息不写入。
- 模型成功但 assistant 消息保存失败时，返回日志错误，前端提示当前回复可能未保存。
- conversation 不属于当前用户时返回 `FORBIDDEN`。
- D1 写入失败时返回统一错误结构。

## 不做事项

- 不做消息编辑
- 不做消息删除
- 不做会话归档
- 不做多端同步冲突处理
- 不做 token 精确统计，能估算即可
- 不做增量保存 assistant 消息

## 验收标准

- [ ] 发送第一条消息时能自动创建会话
- [ ] 用户消息会保存到数据库
- [ ] AI 回复会保存到数据库
- [ ] 刷新聊天页后历史消息仍然存在
- [ ] 再次发送消息时能带上最近历史上下文
- [ ] 用户不能读取别人的会话
- [ ] 用户不能读取别人的消息
- [ ] 连续 20 轮对话不会丢消息
- [ ] AI SDK message 和 DB message 转换有明确函数

## 阶段产出

- 会话列表接口
- 消息查询接口
- 消息保存逻辑
- 支持历史恢复的聊天页
- 可连续对话的 `context-builder`
