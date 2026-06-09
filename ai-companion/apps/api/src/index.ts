import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoute } from "./routes/auth";
import { chatRoute } from "./routes/chat";
import { companionsRoute } from "./routes/companions";
import { conversationsRoute } from "./routes/conversations";
import { debugRoute } from "./routes/debug";
import { feedbackRoute } from "./routes/feedback";
import { healthRoute } from "./routes/health";
import { meRoute } from "./routes/me";
import { memoriesRoute } from "./routes/memories";
import type { AppEnv } from "./env";

// app：Hono 应用实例，统一注册中间件和业务路由。
const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin || origin === "http://localhost:3000") {
        return origin;
      }

      return null;
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["X-Conversation-Id", "X-Trace-Id", "X-Request-Id"],
    credentials: true
  })
);

app.route("/auth", authRoute);
app.route("/chat", chatRoute);
app.route("/companions", companionsRoute);
app.route("/conversations", conversationsRoute);
app.route("/debug", debugRoute);
app.route("/feedback", feedbackRoute);
app.route("/health", healthRoute);
app.route("/memories", memoriesRoute);
app.route("/me", meRoute);

export default app;
