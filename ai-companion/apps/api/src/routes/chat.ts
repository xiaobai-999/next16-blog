import { chatRequestSchema } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import { createChatStreamResponse } from "../services/chat-service";
import { ServiceError } from "../services/service-error";
import { apiError } from "../utils/errors";

export const chatRoute = new Hono<AppEnv>().use("*", authMiddleware).post("/", async (c) => {
  const body = chatRequestSchema.safeParse(await c.req.json().catch(() => undefined));

  if (!body.success) {
    return apiError(c, "BAD_REQUEST", "请求参数无效");
  }

  try {
    // traceId：本次聊天请求的链路 ID，贯穿模型调用、消息保存和记忆提取。
    const traceId = crypto.randomUUID();

    return await createChatStreamResponse(
      c.env,
      c.get("currentUser").id,
      body.data,
      traceId,
      (promise) => c.executionCtx.waitUntil(promise)
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return apiError(c, error.code, error.message);
    }

    return apiError(c, "INTERNAL_ERROR", "模型调用失败");
  }
});
