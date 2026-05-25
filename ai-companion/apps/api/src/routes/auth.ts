import { loginSchema, registerSchema } from "@ai-companion/shared";
import type { AuthResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createUser, findUserByEmail } from "../services/users";
import { clearAuthCookie, setAuthCookie } from "../utils/cookies";
import { hashPassword, signJwt, verifyPassword } from "../utils/crypto";
import { apiError } from "../utils/errors";

export const authRoute = new Hono<AppEnv>()
  .post("/register", async (c) => {
    const body = registerSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    const secret = c.env.JWT_SECRET;

    if (!secret) {
      return apiError(c, "INTERNAL_ERROR", "JWT secret is not configured");
    }

    const email = body.data.email.trim().toLowerCase();
    const existing = await findUserByEmail(c.env.DB, email);

    if (existing) {
      return apiError(c, "CONFLICT", "邮箱已注册");
    }

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
    const body = loginSchema.safeParse(await c.req.json().catch(() => undefined));

    if (!body.success) {
      return apiError(c, "BAD_REQUEST", "请求参数无效");
    }

    const secret = c.env.JWT_SECRET;

    if (!secret) {
      return apiError(c, "INTERNAL_ERROR", "JWT secret is not configured");
    }

    const found = await findUserByEmail(c.env.DB, body.data.email.trim().toLowerCase());

    if (!found || !(await verifyPassword(body.data.password, found.row.password_hash))) {
      return apiError(c, "UNAUTHORIZED", "邮箱或密码错误");
    }

    setAuthCookie(c, await signJwt(found.user.id, secret));

    return c.json<AuthResponse>({ user: found.user });
  })
  .post("/logout", (c) => {
    clearAuthCookie(c);

    return c.json({ ok: true });
  });
