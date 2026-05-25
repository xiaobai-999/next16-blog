import { createMiddleware } from "hono/factory";
import { findUserById } from "../services/users";
import { getAuthCookie } from "../utils/cookies";
import { verifyJwt } from "../utils/crypto";
import { apiError } from "../utils/errors";
import type { AppEnv } from "../env";

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const secret = c.env.JWT_SECRET;

  if (!secret) {
    return apiError(c, "INTERNAL_ERROR", "JWT secret is not configured");
  }

  const token = getAuthCookie(c);

  if (!token) {
    return apiError(c, "UNAUTHORIZED", "未登录");
  }

  try {
    const payload = await verifyJwt(token, secret);

    if (!payload) {
      return apiError(c, "UNAUTHORIZED", "未登录");
    }

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
