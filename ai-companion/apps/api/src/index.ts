import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoute } from "./routes/auth";
import { companionsRoute } from "./routes/companions";
import { healthRoute } from "./routes/health";
import { meRoute } from "./routes/me";
import type { AppEnv } from "./env";

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
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true
  })
);

app.route("/auth", authRoute);
app.route("/companions", companionsRoute);
app.route("/health", healthRoute);
app.route("/me", meRoute);

export default app;
