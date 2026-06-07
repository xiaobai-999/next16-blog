# 阶段 13：MVP Release Candidate 和上线验收

## 目标

把已经完成的聊天、记忆、反馈、语义召回能力收口成可上线验证的 MVP Release Candidate。阶段 13 不新增复杂产品能力，而是补齐自动评测、端到端验收、部署配置、密钥治理、稳定性中间件和基础可观测指标。

阶段 13 完成后，项目应该能回答三个问题：

```text
1. 当前核心链路是否稳定可复测？
2. 记忆系统修改后是否能快速发现回归？
3. 当前环境配置是否具备上线试运行条件？
```

## 小册依据

- 011：边缘部署和延迟预算
- 015：流式响应架构、断流与容错
- 016-020：可观测性、Tracing、Metrics、影子验证和渐进发布
- 074：CI/CD 和环境变量管理
- 083：错误处理
- 095：Workers AI Gateway
- 100：日志和可观测性
- 113-115：Zod、Hono、端到端类型安全
- 130：AI SDK with Hono、本地开发与部署
- 131：AI SDK middleware、缓存、限流、Fallback、Retry
- 132：AI SDK Observability、Telemetry、成本控制

## 前置条件

- 阶段 1-12 的主功能已完成。
- `pnpm typecheck` 通过。
- 本地 D1 migration 可以执行。
- 聊天主链路可正常流式回复。
- 记忆 V1 模型、确认闭环、质量规则、语义召回和评测用例目录已存在。

## 阶段原则

- 不引入 MCP、多 Agent、复杂 LangGraph 主编排。
- 不做语音、图片、文件上传和联网搜索。
- 不把测试和观测做成重型平台，先建立最小可用闭环。
- 任何模型、embedding、Vectorize 失败都不能让主聊天不可用。
- 示例环境文件不得包含真实密钥。
- 所有验收项必须能被复测，不能只靠一次手工试用。

## 当前状态判断

当前项目已经具备：

```text
注册 / 登录
伴侣创建
AI SDK 流式聊天
消息持久化
连续会话恢复
自动记忆提取
V1 记忆状态和确认
记忆编辑、确认、拒绝、软删除
记忆质量规则
embedding / Vectorize 抽象和 D1 fallback
语义记忆召回
模型调用日志和 trace_id
轻量消息反馈
30 条 memory eval case
```

阶段 13 要补齐的是：

```text
评测 runner
端到端验收脚本或清单
生产环境配置检查
密钥清理和轮换
模型调用稳定性策略
观测指标和上线回归表
```

## P0：密钥治理和环境配置

### 问题

示例环境文件只应该展示变量名和占位值，不应该包含真实 API key。任何已经提交或分享过的真实 key 都需要视为泄露并轮换。

### 任务

- 清理 `.env.example`。
- 清理 `apps/api/.dev.vars.example`。
- 将示例 key 改为占位值。
- 检查仓库中是否还有真实 token、API key、secret。
- 轮换已经暴露过的 embedding key。
- 明确本地、预发、生产三套变量。
- 确认 `JWT_SECRET` 在真实环境中不为空。
- 确认 `LLM_API_KEY` / `OPENAI_API_KEY` / `EMBEDDING_API_KEY` 使用 secret 注入。
- 确认 `wrangler.toml` 不写入敏感值。

### 建议变量分层

```text
apps/api/.dev.vars
  本地开发私密变量，不提交。

apps/api/.dev.vars.example
  本地变量模板，只保留占位值。

.env.example
  仓库根目录示例变量，只保留占位值。

Cloudflare Worker secrets
  生产 LLM、embedding、JWT 等敏感变量。

wrangler.toml [vars]
  只放非敏感配置，例如 base url、model name。
```

### 验收标准

- 仓库示例文件中没有真实 API key。
- 真实密钥已轮换。
- `wrangler secret put` 所需变量清单明确。
- 本地开发仍能通过 `.dev.vars` 正常运行。

## P0：Memory Eval Runner

### 目标

把 `packages/evals/memory/*.json` 从人工清单升级成可执行或半自动执行的评测入口。第一版不强依赖大模型裁判，优先验证可确定的规则和结构化结果。

### 范围

建议新增：

```text
packages/evals/memory/run-memory-evals.ts
packages/evals/memory/results/
```

脚本能力：

```text
1. 读取 memory-extraction-cases.json。
2. 读取 memory-retrieval-cases.json。
3. 读取 memory-conflict-cases.json。
4. 读取 memory-expiration-cases.json。
5. 读取 memory-usage-cases.json。
6. 输出总数、通过数、失败数和失败原因。
```

第一版可分两类：

```text
deterministic:
  不调用模型，验证 memory-quality、expires_at、过滤规则、prompt 禁止词。

manual:
  需要模型或人工判断的 case，输出待检查结果，不阻塞脚本退出。
```

### 推荐输出

```text
Memory Evals
Total: 30
Deterministic: 18
Passed: 17
Failed: 1
Manual Review: 12

Failures:
- memory-conflict-food-001: expected pending_confirmation, got active
```

