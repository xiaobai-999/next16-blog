import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AppEnv } from "../env";
import { ServiceError } from "./service-error";

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

function createDeepSeekFetch(): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body) as { messages?: Array<Record<string, unknown>> };

        if (Array.isArray(body.messages)) {
          body.messages = body.messages.map((message) =>
            message.role === "developer" ? { ...message, role: "system" } : message
          );

          return fetch(input, {
            ...init,
            body: JSON.stringify(body)
          });
        }
      } catch {
        // Fall through to the original request if the body is not JSON.
      }
    }

    return fetch(input, init);
  };
}

export function getChatModel(env: AppEnv["Bindings"]): LanguageModel {
  const provider = env.LLM_PROVIDER ?? (env.DEEPSEEK_API_KEY ? "deepseek" : "openai");

  if (provider === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY ?? env.LLM_API_KEY;

    if (!apiKey) {
      throw new ServiceError("INTERNAL_ERROR", "DEEPSEEK_API_KEY is not configured");
    }

    const deepseek = createOpenAI({
      apiKey,
      baseURL: env.LLM_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
      fetch: createDeepSeekFetch()
    });

    return deepseek.chat(env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL);
  }

  const apiKey = env.OPENAI_API_KEY ?? env.LLM_API_KEY;

  if (!apiKey) {
    throw new ServiceError("INTERNAL_ERROR", "OPENAI_API_KEY is not configured");
  }

  const openai = createOpenAI({
    apiKey,
    baseURL: env.LLM_BASE_URL
  });

  return openai(env.OPENAI_MODEL ?? DEFAULT_CHAT_MODEL);
}
