import { loginSchema, registerSchema } from "@ai-companion/shared";
import type { AuthResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createUser, findUserByEmail } from "../services/users";
import { clearAuthCookie, setAuthCookie } from "../utils/cookies";
import { hashPassword, signJwt, verifyPassword } from "../utils/crypto";
import { apiError } from "../utils/errors";

/**
 * 认证路由。
 *
 * 负责注册、登录和退出登录，并通过 HttpOnly Cookie 维护登录态。
 */
export const authRoute = new Hono<AppEnv>()
  .post("/register", async (c) => {
    // body：注册请求体校验结果，确保前端和后端共享同一份 schema。
    const body = registerSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    // secret：JWT 签名密钥，缺失时不能继续创建登录态。
    const secret = c.env.JWT_SECRET;

    if (!secret) {
      return apiError(c, "INTERNAL_ERROR", "JWT secret is not configured");
    }

    // email：统一小写和去空白后的登录邮箱，用于唯一性判断。
    const email = body.data.email.trim().toLowerCase();
    // existing：同邮箱已存在的用户，存在时拒绝重复注册。
    const existing = await findUserByEmail(c.env.DB, email);

    if (existing) {
      return apiError(c, "CONFLICT", "邮箱已注册");
    }

    // user：新创建的用户领域对象，不包含 password_hash。
    const user = await createUser(c.env.DB, {
      id: crypto.randomUUID(),
      email,
      password_hash: await hashPassword(body.data.password),
      name: body.data.name?.trim() || null
    });

    setAuthCookie(c, await signJwt(user.id, secret));

    return c.json<AuthResponse>({ user }, 201);
  })
  .post("/login", async (c) => {
    // body：登录请求体校验结果，避免空邮箱或短密码进入认证逻辑。
    const body = loginSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    // secret：JWT 签名密钥，缺失时不能签发登录态。
    const secret = c.env.JWT_SECRET;

    if (!secret) {
      return apiError(c, "INTERNAL_ERROR", "JWT secret is not configured");
    }

    // found：按邮箱查到的用户和密码哈希行，用于校验密码。
    const found = await findUserByEmail(c.env.DB, body.data.email.trim().toLowerCase());

    if (!found || !(await verifyPassword(body.data.password, found.row.password_hash))) {
      return apiError(c, "UNAUTHORIZED", "邮箱或密码错误");
    }

    setAuthCookie(c, await signJwt(found.user.id, secret));

    return c.json<AuthResponse>({ user: found.user });
  })
  .post("/logout", (c) => {
    // 退出登录只清理认证 Cookie，不需要访问数据库。
    clearAuthCookie(c);

    return c.json({ ok: true });
  });
