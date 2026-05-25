import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "../env";

export const authCookieName = "ai_companion_token";

export function getAuthCookie(c: Context<AppEnv>) {
  return getCookie(c, authCookieName);
}

export function setAuthCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, authCookieName, token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:"
  });
}

export function clearAuthCookie(c: Context<AppEnv>) {
  deleteCookie(c, authCookieName, {
    path: "/"
  });
}
