import { z } from "zod";
import { messageRoleSchema } from "./common";

// chatRequestMessageSchema：前端发给 /chat 的单条消息，兼容旧 content 和 AI SDK parts。
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

// chatRequestSchema：/chat 请求体，支持首次简单 message 或 AI SDK messages 列表。
export const chatRequestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    message: z.string().min(1).max(4000).optional(),
    messages: z.array(chatRequestMessageSchema).min(1).optional()
  })
  .refine((input) => input.message !== undefined || input.messages !== undefined, {
    message: "Either message or messages is required"
  });

// conversationSchema：聊天会话结构，用于会话列表和当前会话恢复。
export const conversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companionId: z.string(),
  title: z.string().nullable(),
  lastMessagePreview: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

// messageSchema：数据库消息结构，用于历史消息查询和前端恢复聊天列表。
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

// ConversationResponse：创建或读取单个会话时的响应结构。
export type ConversationResponse = {
  conversation: Conversation;
};

// ConversationsResponse：会话列表响应结构。
export type ConversationsResponse = {
  conversations: Conversation[];
};

// MessagesResponse：指定会话的历史消息响应结构。
export type MessagesResponse = {
  messages: Message[];
};
