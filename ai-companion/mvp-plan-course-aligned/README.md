# AI Companion MVP 执行计划（小册 001-136 对齐版）

本文档集用于把 AI Companion 第一版拆成 6 个可执行阶段，并对齐 `aicompanion.usehook.cn` 导出的 001-136 章内容。

第一版目标是验证：

> 用户是否愿意持续和一个有基础人格、有聊天记忆、能稳定陪伴的 AI 角色互动。

## 小册依据范围

- 001-020：AI Companion 产品形态、记忆、Prompt、边缘部署、可观测性
- 021-061：LangChain / LangGraph / Agent 编排基础，MVP 暂不重度落地
- 062-075：Monorepo、Turborepo、workspace、环境管理
- 076-101：Hono、Cloudflare Workers、D1、KV、项目结构、日志
- 102-115：Zod、单一事实源、Hono 校验、LLM 结构化输出
- 116-136：Vercel AI SDK、`streamText`、`useChat`、Hono 集成、Telemetry

## MVP 范围

第一版必须完成：

- 用户注册、登录
- 创建一个电子伴侣
- 聊天流式回复
- 保存聊天记录
- 基础长期记忆
- 用户查看、手动新增、删除记忆
- 基础模型调用日志和消息反馈

第一版暂不做：

- 语音、图片、文件上传
- 联网搜索
- 多 Agent
- 复杂 LangGraph 编排
- Vectorize 向量检索
- 情绪状态机
- MCP
- 角色市场
- 支付系统
- 后台运营系统

## 推荐技术栈

- Monorepo: pnpm workspace + Turborepo
- Web: Next.js + Vercel AI SDK + shadcn/ui
- API: Hono + Cloudflare Workers
- Database: Cloudflare D1
- Schema: Zod
- AI: Vercel AI SDK `streamText`
- Auth: JWT + HttpOnly Cookie

## 阶段文档

1. [阶段 1：项目骨架、类型契约和数据库](./01-project-skeleton-and-database.md)
2. [阶段 2：认证和伴侣创建](./02-auth-and-companion-setup.md)
3. [阶段 3：AI SDK 流式聊天](./03-streaming-chat.md)
4. [阶段 4：消息持久化和上下文恢复](./04-message-persistence.md)
5. [阶段 5：记忆提取和记忆管理](./05-memory-extraction-and-management.md)
6. [阶段 6：日志、反馈和稳定性验收](./06-logs-feedback-stability.md)

## 全局工程约定

- 所有 API 请求和响应 schema 优先放在 `packages/shared`。
- 服务端使用 Zod 做运行时校验，类型由 `z.infer` 推导。
- Web 与 API 之间优先复用共享 schema；后续可引入 Hono RPC 类型导出。
- 所有受保护接口统一经过 `authMiddleware`。
- 所有用户资源查询必须带 `user_id` 条件，避免越权。
- 所有时间字段统一使用 ISO string。
- 所有 ID 第一版统一使用 `crypto.randomUUID()`。
- 所有 D1 表结构通过 migration 管理，不手动改库。
- Workers 环境避免引入 Node-only 依赖。

## 代码备注约定

- 后续阶段新增或修改代码时，业务变量、关键状态变量、数据库字段映射变量需要补充中文注释，说明业务含义。
- 导出的函数、service 函数、repository 函数、复杂工具函数需要添加中文 JSDoc 或函数备注，说明用途、关键参数和返回结果。
- API route 中的主要处理流程需要用简短中文注释标明步骤，例如鉴权后读取资源、校验归属、写入数据、调用模型。
- 数据库 migration 中的表、关键字段和索引需要添加中文 SQL 注释。
- 注释应解释业务意图和边界条件，不写“给变量赋值”这类重复代码表面的说明。

## 第一版完成定义

- 用户可以注册、登录
- 用户可以创建一个电子伴侣
- 用户可以进入聊天页发送消息
- AI 可以使用 Vercel AI SDK 标准协议流式回复
- 刷新页面后聊天记录仍然存在
- 系统可以从对话中提取 1-3 条有价值记忆
- 下一轮对话能使用这些记忆
- 用户可以查看和删除记忆
- 每次模型调用都有基础日志和 `trace_id`
- 连续 20 轮对话不崩溃
