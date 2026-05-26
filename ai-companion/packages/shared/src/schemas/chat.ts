import { z } from "zod";
import { messageRoleSchema } from "./common";

export const chatRequestMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant"]),
    content: z.string().optional(),
    parts: z.array(z.object({ type: z.string() }).passthrough()).optional()
  })
  .refine((message) => message.content !== undefined || message.parts !== undefined, {
    message: "Either content or parts is required"
  });

export const chatRequestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    message: z.string().min(1).max(4000).optional(),
    messages: z.array(chatRequestMessageSchema).min(1).optional()
  })
  .refine((input) => input.message !== undefined || input.messages !== undefined, {
    message: "Either message or messages is required"
  });

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
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatRequestMessage = z.infer<typeof chatRequestMessageSchema>;
