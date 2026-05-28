import {
  createCompanionSchema,
  updateCompanionSchema,
  type CompanionResponse,
  type CompanionsResponse
} from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import {
  createCompanion,
  getCompanion,
  listCompanions,
  updateCompanion
} from "../services/companions";
import { apiError } from "../utils/errors";

/**
 * 伴侣配置路由。
 *
 * 提供当前用户伴侣的人设创建、读取和更新能力。
 */
export const companionsRoute = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .post("/", async (c) => {
    // body：创建伴侣请求体校验结果，字段包括名称、人设、语气、关系和边界。
    const body = createCompanionSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    // companion：创建后的伴侣配置。
    const companion = await createCompanion(c.env.DB, c.get("currentUser").id, body.data);

    return c.json<CompanionResponse>({ companion }, 201);
  })
  .get("/", async (c) => {
    // companions：当前登录用户的伴侣列表，服务层按 user_id 过滤。
    const companions = await listCompanions(c.env.DB, c.get("currentUser").id);

    return c.json<CompanionsResponse>({ companions });
  })
  .get("/:id", async (c) => {
    // companion：按 id + user_id 查询，避免读取他人的伴侣配置。
    const companion = await getCompanion(c.env.DB, c.get("currentUser").id, c.req.param("id"));

    if (!companion) {
      return apiError(c, "NOT_FOUND", "伴侣不存在");
    }

    return c.json<CompanionResponse>({ companion });
  })
  .patch("/:id", async (c) => {
    // body：更新伴侣请求体校验结果，支持局部更新。
    const body = updateCompanionSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    // companion：更新后的伴侣配置，未找到时说明资源不存在或不属于当前用户。
    const companion = await updateCompanion(
      c.env.DB,
      c.get("currentUser").id,
      c.req.param("id"),
      body.data
    );

    if (!companion) {
      return apiError(c, "NOT_FOUND", "伴侣不存在");
    }

    return c.json<CompanionResponse>({ companion });
  });
