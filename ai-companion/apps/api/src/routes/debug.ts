import { type ModelLogsResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";
import { getDebugMetrics, listModelLogs, listModelLogsByTraceId } from "../services/model-logs";
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
 * 解析 metrics 时间窗口。
 *
 * hours 限制在 1-168 小时，避免本地误查过大范围。
 */
function readHours(value: string | undefined) {
  const hours = Number(value ?? 24);

  if (!Number.isFinite(hours)) {
    return 24;
  }

  return Math.min(168, Math.max(1, Math.trunc(hours)));
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
  })
  .get("/model-logs/:traceId", async (c) => {
    if (!isLocalDebugRequest(c.req.raw)) {
      return apiError(c, "FORBIDDEN", "debug 接口仅允许本地访问");
    }

    // traceId：聊天响应头返回的链路 ID，用于定位单次请求。
    const traceId = c.req.param("traceId");
    // logs：该 trace 下的模型调用日志，按时间正序返回。
    const logs = await listModelLogsByTraceId(c.env.DB, traceId);

    return c.json<ModelLogsResponse>({ logs });
  })
  .get("/metrics", async (c) => {
    if (!isLocalDebugRequest(c.req.raw)) {
      return apiError(c, "FORBIDDEN", "debug 接口仅允许本地访问");
    }

    // hours：统计窗口，默认最近 24 小时。
    const hours = readHours(c.req.query("hours"));
    // metrics：MVP 试运行需要观察的聚合指标。
    const metrics = await getDebugMetrics(c.env.DB, hours);

    return c.json({ metrics });
  });