### 任务清单

- 新增 eval runner 脚本。
- 给 `packages/evals` 增加 package 或 workspace script。
- 定义 case 读取和校验 schema。
- 支持 deterministic / manual 两种 case 类型。
- 对过期、冲突、去重、禁止暴露内部状态做确定性检查。
- 输出 JSON 和控制台摘要。
- 文档更新运行方式。
- 将 runner 纳入阶段 13 验收。

### 验收标准

- 可以一条命令执行 memory eval。
- 至少 30 条 case 能被读取和分类。
- deterministic case 有 pass/fail 结果。
- manual case 有明确待检查输出。
- 失败时能定位 case id 和失败原因。

## P0：端到端 MVP 验收

### 目标

建立完整的 MVP 验收清单或 Playwright/API 脚本，覆盖真实用户路径，而不是只验证单个 service。

### 建议覆盖路径

```text
1. 注册新用户。
2. 登录。
3. 创建 companion。
4. 进入 /chat。
5. 连续发送 5 条消息。
6. 验证只复用 1 个 active conversation。
7. 刷新后恢复历史消息。
8. 输入明确偏好，例如“我不喜欢吃辣”。
9. 等待记忆提取完成。
10. 验证 active memory 或 pending memory 被写入。
11. 如果是 pending，进入 /memories 确认。
12. 再次询问吃什么，验证回复自然避开辣味。
13. 点击“记错了”反馈。
14. 验证反馈写入并出现记忆管理入口。
15. 删除或编辑错误记忆。
16. 验证删除后的记忆不再进入上下文。
```

### 连续 20 轮稳定性

保留阶段 6 的 20 轮要求，但阶段 13 要补充可复测方式：

```text
输入固定 20 条消息
记录每轮 trace_id
记录响应状态
记录是否保存 user message
记录是否保存 assistant message
记录是否发生记忆提取错误
最终检查消息数量和 conversation_id
```

### 任务清单

- 新增 E2E 验收文档或脚本。
- 覆盖注册、登录、创建伴侣、聊天、记忆、反馈。
- 覆盖刷新恢复历史。
- 覆盖 20 轮稳定性。
- 覆盖未登录访问保护。
- 覆盖跨用户资源隔离。
- 验证 `X-Conversation-Id` 和 `X-Trace-Id` 可读。
- 记录失败排查步骤。

### 验收标准

- 新用户可以完整走通 MVP 主链路。
- 连续 20 轮不会丢消息。
- 刷新后历史可恢复。
- 记忆提取失败不影响主回复。
- pending 记忆确认前不会进入回复。
- 普通用户不能访问别人的 companion、conversation、message、memory。

## P1：模型调用稳定性中间件

### 目标

对齐课程 131，把模型调用从“直接调用”升级为“可控调用”。第一版重点是 retry、fallback、限流和错误分类，不做复杂缓存。

### 建议能力

```text
retry:
  针对 429、5xx、网络错误做有限重试。

fallback:
  主模型失败时切换备用模型或降级文案。

timeout:
  单次模型调用设置合理超时。

rate limit:
  对 user_id 做基础频率限制。

error category:
  区分 provider_error、timeout、rate_limited、validation_error。
```

### 不建议阶段 13 做

```text
不做相同问答缓存。
不做复杂多模型路由。
不做成本最优调度。
不做用户套餐限额。
```

### 任务清单

- 梳理 `model-provider.ts` 调用边界。
- 给聊天主回复增加有限 retry 或 fallback。
- 给 memory extraction 增加更明确的错误分类。
- 给 embedding 调用增加超时和错误分类。
- 模型失败写入 `model_logs`。
- 限流错误返回统一错误结构。
- 确保 retry 不会重复保存用户消息。

### 验收标准

- 主模型短暂失败时不会立即破坏聊天体验。
- retry 不会导致重复 user message。
- fallback 失败时有可理解错误提示。
- embedding 失败时语义召回回退固定排序。
- 所有模型失败都有 trace_id 可查。

## P1：可观测性和上线指标

### 目标

对齐课程 016-020 和 132，建立 MVP 试运行需要看的基础指标。阶段 13 不要求接完整 Langfuse 或 OpenTelemetry 平台，但必须明确数据从哪里来、怎么查、怎么看是否回滚。

### 核心指标

```text
chat_success_rate
chat_error_rate
first_token_latency_ms
total_response_latency_ms
model_provider_error_count
memory_extraction_success_count
memory_extraction_error_count
memory_write_count
memory_pending_count
memory_retrieval_fallback_count
feedback_up_count
feedback_down_memory_error_count
feedback_down_persona_mismatch_count
```

### 最小实现

当前已有 `model_logs` 和 `trace_id`，阶段 13 可以先补：

```text
debug 查询入口
按 trace_id 查一次聊天链路
按时间窗口统计模型成功 / 失败
按时间窗口统计 memory extraction 错误
按时间窗口统计 feedback 类型
```

### 任务清单

