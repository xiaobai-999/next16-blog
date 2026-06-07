import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AppEnv } from "../env";
import { ServiceError } from "./service-error";

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_LLM_TIMEOUT_MS = 60_000;

export type ModelProviderInfo = {
  provider: "openai" | "deepseek";
  model: string;
};

/**
 * 解析当前请求实际使用的模型供应商和模型名。
 */
export function getModelProviderInfo(env: AppEnv["Bindings"]): ModelProviderInfo {
  const provider = env.LLM_PROVIDER ?? (env.DEEPSEEK_API_KEY ? "deepseek" : "openai");

  if (provider === "deepseek") {
    return {
      provider,
      model: env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL
    };
  }

  return {
    provider,
    model: env.OPENAI_MODEL ?? DEFAULT_CHAT_MODEL
  };
}

/**
 * 解析模型请求超时时间。
 */
function getModelTimeoutMs(env: AppEnv["Bindings"]) {
  const timeoutMs = Number(env.LLM_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_LLM_TIMEOUT_MS;
  }

  return Math.trunc(timeoutMs);
}

/**
 * 为 provider fetch 增加超时保护。
 */
function createTimeoutFetch(timeoutMs: number, transformBody?: (body: string) => string): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const body = typeof init?.body === "string" && transformBody ? transformBody(init.body) : init?.body;

    try {
      return await fetch(input, {
        ...init,
        body,
        signal: init?.signal ?? controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function getChatModel(env: AppEnv["Bindings"]): LanguageModel {
  const { provider, model } = getModelProviderInfo(env);
  const timeoutMs = getModelTimeoutMs(env);

  if (provider === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY ?? env.LLM_API_KEY;

    if (!apiKey) {
      throw new ServiceError("INTERNAL_ERROR", "DEEPSEEK_API_KEY is not configured");
    }

    const deepseek = createOpenAI({
      apiKey,
      baseURL: env.LLM_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
      fetch: createTimeoutFetch(timeoutMs, (rawBody) => {
        try {
          const body = JSON.parse(rawBody) as { messages?: Array<Record<string, unknown>> };

          if (Array.isArray(body.messages)) {
            body.messages = body.messages.map((message) =>
              message.role === "developer" ? { ...message, role: "system" } : message
            );
          }

          return JSON.stringify(body);
        } catch {
          return rawBody;
        }
      })
    });

    return deepseek.chat(model);
  }

  const apiKey = env.OPENAI_API_KEY ?? env.LLM_API_KEY;

  if (!apiKey) {
    throw new ServiceError("INTERNAL_ERROR", "OPENAI_API_KEY is not configured");
  }

  const openai = createOpenAI({
    apiKey,
    baseURL: env.LLM_BASE_URL,
    fetch: createTimeoutFetch(timeoutMs)
  });

  return openai(model);
}
