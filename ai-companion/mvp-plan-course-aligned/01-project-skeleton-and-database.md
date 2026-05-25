# 阶段 1：项目骨架、类型契约和数据库

## 目标

搭建可继续扩展的工程骨架，并准备第一版需要的数据库表、共享类型契约和 Cloudflare D1 本地开发基线。这个阶段结束后，项目应该能本地启动 Web 和 API，并能执行 D1 migration。

## 小册依据

- 013-014：三端架构、Monorepo、共享包边界
- 062-075：pnpm workspace、Turborepo、内部包、环境管理
- 076-092：Hono、Cloudflare Workers、D1、项目结构
- 102-115：Zod 单一事实源、Zod + Hono
- 116-136：AI SDK 与 Hono 集成的后续接口基础

## 前置条件

- 已安装 Node.js LTS
- 已安装 pnpm
- 已准备 Cloudflare 账号
- 已安装 Wrangler
- 已准备一个可用 LLM API Key

## 任务清单

- [ ] 初始化 pnpm workspace
- [ ] 初始化 Turborepo
- [ ] 创建 `apps/web`
- [ ] 创建 `apps/api`
- [ ] 创建 `packages/shared`
- [ ] 创建 `packages/database`
- [ ] 创建 `packages/prompts`
- [ ] 创建 `packages/config`
- [ ] 配置 TypeScript
- [ ] 配置 ESLint 和 Prettier
- [ ] 配置环境变量模板
- [ ] 配置 `wrangler.toml`
- [ ] 创建 D1 数据库
- [ ] 编写第一版 migration
- [ ] 创建共享 Zod schema 目录
- [ ] 本地验证 API health check
- [ ] 本地验证 Web 页面可访问
- [ ] 本地执行 D1 migration

## 推荐目录

```text
apps/
  web/
    app/
    components/
    lib/
  api/
    src/
      index.ts
      routes/
      services/
      middleware/
      env.ts
packages/
  shared/
    src/
      schemas/
      types/
      constants/
  database/
    migrations/
    src/
  prompts/
    src/
  config/
    tsconfig/
```

## 包职责

- `apps/web`：Next.js 前端，包含登录、伴侣设置、聊天、记忆管理页面。
- `apps/api`：Hono + Cloudflare Workers API，负责认证、聊天编排、D1 访问、模型调用。
- `packages/shared`：Zod schema、DTO、公共类型、枚举和常量。
- `packages/database`：D1 migration、数据库 helper、repository 基础函数。
- `packages/prompts`：系统 prompt、伴侣 prompt、记忆提取 prompt。
- `packages/config`：共享 TypeScript、ESLint、Prettier 配置。

## 环境变量

```text
OPENAI_API_KEY=
JWT_SECRET=
COOKIE_SECRET=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
```

如果使用 Cloudflare Workers，D1 不使用 `DATABASE_URL`，统一通过 Wrangler binding 注入。

## Wrangler 和 D1 约定

- D1 binding 统一命名为 `DB`。
- 本地开发使用 `wrangler dev`。
- migration 由 Wrangler 管理，不手动建表。

推荐命令：

```text
wrangler d1 create ai-companion
wrangler d1 migrations create ai-companion init
wrangler d1 migrations apply ai-companion --local
```

`wrangler.toml` 中至少包含：

```toml
name = "ai-companion-api"
main = "src/index.ts"
compatibility_date = "2026-05-22"

[[d1_databases]]
binding = "DB"
database_name = "ai-companion"
database_id = "<cloudflare-d1-database-id>"
```

## 基础脚本

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm db:migrate:local
```

`pnpm dev` 应同时启动 Web 和 API。

## 共享 Schema 基线

阶段 1 先创建目录和基础枚举，不需要完成所有业务 schema。

```text
packages/shared/src/schemas/auth.ts
packages/shared/src/schemas/companion.ts
packages/shared/src/schemas/chat.ts
packages/shared/src/schemas/memory.ts
packages/shared/src/schemas/feedback.ts
packages/shared/src/schemas/common.ts
```

基础枚举：

```ts
export const messageRoleSchema = z.enum(["user", "assistant", "system"]);
export const memoryTypeSchema = z.enum(["profile", "preference", "event"]);
export const feedbackRatingSchema = z.enum(["up", "down"]);
export const modelLogStatusSchema = z.enum(["success", "error"]);
```

## 数据库表

第一版需要这些表：

```text
users
companions
conversations
messages
memories
model_logs
feedback
```

## D1 Schema 草案

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE companions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  tone TEXT NOT NULL,
  relationship TEXT NOT NULL,
  boundaries TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (companion_id) REFERENCES companions(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('profile', 'preference', 'event')),
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted')),
  source_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (companion_id) REFERENCES companions(id),
  FOREIGN KEY (source_message_id) REFERENCES messages(id)
);

CREATE TABLE model_logs (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_companions_user_id ON companions(user_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_companion_id ON conversations(companion_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_memories_user_companion ON memories(user_id, companion_id);
CREATE INDEX idx_model_logs_trace_id ON model_logs(trace_id);
CREATE INDEX idx_feedback_message_id ON feedback(message_id);
```

## 基础接口

```text
GET /health
```

返回：

```json
{
  "ok": true
}
```

## 暂不落地

- 不接 Vectorize
- 不接 KV
- 不接 LangGraph
- 不做情绪状态机
- 不做 MCP
- 不做后台管理系统

## 验收标准

- [ ] `pnpm install` 成功
- [ ] `pnpm dev` 能同时启动 Web 和 API
- [ ] `GET /health` 返回成功
- [ ] `wrangler dev` 可以启动 API
- [ ] D1 migration 可以本地执行
- [ ] 数据库中存在第一版所需表、约束和索引
- [ ] `.env.example` 包含所有必要变量
- [ ] `packages/shared` 可以被 Web 和 API 引用
- [ ] `pnpm typecheck` 成功

## 阶段产出

- 可运行的 monorepo
- Web 应用骨架
- Hono API 应用骨架
- D1 migration
- 共享 schema 目录
- Wrangler 配置
- 基础 health check
