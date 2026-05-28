import {
  createMemorySchema,
  type MemoriesResponse,
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
    // 读取当前用户的全部记忆，服务层会按 user_id 过滤。
    const memories = await listMemories(c.env.DB, c.get("currentUser").id);

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
