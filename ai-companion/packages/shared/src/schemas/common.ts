import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

// memoryTypeSchema：长期记忆类型，用于区分资料、偏好、近期事件、关系定位和互动边界。
export const memoryTypeSchema = z.enum([
  "profile",
  "preference",
  "event",
  "relationship",
  "boundary"
]);

// memoryStatusSchema：记忆治理状态，只有 active 会进入聊天 prompt。
export const memoryStatusSchema = z.enum([
  "active",
  "archived",
  "deleted",
  "pending_confirmation"
]);
export const feedbackRatingSchema = z.enum(["up", "down"]);
export const modelLogStatusSchema = z.enum(["success", "error"]);

export const idSchema = z.string().min(1);
export const isoDateSchema = z.string().datetime();

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export type ModelLogStatus = z.infer<typeof modelLogStatusSchema>;
