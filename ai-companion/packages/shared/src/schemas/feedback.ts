import { z } from "zod";
import { feedbackRatingSchema } from "./common";

export const feedbackSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  userId: z.string(),
  rating: feedbackRatingSchema,
  reason: z.string().nullable(),
  createdAt: z.string()
});

export type Feedback = z.infer<typeof feedbackSchema>;
