import { z } from "zod";
import { messageRoleSchema } from "./common";

export const conversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companionId: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const messageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conversationId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  tokenCount: z.number().int().nullable(),
  createdAt: z.string()
});

export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
