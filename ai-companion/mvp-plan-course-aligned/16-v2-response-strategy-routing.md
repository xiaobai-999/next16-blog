# 16：V2 回复策略与安全路由

## Task ID

`V2-AGENT-003`

## Course Alignment

- `033`：LCEL 分支
- `042`：Middleware 与动态 Prompt
- `047`：条件路由
- `051`：Command
- `059`：重试、降级和人工介入

## Goal

将分类结果转换为明确回复策略，并建立安全优先的路由规则。此阶段可以先在现有聊天服务中实现，不要求立即迁移到 LangGraph。

## Response Strategies

```text
companionship          自然闲聊
reflective_listening   共情倾听，少建议
concrete_advice        给有限、具体、可选择的建议
clarification          信息不足时轻量追问
memory_update          确认或自然处理新记忆
memory_correction      承认纠正并触发 V1 纠错链路
companion_adjustment   处理伴侣设定变化
knowledge_answer       知识型回答，可为后续知识库 RAG 预留
safety_response        高风险安全回应
```

## Routing Priority

必须固定优先级：

```text
1. high risk
2. memory correction / pending confirmation
3. companion boundary or setting
4. emotional support
5. advice / knowledge / casual chat
6. unknown fallback
```

高风险路由不能被 persona、记忆或普通建议策略覆盖。

## Tasks

- [ ] 定义 `ResponseStrategy` 枚举与选择器。
- [ ] 建立分类结果到策略的确定性映射表。
- [ ] 为多意图输入定义优先级。
- [ ] 为每个策略定义 Prompt 片段和输出约束。
- [ ] 将 companion persona 作为风格层，而不是路由决策层。
- [ ] 复用 V1 `memory_correction` 和 confirmation API。
- [ ] 高风险策略使用独立安全模板。
- [ ] 根据 `riskType` 和 `riskUrgency` 选择分类型安全策略。
- [ ] 定义高风险时退出普通角色扮演的规则。
- [ ] 实现低置信度澄清策略。
- [ ] 实现策略选择 Fallback。
- [ ] 记录 `responseStrategy` 和选择原因到 Trace。

## Strategy Rules

情绪倾诉：

```text
先回应感受
允许用户继续表达
除非用户明确要建议，否则不要立刻列方案
避免夸张承诺和依赖诱导
```

具体建议：

```text
给 2-3 个可执行选项
说明选择条件
不替用户做重大决定
```

记忆纠错：

```text
用户当前表达优先
先接受纠正，不与历史记忆争辩
调用 V1 纠错流程
```

安全回应：

```text
保持直接、支持和不评判
鼓励联系现实中的可信任对象或当地紧急支持
不把 AI 描述为唯一支持来源
不继续普通角色扮演
```

## Safety Response Boundary

安全回复不只是一套通用模板。至少按风险类型区分：

```text
self_harm
harm_to_others
immediate_danger
abuse
minor_safety
```

每类风险都必须定义：

```text
进入安全路由的条件
响应语气和重点
是否终止普通角色扮演
是否建议联系现实支持
是否提供紧急资源
禁止输出的内容
后续允许的对话方向
```

全局高风险规则：

- 不能继续普通 companion persona 表演。
- 不能把 AI 描述成唯一支持来源。
- 不能提供危险操作步骤。
- 不能用暧昧陪伴话术代替安全回应。
- 不能做医疗诊断。
- 应鼓励联系现实中的可信任对象或当地紧急支持。
- 必须允许用户继续表达，但不能强化危险行为。

## Tests

- [ ] “今天很累，只想说说话”选择 `reflective_listening`。
- [ ] “给我三个晚饭建议”选择 `concrete_advice`。
- [ ] “你记错了”选择 `memory_correction`。
- [ ] 低置信度输入选择 `clarification` 或保守陪伴。
- [ ] 高风险表达始终选择 `safety_response`。
- [ ] 每种风险类型进入对应安全策略。
- [ ] 安全策略不会输出危险细节或继续普通角色扮演。
- [ ] persona 不会覆盖安全规则。
- [ ] 记忆召回失败时仍能按策略回复。

## Acceptance Criteria

- 每轮普通对话都能得到一个明确策略。
- 多意图输入遵守固定优先级。
- 安全策略不可被后续生成节点改写为普通陪伴回复。
- 每种风险类型有独立可测试策略。
- 高风险回复不会声称 AI 是唯一支持，也不会提供危险细节。
- 记忆纠错复用 V1 能力，不产生第二套记忆更新逻辑。
- 策略选择有 Trace 可查。

## Deliverables

```text
response-strategy.ts
strategy-router.ts
strategy-prompts.ts
safety-response.ts
risk-policy.ts
strategy-routing-eval.jsonl
safety-response-eval.jsonl
测试
```
