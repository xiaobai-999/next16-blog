import { createMiddleware } from "hono/factory";
import { findUserById } from "../services/users";
import { getAuthCookie } from "../utils/cookies";
import { verifyJwt } from "../utils/crypto";
import { apiError } from "../utils/errors";
import type { AppEnv } from "../env";

/**
 * 认证中间件。
 *
 * 校验 HttpOnly Cookie 中的 JWT，并把当前用户写入 Hono context。
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // secret：JWT 验签密钥，缺失时所有受保护接口都不能安全鉴权。
  const secret = c.env.JWT_SECRET;

  if (!secret) {
    return apiError(c, "INTERNAL_ERROR", "JWT secret is not configured");
  }

  // token：认证 Cookie 中保存的 JWT。
  const token = getAuthCookie(c);

  if (!token) {
    return apiError(c, "UNAUTHORIZED", "未登录");
  }

  try {
    // payload：JWT 验签成功后的用户身份载荷。
    const payload = await verifyJwt(token, secret);

    if (!payload) {
      return apiError(c, "UNAUTHORIZED", "未登录");
    }

    // user：数据库中真实存在的当前用户，防止已删除用户继续使用旧 token。
    const user = await findUserById(c.env.DB, payload.userId);

    if (!user) {
      return apiError(c, "UNAUTHORIZED", "未登录");
    }

    c.set("currentUser", user);
    return next();
  } catch {
    return apiError(c, "UNAUTHORIZED", "未登录");
  }
});
