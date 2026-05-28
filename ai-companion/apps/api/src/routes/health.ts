import { Hono } from "hono";
import type { HealthResponse } from "@ai-companion/shared";
import type { AppEnv } from "../env";

/**
 * 健康检查路由。
 *
 * 用于本地开发和部署环境确认 Worker API 是否可达。
 */
export const healthRoute = new Hono<AppEnv>().get("/", (c) => {
  return c.json<HealthResponse>({ ok: true });
});
