import type { MeResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";

/**
 * 当前用户路由。
 *
 * 返回认证中间件解析出的登录用户信息。
 */
export const meRoute = new Hono<AppEnv>().get("/", authMiddleware, (c) => {
  return c.json<MeResponse>({
    user: c.get("currentUser")
  });
});
