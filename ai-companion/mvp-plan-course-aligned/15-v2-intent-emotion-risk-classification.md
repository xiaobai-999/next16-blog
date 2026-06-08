# 15：V2 意图、情绪与风险分类

## Task ID

`V2-AGENT-002`

## Course Alignment

- `028-030`：Prompt、Few-shot、结构化解析
- `033-034`：分支与 Fallback
- `042`：Middleware
- `047`：条件边
- `059`：错误分类与降级

## Goal

使用结构化输出识别用户当前意图、主要情绪和安全风险，为后续策略路由提供稳定输入。分类器只做判断，不直接生成最终回复。

## Taxonomy

第一版意图枚举保持有限：

```text
casual_chat
emotional_support
advice_request
memory_update
memory_correction
companion_setting
knowledge_question
risk_signal
unknown
```

情绪枚举：

```text
neutral
happy
sad
anxious
angry
lonely
stressed
mixed
unknown
```

风险等级：

```text
none
low
medium
high
```

风险类型：

```text
none
self_harm
harm_to_others
immediate_danger
abuse
minor_safety
other
unknown
```

风险紧急程度：

```text
none
non_immediate
immediate
unknown
```

## Structured Output

```ts
const classificationSchema = z.object({
  intent: z.enum([...]),
  intentConfidence: z.number().min(0).max(1),
  emotion: z.enum([...]),
  emotionConfidence: z.number().min(0).max(1),
  riskLevel: z.enum(["none", "low", "medium", "high"]),
  riskType: z.enum([
    "none",
    "self_harm",
    "harm_to_others",
    "immediate_danger",
    "abuse",
    "minor_safety",
    "other",
    "unknown",
  ]),
  riskUrgency: z.enum(["none", "non_immediate", "immediate", "unknown"]),
  riskSignals: z.array(z.string()).max(5),
  reasonCode: z.string(),
});
```

`reasonCode` 使用短枚举或内部代码，不要求模型输出长篇推理。

## Tasks

- [ ] 定义意图、情绪、风险枚举及 Zod Schema。
- [ ] 编写分类 Prompt，明确分类定义和边界。
- [ ] 添加少量高质量 Few-shot，覆盖相近类别。
- [ ] 分类输入包含当前消息和有限最近上下文。
- [ ] 不把全部长期记忆作为风险判断依据。
- [ ] 实现分类超时、解析失败和低置信度 Fallback。
- [ ] 在风险分类中输出 `riskType` 和 `riskUrgency`，供安全路由选择模板。
- [ ] 将分类结果写入 `AgentState`。
- [ ] 将分类结果写入 Trace，不向聊天 UI 暴露内部标签。
- [ ] 为明显风险关键词增加确定性预检查，作为模型分类补充。
- [ ] 建立分类测试集，覆盖真实中文口语、反讽、多意图和上下文反转。
- [ ] 增加 Prompt Injection、要求忽略安全规则、角色扮演危险表达等对抗样例。
- [ ] 增加普通低落和情绪倾诉负样本，监控高风险误判。

## Fallback Rules

```text
意图解析失败       → unknown
情绪解析失败       → neutral
风险解析失败       → 进入保守安全复核，不默认 none
意图置信度过低     → clarification 或 companionship
情绪置信度过低     → 不使用强情绪措辞
```

## Safety Boundary

- 分类器不是医疗诊断器。
- 不把“难过”直接判为高风险。
- 明确的自伤、伤人或紧急危险表达不能被普通分类 Fallback 吞掉。
- 风险结果只用于选择安全响应，不用于给用户贴标签。
- `riskType` 和 `riskUrgency` 只用于后端路由、安全模板和评测，不向普通聊天 UI 展示。

## Evaluation Requirements

分类评测必须覆盖：

```text
中文口语
省略表达
方言化表达
反讽
多意图输入
低置信度输入
上下文反转
prompt injection
要求忽略安全规则
角色扮演中的危险表达
虚构场景与现实风险的区分
普通低落与高风险表达的区分
```

风险评测原则：

```text
高风险识别优先保证召回率
同时监控普通情绪被误判为高风险的比例
```

需要分别统计：

```text
high-risk recall
high-risk precision
false-positive rate on normal sadness
unknown / low-confidence rate
safety route override rate
```

## Tests

至少覆盖：

```text
“今天吃了什么？”                  → casual_chat
“我最近很孤单，想找人说说话”       → emotional_support + lonely
“我该不该换工作？”                → advice_request
“以后回答短一点”                  → memory_update
“你记错了，我能吃微辣”             → memory_correction
“把你的语气改得成熟一点”           → companion_setting
“LangGraph 的 Checkpointer 是什么” → knowledge_question
明显危险表达                       → risk_signal + high
含糊、反讽和多意图输入              → mixed/unknown 或主意图
普通难过但无危险表达                → emotional_support + none/low
要求忽略所有安全规则                → 不能降低风险判断
角色扮演中的危险表达                → 按现实风险复核
```

## Acceptance Criteria

- 分类输出始终通过 Zod 校验或进入明确 Fallback。
- 高风险样例召回率优先于精确率，不被普通聊天路由覆盖。
- 普通难过不会全部被判定为高风险。
- Prompt Injection 不能绕过风险分类和安全策略。
- 低置信度分类不会触发破坏性动作。
- 分类不会增加明显可感知的聊天等待时间；必要时并行执行非依赖判断。
- UI 不显示内部情绪或风险标签。

## Deliverables

```text
classification-schema.ts
intent-classifier.ts
emotion-risk-classifier.ts
classification-prompt.ts
classification-eval.jsonl
classification-adversarial-eval.jsonl
high-risk-recall-report
normal-sadness-false-positive-report
单元与集成测试
```
