import { type ModelLogsResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import { listModelLogs } from "../services/model-logs";
import { apiError } from "../utils/errors";

/**
 * 判断当前请求是否来自本地开发地址。
 *
 * MVP 暂无管理员角色，因此 debug 数据第一版只允许本地登录用户访问。
 */
function isLocalDebugRequest(request: Request) {
  const hostname = new URL(request.url).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * 解析 debug 日志查询条数。
 *
 * limit 限制在 1-100，避免一次性拉取过多日志影响本地调试体验。
 */
function readLimit(value: string | undefined) {
  const limit = Number(value ?? 50);

  if (!Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(100, Math.max(1, Math.trunc(limit)));
}

/**
 * 本地调试路由。
 *
 * 只暴露模型调用日志，不返回 prompt 明文。
 */
export const debugRoute = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .get("/model-logs", async (c) => {
    if (!isLocalDebugRequest(c.req.raw)) {
      return apiError(c, "FORBIDDEN", "debug 接口仅允许本地访问");
    }

    // limit：本次读取的最近模型日志数量。
    const limit = readLimit(c.req.query("limit"));
    // logs：按创建时间倒序返回的模型调用日志。
    const logs = await listModelLogs(c.env.DB, limit);

    return c.json<ModelLogsResponse>({ logs });
  });
