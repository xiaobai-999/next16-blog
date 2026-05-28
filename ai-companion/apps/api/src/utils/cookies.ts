import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "../env";

// authCookieName：保存 JWT 登录态的 HttpOnly Cookie 名称。
export const authCookieName = "ai_companion_token";

/**
 * 读取当前请求中的认证 Cookie。
 */
export function getAuthCookie(c: Context<AppEnv>) {
  return getCookie(c, authCookieName);
}

/**
 * 写入认证 Cookie。
 *
 * Cookie 使用 HttpOnly，避免浏览器脚本直接读取 JWT。
 */
export function setAuthCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, authCookieName, token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:"
  });
}

/**
 * 清理认证 Cookie。
 */
export function clearAuthCookie(c: Context<AppEnv>) {
  deleteCookie(c, authCookieName, {
    path: "/"
  });
}
