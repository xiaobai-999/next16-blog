import {
  createMemorySchema,
  memoryStatusSchema,
  type MemoriesResponse,
  type MemoryStatus,
  type MemoryResponse
} from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import { createManualMemory, deleteMemory, listMemories } from "../services/memories";
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
    // status：可选记忆状态过滤，阶段 9 会用于待确认记忆列表。
    const statusParam = c.req.query("status");
    let statusFilter: MemoryStatus | undefined;

    if (statusParam !== undefined) {
      const parsedStatus = memoryStatusSchema.safeParse(statusParam);

      if (!parsedStatus.success) {
        return apiError(c, "BAD_REQUEST", "记忆状态无效");
      }

      statusFilter = parsedStatus.data;
    }

    // 读取当前用户的非删除记忆，服务层会按 user_id 过滤。
    const memories = await listMemories(c.env.DB, c.get("currentUser").id, statusFilter);

    return c.json<MemoriesResponse>({ memories });
  })
  .post("/", async (c) => {
    const body = createMemorySchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    try {
      // 手动新增记忆默认绑定当前用户的默认伴侣。
      const memory = await createManualMemory(c.env.DB, c.get("currentUser").id, body.data);

      return c.json<MemoryResponse>({ memory }, 201);
    } catch (error) {
      if (error instanceof ServiceError) {
        return apiError(c, error.code, error.message);
      }

      return apiError(c, "INTERNAL_ERROR", "创建记忆失败");
    }
  })
  .delete("/:id", async (c) => {
    // memoryId：路由中的记忆 ID，删除时还会同时校验当前 user_id。
    const memoryId = c.req.param("id");
    const deleted = await deleteMemory(c.env.DB, c.get("currentUser").id, memoryId);

    if (!deleted) {
      return apiError(c, "NOT_FOUND", "记忆不存在");
    }

    return c.json({ ok: true });
  });
