import { z } from "zod";
import { feedbackRatingSchema } from "./common";

// feedbackSchema：用户对 assistant 消息的点赞/点踩反馈记录。
export const feedbackSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  userId: z.string(),
  rating: feedbackRatingSchema,
  reason: z.string().nullable(),
  createdAt: z.string()
});

// createFeedbackSchema：提交消息反馈的请求体。
export const createFeedbackSchema = z.object({
  messageId: z.string().min(1),
  rating: feedbackRatingSchema,
  reason: z.string().max(500).optional()
});

export type Feedback = z.infer<typeof feedbackSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

// FeedbackResponse：反馈提交后的响应结构。
export type FeedbackResponse = {
  feedback: Feedback;
};
