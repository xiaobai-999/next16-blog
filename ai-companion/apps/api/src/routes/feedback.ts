import { createFeedbackSchema, type FeedbackResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import { upsertFeedback } from "../services/feedback";
import { ServiceError } from "../services/service-error";
import { apiError } from "../utils/errors";

/**
 * 消息反馈路由。
 *
 * 当前只支持对自己的 assistant 消息提交点赞或点踩。
 */
export const feedbackRoute = new Hono<AppEnv>().use("*", authMiddleware).post("/", async (c) => {
  const body = createFeedbackSchema.safeParse(await c.req.json().catch(() => undefined));

  if (!body.success) {
    return apiError(c, "BAD_REQUEST", "请求参数无效");
  }

  try {
    // feedback：新增或覆盖后的反馈记录。
    const feedback = await upsertFeedback(c.env.DB, c.get("currentUser").id, body.data);

    return c.json<FeedbackResponse>({ feedback });
  } catch (error) {
    if (error instanceof ServiceError) {
      return apiError(c, error.code, error.message);
    }

    return apiError(c, "INTERNAL_ERROR", "反馈提交失败");
  }
});
