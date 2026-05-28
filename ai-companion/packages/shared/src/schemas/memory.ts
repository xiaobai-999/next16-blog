import { z } from "zod";
import { memoryTypeSchema } from "./common";

// memorySourceSchema：记忆来源，manual 表示用户手动新增，extracted 表示模型自动提取。
export const memorySourceSchema = z.enum(["manual", "extracted"]);

// memorySchema：长期记忆结构，用于记忆管理页和 prompt 注入。
export const memorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  companionId: z.string(),
  type: memoryTypeSchema,
  content: z.string(),
  importance: z.number().int().min(1),
  source: memorySourceSchema,
  sourceMessageId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

// createMemorySchema：手动新增记忆请求体。
export const createMemorySchema = z.object({
  type: memoryTypeSchema,
  content: z.string().min(1).max(500),
  importance: z.number().int().min(1).max(5).default(3)
});

// extractedMemorySchema：模型自动提取出的单条候选记忆。
export const extractedMemorySchema = z.object({
  type: memoryTypeSchema,
  content: z.string().min(1).max(500),
  importance: z.number().int().min(1).max(5)
});

// memoryExtractionResultSchema：记忆提取器的结构化 JSON 输出。
export const memoryExtractionResultSchema = z.object({
  memories: z.array(extractedMemorySchema).max(3)
});

export type MemorySource = z.infer<typeof memorySourceSchema>;
export type Memory = z.infer<typeof memorySchema>;
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;
export type ExtractedMemory = z.infer<typeof extractedMemorySchema>;
export type MemoryExtractionResult = z.infer<typeof memoryExtractionResultSchema>;

// MemoryResponse：创建单条记忆后的响应结构。
export type MemoryResponse = {
  memory: Memory;
};

// MemoriesResponse：记忆列表响应结构。
export type MemoriesResponse = {
  memories: Memory[];
};
