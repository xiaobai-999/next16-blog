import { memoryExtractionResultSchema } from "@ai-companion/shared";
import type { ExtractedMemory } from "@ai-companion/shared";
import { generateObject } from "ai";
import type { AppEnv } from "../env";
import { createExtractedMemories } from "./memories";
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
  "",
  "可用类型：",
  "- profile：用户稳定信息，例如职业、长期目标、身份背景",
  "- preference：用户偏好，例如回答风格、语言偏好、互动禁忌",
  "- event：用户近期重要事件，例如正在准备面试、最近在做某项目",
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

const SENSITIVE_PATTERNS = [
  /身份证/,
  /手机号|电话/,
  /住址|地址/,
  /银行卡|信用卡|账户|账号/,
  /病历|诊断|处方|医保/,
  /\b\d{11}\b/,
  /\b\d{15,18}\b/
];

/**
 * 判断候选记忆是否可能包含敏感信息。
 *
 * 这是模型规则之外的兜底过滤，第一版使用简单关键词和数字模式。
 */
function isSensitiveMemory(memory: ExtractedMemory) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(memory.content));
}

/**
 * 对模型提取结果做服务端兜底过滤。
 */
function filterExtractedMemories(memories: ExtractedMemory[]) {
  return memories.filter((memory) => !isSensitiveMemory(memory));
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
 * 从最新一轮对话中提取长期记忆并写入数据库。
 *
 * 失败时由调用方捕获并记录日志，不能影响主聊天回复。
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
  // extractedMemories：模型返回并通过 schema 校验后的候选记忆。
  let extractedMemories: ExtractedMemory[] = [];

  try {
    const result = await generateObject({
      model: getChatModel(env),
      schema: memoryExtractionResultSchema,
      schemaName: "memory_extraction_result",
      system: MEMORY_EXTRACTOR_SYSTEM_PROMPT,
      prompt,
      temperature: 0
    });
    extractedMemories = result.object.memories;

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

    throw error;
  }

  // memories：通过 Zod 校验后的候选记忆，再做敏感信息兜底过滤。
  const memories = filterExtractedMemories(extractedMemories);

  if (memories.length === 0) {
    return [];
  }

  return createExtractedMemories(
    env.DB,
    input.userId,
    input.companionId,
    memories,
    input.sourceMessageId
  );
}
