import { buildClassificationUserPrompt, classificationSystemPrompt } from "@ai-companion/prompts";
import { classificationSchema, type ClassificationResult } from "@ai-companion/shared";
import { generateObject, generateText, type LanguageModel, type ModelMessage } from "ai";
import type { AgentTraceStatus } from "../agent/agent-state";
import type { AppEnv } from "../env";
import {
  applyConfidenceFallbacks,
  applyRiskPrecheckOverride,
  buildClassificationFallback,
  detectRiskPrecheck
} from "./emotion-risk-classifier";
import { getChatModel, getModelProviderInfo } from "./model-provider";

const DEFAULT_CLASSIFICATION_TIMEOUT_MS = 8_000;
const CLASSIFICATION_CONTEXT_LIMIT = 6;
const CONTEXT_MESSAGE_MAX_LENGTH = 500;

export type ClassificationOutcome = {
  classification: ClassificationResult;
  status: AgentTraceStatus;
  degradedReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  model: string;
  startedAt: string;
  endedAt: string;
  inputSummary: string;
  outputSummary: string;
};

function readClassificationTimeoutMs(env: AppEnv["Bindings"]) {
  const value = Number(env.CLASSIFICATION_TIMEOUT_MS ?? DEFAULT_CLASSIFICATION_TIMEOUT_MS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_CLASSIFICATION_TIMEOUT_MS;
  }

  return Math.min(30_000, Math.trunc(value));
}

function modelMessageText(message: ModelMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }

  return JSON.stringify(message.content);
}

function limitedContext(messages: ModelMessage[]) {
  return messages
    .slice(-CLASSIFICATION_CONTEXT_LIMIT)
    .map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: modelMessageText(message).slice(0, CONTEXT_MESSAGE_MAX_LENGTH)
    }));
}

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

function isUnavailableResponseFormat(error: unknown) {
  return error instanceof Error && /response_format.*unavailable/i.test(error.message);
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Classification JSON object not found");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

async function generateStructuredClassification(input: {
  model: LanguageModel;
  system: string;
  prompt: string;
  timeoutMs: number;
}) {
  try {
    const result = await withTimeout(
      generateObject({
        model: input.model,
        schema: classificationSchema,
        schemaName: "classification",
        schemaDescription: "Intent, emotion, and safety risk classification for backend routing.",
        system: input.system,
        prompt: input.prompt,
        temperature: 0
      }),
      input.timeoutMs
    );

    return {
      classification: classificationSchema.parse(result.object),
      mode: "structured_object"
    };
  } catch (error) {
    if (!isUnavailableResponseFormat(error)) {
      throw error;
    }

    const result = await withTimeout(
      generateText({
        model: input.model,
        system: `${input.system}

The provider does not support native structured response_format. Return exactly one valid JSON object and no markdown.`,
        prompt: input.prompt,
        temperature: 0
      }),
      input.timeoutMs
    );

    return {
      classification: classificationSchema.parse(parseJsonObject(result.text)),
      mode: "text_json"
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Classification timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export async function classifyUserMessage(
  env: AppEnv["Bindings"],
  input: {
    currentInput: string;
    recentMessages: ModelMessage[];
  }
): Promise<ClassificationOutcome> {
  const startedAt = new Date().toISOString();
  const modelInfo = getModelProviderInfo(env);
  const precheck = detectRiskPrecheck(input.currentInput);
  const prompt = buildClassificationUserPrompt({
    currentInput: input.currentInput,
    recentContext: limitedContext(input.recentMessages)
  });
  const inputSummary = `user_message_chars=${input.currentInput.length};context_messages=${Math.min(
    input.recentMessages.length,
    CLASSIFICATION_CONTEXT_LIMIT
  )};precheck=${precheck.matched ? precheck.riskLevel : "none"}`;

  try {
    const model = getChatModel(env);
    const result = await generateStructuredClassification({
      model,
      system: classificationSystemPrompt,
      prompt,
      timeoutMs: readClassificationTimeoutMs(env)
    });
    const classification = applyRiskPrecheckOverride(
      applyConfidenceFallbacks(result.classification),
      precheck
    );
    const endedAt = new Date().toISOString();

    return {
      classification,
      status: "ok",
      model: modelInfo.model,
      startedAt,
      endedAt,
      inputSummary,
      outputSummary: `mode=${result.mode};intent=${classification.intent};emotion=${classification.emotion};risk=${classification.riskLevel};riskType=${classification.riskType};reason=${classification.reasonCode}`
    };
  } catch (error) {
    const summary = errorSummary(error);
    const classification = buildClassificationFallback(precheck);
    const endedAt = new Date().toISOString();

    return {
      classification,
      status: "degraded",
      degradedReason: "classification_fallback",
      errorCode: summary.code,
      errorMessage: summary.message,
      model: modelInfo.model,
      startedAt,
      endedAt,
      inputSummary,
      outputSummary: `fallback=true;intent=${classification.intent};emotion=${classification.emotion};risk=${classification.riskLevel};riskType=${classification.riskType};reason=${classification.reasonCode}`
    };
  }
}