- 梳理已有 `model_logs` 字段是否足够。
- 补充必要的状态字段或错误分类。
- 增加 debug/metrics 查询接口或脚本。
- 输出最近 24 小时核心指标。
- 给每次聊天保留 trace_id。
- 确认前端可以在错误提示里记录 trace_id。
- 编写上线观察清单。

### 验收标准

- 可以根据 trace_id 查到一次聊天的模型调用状态。
- 可以看到最近一段时间模型成功率和错误率。
- 可以看到记忆提取失败数量。
- 可以看到语义召回 fallback 数量。
- 出现故障时有明确回滚或降级动作。

## P1：部署前检查

### 目标

把本地可用的 monorepo 项目整理成可部署的 Worker + Web 组合。

### API 部署检查

```text
Cloudflare D1 database_id 已替换真实值。
D1 migrations 已应用到目标环境。
Vectorize index 已创建。
MEMORY_VECTORIZE 绑定名称正确。
Worker secrets 已写入。
CORS origin 包含生产 Web 域名。
wrangler deploy dry-run 通过。
```

### Web 部署检查

```text
NEXT_PUBLIC_API_BASE_URL 指向生产 API。
登录 Cookie sameSite / secure 策略适配生产域名。
聊天流式响应在生产域名可用。
前端能读取 X-Conversation-Id 和 X-Trace-Id。
```

### 数据检查

```text
users
companions
conversations
messages
memories
memory_embeddings
model_logs
feedback
```

### 任务清单

- 明确 API 部署命令。
- 明确 Web 部署命令。
- 补充生产环境变量清单。
- 补充 D1 migration 步骤。
- 补充 Vectorize index 创建步骤。
- 补充回滚步骤。
- 补充 smoke test 步骤。

### 验收标准

- 新环境可以从空库 migration 到可用状态。
- API `/health` 在生产环境返回成功。
- Web 可以连接生产 API。
- 注册、登录、聊天、记忆管理在生产环境 smoke test 通过。

## P2：文档和运维手册

### 目标

降低后续排查和迭代成本，让 MVP 试运行期间的问题能按固定路径定位。

### 建议文档

```text
docs/release-checklist.md
docs/env-vars.md
docs/debugging.md
docs/memory-evals.md
docs/deployment.md
```

### 内容要求

- 本地启动方式。
- migration 执行方式。
- secrets 配置方式。
- 常见错误和排查。
- trace_id 查询方式。
- memory eval 运行方式。
- 生产 smoke test 清单。
- 回滚和降级策略。

### 验收标准

- 新协作者可以根据文档跑起本地项目。
- 可以根据文档完成一次空环境部署。
- 可以根据文档定位一次聊天失败。
- 可以根据文档复测记忆模块。

## 最终任务清单

- [ ] 清理 `.env.example` 中的真实密钥。
- [ ] 清理 `apps/api/.dev.vars.example` 中的真实密钥。
- [ ] 轮换已经暴露的 embedding key。
- [ ] 补充生产 secrets 清单。
- [ ] 新增 memory eval runner。
- [ ] 30 条 memory eval case 可被 runner 读取。
- [ ] deterministic case 可以输出 pass/fail。
- [ ] manual case 可以输出待人工检查结果。
- [ ] 新增端到端 MVP 验收脚本或清单。
- [ ] 覆盖注册、登录、创建伴侣、聊天、记忆、反馈。
- [ ] 覆盖连续 20 轮聊天稳定性。
- [ ] 覆盖跨用户资源隔离。
- [ ] 增加模型调用 retry / fallback / timeout 设计。
- [ ] 增加 embedding 调用失败分类和 fallback 统计。
- [ ] 增加基础 metrics 查询入口或脚本。
- [ ] 可以按 trace_id 查询聊天链路。
- [ ] 补充部署前检查清单。
- [ ] 补充 D1 migration 和 Vectorize 创建步骤。
- [ ] 补充生产 smoke test 清单。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。

## 验收标准

- 仓库中没有真实 API key 或 secret。
- 新环境可以完成 migration、启动 API、启动 Web。
- 端到端 MVP 主链路通过。
- 连续 20 轮聊天不崩溃、不丢消息、不重复创建异常 conversation。
- 记忆提取、确认、编辑、删除、召回可复测。
- 语义召回失败时聊天仍可回复。
- memory eval runner 能输出稳定报告。
- 关键模型错误可以通过 trace_id 定位。
- 上线 smoke test 清单完整。

## 不做事项

- 不做 MCP。
- 不做多 Agent。
- 不做复杂 LangGraph 主编排。
- 不做语音、图片、文件上传。
- 不做联网搜索。
- 不做角色市场。
- 不做支付系统。
- 不做运营后台。
- 不做自动大模型裁判强依赖。

## 阶段产出

- 可执行或半自动的 memory eval runner。
- MVP 端到端验收清单或脚本。
- 密钥清理和环境变量治理。
- 模型调用稳定性方案。
- 基础 metrics / debug 查询入口。
- 部署前检查清单。
- Release Candidate 验收报告模板。
