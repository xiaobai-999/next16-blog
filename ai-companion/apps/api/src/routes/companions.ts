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

export const companionsRoute = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .post("/", async (c) => {
    const body = createCompanionSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    const companion = await createCompanion(c.env.DB, c.get("currentUser").id, body.data);

    return c.json<CompanionResponse>({ companion }, 201);
  })
  .get("/", async (c) => {
    const companions = await listCompanions(c.env.DB, c.get("currentUser").id);

    return c.json<CompanionsResponse>({ companions });
  })
  .get("/:id", async (c) => {
    const companion = await getCompanion(c.env.DB, c.get("currentUser").id, c.req.param("id"));

    if (!companion) {
      return apiError(c, "NOT_FOUND", "伴侣不存在");
    }

    return c.json<CompanionResponse>({ companion });
  })
  .patch("/:id", async (c) => {
    const body = updateCompanionSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

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
