import type {
  ConversationResponse,
  ConversationsResponse,
  MessagesResponse
} from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import {
  createConversationForCurrentCompanion,
  listConversations,
  requireConversation
} from "../services/conversations";
import { listMessages } from "../services/messages";
import { ServiceError } from "../services/service-error";
import { apiError } from "../utils/errors";

/**
 * 会话路由。
 *
 * 提供会话列表、创建会话和读取会话消息能力；所有接口都需要登录。
 */
export const conversationsRoute = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .get("/", async (c) => {
    // 读取当前用户的会话列表，服务层会按 user_id 过滤。
    const conversations = await listConversations(c.env.DB, c.get("currentUser").id);

    return c.json<ConversationsResponse>({ conversations });
  })
  .post("/", async (c) => {
    try {
      // 第一版创建空会话时绑定当前用户的默认伴侣，标题先使用固定占位。
      const conversation = await createConversationForCurrentCompanion(
        c.env.DB,
        c.get("currentUser").id,
        "新会话"
      );

      return c.json<ConversationResponse>({ conversation }, 201);
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "创建会话失败");
    }
  })
  .get("/:id/messages", async (c) => {
    try {
      // userId：当前登录用户 ID，后续查询和权限校验都必须携带。
      const userId = c.get("currentUser").id;
      // conversationId：路由中的会话 ID，必须先校验归属再读取消息。
      const conversationId = c.req.param("id");

      // 校验会话属于当前用户，避免越权读取消息。
      await requireConversation(c.env.DB, userId, conversationId);

      // 读取当前用户在该会话下的消息列表。
      const messages = await listMessages(c.env.DB, userId, conversationId);

      return c.json<MessagesResponse>({ messages });
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "读取消息失败");
    }
  });
