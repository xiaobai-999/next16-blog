import type { MeResponse } from "@ai-companion/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware/auth";

export const meRoute = new Hono<AppEnv>().get("/", authMiddleware, (c) => {
  return c.json<MeResponse>({
    user: c.get("currentUser")
  });
});
