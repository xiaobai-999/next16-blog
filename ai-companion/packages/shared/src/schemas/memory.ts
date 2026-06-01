import { z } from "zod";
import { memoryStatusSchema, memoryTypeSchema } from "./common";

// memorySourceSchema：记忆来源，manual 表示用户手动新增，extracted 表示模型自动提取。
export const memorySourceSchema = z.enum(["manual", "extracted"]);

// memorySchema：长期记忆结构，用于记忆管理页和 prompt 注入。
export const memorySchema = z.object({
  // id：记忆 ID。
  id: z.string(),
  // userId：记忆所属用户，用于权限隔离。
  userId: z.string(),
  // companionId：记忆所属伴侣，用于区分不同伴侣上下文。
  companionId: z.string(),
  // type：记忆类型，决定展示分组和写入策略。
  type: memoryTypeSchema,
  // content：可长期复用的事实或偏好正文。
  content: z.string(),
  // importance：记忆重要性，影响 prompt 注入排序。
  importance: z.number().int().min(1),
  // source：记忆来源，区分用户手动新增和模型提取。
  source: memorySourceSchema,
  // sourceMessageId：提取记忆时对应的用户消息 ID，手动记忆为空。
  sourceMessageId: z.string().nullable(),
  // status：记忆治理状态，只有 active 会进入 prompt。
  status: memoryStatusSchema,
  // confidence：模型提取置信度，手动记忆默认由服务端写为 1。
  confidence: z.number().min(0).max(1),
  // sourceConversationId：提取记忆时对应的会话 ID，便于追踪来源。
  sourceConversationId: z.string().nullable(),
  // expiresAt：记忆过期时间，主要用于近期事件类记忆。
  expiresAt: z.string().nullable(),
  // archivedAt：记忆归档时间，归档后不再进入 prompt。
  archivedAt: z.string().nullable(),
  // deletedAt：记忆软删除时间，删除后不展示、不进入 prompt。
  deletedAt: z.string().nullable(),
  // conflictWithMemoryId：冲突记忆 ID，阶段 8 预留给后续冲突处理。
  conflictWithMemoryId: z.string().nullable(),
  // confirmationReason：待确认或冲突时展示给用户的简短原因。
  confirmationReason: z.string().nullable(),
  // createdAt：记忆创建时间，ISO 字符串。
  createdAt: z.string(),
  // updatedAt：记忆最近更新时间，ISO 字符串。
  updatedAt: z.string()
});

// createMemorySchema：手动新增记忆请求体。
export const createMemorySchema = z.object({
  // type：用户手动选择的记忆类型。
  type: memoryTypeSchema,
  // content：用户希望伴侣长期记住的内容。
  content: z.string().min(1).max(500),
  // importance：用户设置的重要性，默认按中等重要度保存。
  importance: z.number().int().min(1).max(5).default(3)
});

// updateMemorySchema：用户在记忆管理页允许修改的字段集合。
export const updateMemorySchema = z.object({
  // type：用户修正后的记忆类型。
  type: memoryTypeSchema.optional(),
  // content：用户修正后的记忆正文。
  content: z.string().min(1).max(500).optional(),
  // importance：用户调整后的重要性。
  importance: z.number().int().min(1).max(5).optional(),
  // expiresAt：事件类记忆的过期时间，null 表示取消过期时间。
  expiresAt: z.string().datetime().nullable().optional()
});

// candidateMemorySchema：模型自动提取出的候选记忆，后续交由 memory-policy 决策是否写入。
export const candidateMemorySchema = z.object({
  // type：模型判断的候选记忆类型。
  type: memoryTypeSchema,
  // content：模型提取的候选记忆正文。
  content: z.string().min(1).max(500),
  // importance：模型判断的复用价值，影响写入和注入排序。
  importance: z.number().int().min(1).max(5),
  // confidence：模型对候选记忆准确性的置信度。
  confidence: z.number().min(0).max(1),
  // reason：模型说明为什么这条候选记忆值得保存。
  reason: z.string().max(300).optional(),
  // expiresAt：候选事件记忆的过期时间，不确定时为空。
  expiresAt: z.string().datetime().nullable().optional()
});

// memoryExtractionResultSchema：记忆提取器的结构化 JSON 输出。
export const memoryExtractionResultSchema = z.object({
  memories: z.array(candidateMemorySchema).max(3)
});

export type MemorySource = z.infer<typeof memorySourceSchema>;
export type Memory = z.infer<typeof memorySchema>;
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
export type CandidateMemory = z.infer<typeof candidateMemorySchema>;
export type ExtractedMemory = CandidateMemory;
export type MemoryExtractionResult = z.infer<typeof memoryExtractionResultSchema>;

// MemoryResponse：创建单条记忆后的响应结构。
export type MemoryResponse = {
  memory: Memory;
};

// MemoriesResponse：记忆列表响应结构。
export type MemoriesResponse = {
  memories: Memory[];
};
