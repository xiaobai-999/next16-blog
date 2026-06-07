# Memory Evals

阶段 12 的第一版记忆评测集，用于人工或半自动验证长期记忆的提取、召回、冲突、过期和自然使用。

## Files

- `memory-extraction-cases.json`：验证哪些对话应该或不应该生成候选记忆。
- `memory-retrieval-cases.json`：验证语义召回是否取回相关记忆并排除无关记忆。
- `memory-conflict-cases.json`：验证偏好、边界、资料变化时是否进入确认或更新流程。
- `memory-expiration-cases.json`：验证过期事件不会继续影响当前回复。
- `memory-usage-cases.json`：验证 assistant 是否自然使用记忆，且不暴露内部记忆状态。

## Case Fields

- `id`：稳定用例 ID。
- `category`：用例类别。
- `givenMemories`：预置记忆，使用共享 memory 字段的子集。
- `conversation`：用于记忆提取的输入对话。
- `userInput`：当前用户输入。
- `expectedBehavior`：期望行为。
- `forbiddenBehavior`：禁止行为。
- `expectedMemories`：期望提取出的记忆特征。
- `forbiddenMemories`：禁止提取出的记忆特征。
- `expectedFields`：期望产生或更新的关键字段。

## Usage

第一版已经提供半自动 runner：

```bash
pnpm memory:eval
```

runner 会读取这些 JSON case，先执行确定性检查，并把需要模型或人工判断的用例标记为 `manual`。最新结果写入：

```text
packages/evals/memory/results/latest.json
```

`results/` 是运行产物，不提交到仓库。
