# V2 文字 Agent 编排版总览

## Context

开始 V2 前，V0、V1 和阶段 13 MVP Release Candidate 验收已通过，并已经具备：

- 连续文字对话和流式回复
- 会话与消息持久化
- 自动记忆提取
- 记忆确认、纠错、合并、冲突和过期
- 语义记忆召回
- 用户与 companion 数据隔离

V2 不重做这些能力，而是将它们接入显式、可路由、可恢复、可观测的单 Agent 工作流。

## Version Goal

让系统知道“当前这句话应该如何处理”，而不只是生成一段听起来合理的文本。

V2 完成后应具备：

```text
显式 AgentState
意图 / 情绪 / 风险结构化判断
回复策略选择
安全优先的条件路由
LangGraph 工作流
Checkpointer 与中断恢复
受控内部工具
Trace、评测和渐进发布
```

## Course Alignment

| V2 能力 | 对应小册章节 |
|---|---|
| Tool Calling 与单 Agent 多工具 | `040-041` |
| Middleware 与 Tracing | `042-043` |
| LangGraph 状态、节点、Reducer | `044-046` |
| 条件边与循环 | `047` |
| Checkpointer | `048` |
| ReAct Agent 与 Streaming | `049-050` |
| Command、Interrupt、HITL | `051-053` |
| Store、容错、实践、Runtime Context | `058-061` |
| Trace、Metrics、灰度验证 | `016-020` |

## Non Goals

V2 不做：

- 多 Agent、Supervisor、Swarm、层级并行
- 语音、图片和多模态
- 大量外部工具
- 自动执行高风险现实操作
- 医疗诊断或心理治疗
- 完整运营后台和商业化

`054-057` 的子图、多 Agent 和协作模式只作为后续扩展参考，不是 V2 必做内容。

## Execution Order

1. 阶段 14 / `V2-AGENT-001`：Agent 状态与 Trace 基座
2. 阶段 15 / `V2-AGENT-002`：意图、情绪与风险分类
3. 阶段 16 / `V2-AGENT-003`：回复策略与安全路由
4. 阶段 17 / `V2-AGENT-004`：LangGraph 工作流迁移
5. 阶段 18 / `V2-AGENT-005`：内部工具与 Human-in-the-loop
6. 阶段 19 / `V2-AGENT-006`：Agent 评测、可观测性与发布

## Cross-Document Ownership

| 能力 | 负责阶段 | 边界 |
|---|---|---|
| `AgentState`、Reducer、Runtime Context | `14` | 定义共享数据和运行时依赖 |
| Trace 数据结构与节点记录接口 | `14` | 只搭基座，不做完整指标平台 |
| 意图、情绪、风险分类器 | `15` | 只输出结构化判断和置信度 |
| 回复策略选择 | `16` | 根据分类结果决定如何回应 |
| 高风险安全分支 | `16` | 安全优先，不由普通生成节点覆盖 |
| LangGraph 节点、边、Checkpointer | `17` | 编排已有能力，不重写业务规则 |
| 流式事件协议 | `17` | 保持 V0/V1 用户体验 |
| 内部工具定义与权限 | `18` | 只允许白名单内部动作 |
| `interrupt`、确认和恢复 | `18` | 复用 V1 确认数据，不复制确认规则 |
| 评测集、指标、影子和灰度 | `19` | 验证与发布，不新增业务路径 |

## Core Principles

- 风险判断优先于人格和回复风格。
- 用户当前明确表达优先于历史记忆。
- 分类失败时走保守默认路径，不阻断普通聊天。
- 记忆召回失败时降级为无长期记忆聊天。
- Trace 写入失败不得影响主回复。
- 工具动作必须白名单、校验归属、支持幂等。
- LangGraph 是编排层，不是把所有业务逻辑都写进节点。

## Final Definition of Done

- 普通聊天、情绪倾诉、建议请求、记忆纠错会走不同策略。
- 高风险输入不会进入普通陪伴生成路径。
- 每轮对话有 `traceId`、graph path 和关键判断结果。
- 图执行状态可以通过 `conversationId/threadId` 恢复。
- V1 记忆召回、纠错和确认能力被图复用。
- 节点失败有重试、降级或明确终止策略。
- 旧链路与新链路完成影子对比和小流量灰度。
