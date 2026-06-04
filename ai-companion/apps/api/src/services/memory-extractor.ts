import { memoryExtractionResultSchema } from "@ai-companion/shared";
import type { CandidateMemory } from "@ai-companion/shared";
import { generateText } from "ai";
import type { AppEnv } from "../env";
import { createExtractedMemories } from "./memories";
import { decideMemoryWrite } from "./memory-policy";
import { createModelLog } from "./model-logs";
import { getChatModel, getModelProviderInfo } from "./model-provider";

type ExtractAndStoreMemoriesInput = {
  traceId: string;
  userId: string;
  conversationId: string;
  companionId: string;
  sourceMessageId: string;
  userMessage: string;
  assistantMessage: string;
};

const MEMORY_EXTRACTOR_SYSTEM_PROMPT = [
  "你是记忆提取器。",
  "请从用户最新消息和上下文中提取值得长期保存的信息。",
  "只提取用户明确表达的信息，不要猜测。",
  "如果没有值得保存的信息，返回空数组。",
  "你必须只输出 JSON 对象，不要输出 Markdown、解释、代码块或多余文本。",
  '输出格式必须是：{"memories":[...]}。',
  "",
  "可用类型：",
  "- profile：用户稳定信息，例如职业、长期目标、身份背景",
  "- preference：用户偏好，例如回答风格、语言偏好、互动禁忌",
  "- event：用户近期重要事件，例如正在准备面试、最近在做某项目",
  "- relationship：用户明确表达的关系定位或相处方式",
  "- boundary：用户明确提出的互动边界或禁忌",
  "",
  "每条记忆必须包含：",
  "- type",
  "- content：简短事实，不超过 500 字",
  "- importance：1-5 的整数",
  "- confidence：0-1 的置信度",
  "- reason：为什么值得保存，尽量简短",
  "- expiresAt：事件类可以填写 ISO 时间，不确定则为 null",
  "",
  "只保存满足以下条件的信息：",
  "- 用户明确表达",
  "- 后续对话有复用价值",
  "- 不是一次性闲聊",
  "- 不是敏感隐私",
  "- 不是模型猜测",
  "",
  "不要保存：",
  "- 医疗隐私",
  "- 财务隐私",
  "- 身份证、手机号、住址等敏感信息",
  "- 模型推断出的性格标签",
  "- 临时情绪碎片"
].join("\n");

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced?.[1]?.trim() ?? trimmed;
}

function parseMemoryExtractionText(text: string) {
  const jsonText = stripJsonFence(text);

  try {
    return memoryExtractionResultSchema.parse(JSON.parse(jsonText));
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Memory extraction response is not valid JSON");
    }

    return memoryExtractionResultSchema.parse(JSON.parse(jsonText.slice(start, end + 1)));
  }
}

/**
 * 提取可写入日志的错误摘要。
 */
function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      code: error.name || "Error",
      message: error.message.slice(0, 500)
    };
  }

  return {
    code: "UnknownError",
    message: String(error).slice(0, 500)
  };
}

/**
 * 从最新一轮对话中提取长期记忆候选，并按写入策略保存。
 *
 * 提取或解析失败时返回空数组，不能影响主聊天回复。
 */
export async function extractAndStoreMemories(
  env: AppEnv["Bindings"],
  input: ExtractAndStoreMemoriesInput
) {
  const prompt = [
    "最新用户消息：",
    input.userMessage,
    "",
    "assistant 回复：",
    input.assistantMessage
  ].join("\n");
  // modelInfo：记忆提取同样调用模型，单独记录供应商、模型和耗时。
  const modelInfo = getModelProviderInfo(env);
  // startedAt：记忆提取模型调用开始时间，用于稳定性排查。
  const startedAt = Date.now();
  // candidateMemories：模型返回并通过 schema 校验后的候选记忆。
  let candidateMemories: CandidateMemory[] = [];

  try {
    const result = await generateText({
      model: getChatModel(env),
      system: MEMORY_EXTRACTOR_SYSTEM_PROMPT,
      prompt,
      temperature: 0
    });
    candidateMemories = parseMemoryExtractionText(result.text).memories;

    await createModelLog(env.DB, {
      traceId: input.traceId,
      userId: input.userId,
      conversationId: input.conversationId,
      provider: modelInfo.provider,
      model: modelInfo.model,
      promptTokens: result.usage.inputTokens ?? null,
      completionTokens: result.usage.outputTokens ?? null,
      latencyMs: Date.now() - startedAt,
      status: "success"
    }).catch((logError) => {
      console.error("Failed to write memory extraction model log", {
        traceId: input.traceId,
        error: logError
      });
    });
  } catch (error) {
    const summary = errorSummary(error);

    await createModelLog(env.DB, {
      traceId: input.traceId,
      userId: input.userId,
      conversationId: input.conversationId,
      provider: modelInfo.provider,
      model: modelInfo.model,
      latencyMs: Date.now() - startedAt,
      status: "error",
      errorCode: summary.code,
      errorMessage: summary.message
    }).catch((logError) => {
      console.error("Failed to write memory extraction model log", {
        traceId: input.traceId,
        error: logError
      });
    });

    return [];
  }

  // memoriesToSave：候选记忆经 memory-policy 判断后，只有 save 决策会入库。
  const memoriesToSave = candidateMemories.flatMap((candidate) => {
    const decision = decideMemoryWrite(candidate);

    if (decision.action === "skip") {
      console.debug("Skip candidate memory", {
        traceId: input.traceId,
        reason: decision.reason,
        type: candidate.type
      });

      return [];
    }

    return [
      {
        candidate,
        status: decision.status,
        confirmationReason: decision.confirmationReason
      }
    ];
  });

  if (memoriesToSave.length === 0) {
    return [];
  }

  return createExtractedMemories(
    env,
    input.userId,
    input.companionId,
    memoriesToSave,
    input.sourceMessageId,
    input.conversationId
  );
}
