import {
  createMemorySchema,
  memoryStatusSchema,
  type MemoriesResponse,
  type MemoryStatus,
  type MemoryResponse,
  updateMemorySchema
} from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import {
  confirmMemory,
  createManualMemoryWithEmbedding,
  listMemories,
  rejectMemory,
  softDeleteMemory,
  updateMemory
} from "../services/memories";
import { ServiceError } from "../services/service-error";
import { apiError } from "../utils/errors";

/**
 * 记忆管理路由。
 *
 * 提供当前用户的长期记忆查看、手动新增和删除能力。
 */
export const memoriesRoute = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .get("/", async (c) => {
    // status：可选记忆状态过滤，用于只查看 active 或 pending_confirmation。
    const statusParam = c.req.query("status");
    // includeArchived：是否把 archived 记忆也放进默认列表。
    const includeArchived = c.req.query("includeArchived") === "true";
    // sourceConversationId：轻量来源会话筛选，供“记错了”后排查预留。
    const sourceConversationId = c.req.query("sourceConversationId");
    let statusFilter: MemoryStatus | undefined;

    if (statusParam !== undefined) {
      const parsedStatus = memoryStatusSchema.safeParse(statusParam);

      if (!parsedStatus.success) {
        return apiError(c, "BAD_REQUEST", "记忆状态无效");
      }

      statusFilter = parsedStatus.data;
    }

    // 读取当前用户的非删除记忆，服务层会按 user_id 过滤。
    const memories = await listMemories(c.env.DB, c.get("currentUser").id, {
      status: statusFilter,
      includeArchived,
      sourceConversationId
    });

    return c.json<MemoriesResponse>({ memories });
  })
  .post("/", async (c) => {
    const body = createMemorySchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    try {
      // 手动新增记忆默认绑定当前用户的默认伴侣。
      const memory = await createManualMemoryWithEmbedding(c.env, c.get("currentUser").id, body.data);

      return c.json<MemoryResponse>({ memory }, 201);
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "创建记忆失败");
    }
  })
  .patch("/:id", async (c) => {
    const body = updateMemorySchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    try {
      // memoryId：路由中的记忆 ID，更新时服务层会同时校验当前 user_id。
      const memoryId = c.req.param("id");
      const memory = await updateMemory(c.env, c.get("currentUser").id, memoryId, body.data);

      return c.json<MemoryResponse>({ memory });
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "更新记忆失败");
    }
  })
  .delete("/:id", async (c) => {
    // memoryId：路由中的记忆 ID，删除时还会同时校验当前 user_id。
    const memoryId = c.req.param("id");
    const deleted = await softDeleteMemory(c.env, c.get("currentUser").id, memoryId);

    if (!deleted) {
      return apiError(c, "NOT_FOUND", "记忆不存在");
    }

    return c.json({ ok: true });
  })
  .post("/:id/confirm", async (c) => {
    try {
      // memoryId：待确认记忆 ID，服务层会限制只能确认自己的 pending 记忆。
      const memoryId = c.req.param("id");
      const memory = await confirmMemory(c.env, c.get("currentUser").id, memoryId);

      return c.json<MemoryResponse>({ memory });
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "确认记忆失败");
    }
  })
  .post("/:id/reject", async (c) => {
    try {
      // memoryId：待拒绝记忆 ID，拒绝后按软删除处理。
      const memoryId = c.req.param("id");
      const deleted = await rejectMemory(c.env, c.get("currentUser").id, memoryId);

      if (!deleted) {
        return apiError(c, "NOT_FOUND", "记忆不存在");
      }

      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "拒绝记忆失败");
    }
  });
