import { z } from "zod";
import { modelLogStatusSchema } from "./common";

// modelLogSchema：模型调用日志结构，用于本地 debug 查询。
export const modelLogSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  userId: z.string(),
  conversationId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  promptTokens: z.number().int().nullable(),
  completionTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  status: modelLogStatusSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string()
});

export type ModelLog = z.infer<typeof modelLogSchema>;

// ModelLogsResponse：模型调用日志列表响应结构。
export type ModelLogsResponse = {
  logs: ModelLog[];
};
