import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);
export const memoryTypeSchema = z.enum(["profile", "preference", "event"]);
export const feedbackRatingSchema = z.enum(["up", "down"]);
export const modelLogStatusSchema = z.enum(["success", "error"]);

export const idSchema = z.string().min(1);
export const isoDateSchema = z.string().datetime();

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export type ModelLogStatus = z.infer<typeof modelLogStatusSchema>;
