import { Hono } from "hono";
import type { HealthResponse } from "@ai-companion/shared";
import type { AppEnv } from "../env";

export const healthRoute = new Hono<AppEnv>().get("/", (c) => {
  return c.json<HealthResponse>({ ok: true });
});
