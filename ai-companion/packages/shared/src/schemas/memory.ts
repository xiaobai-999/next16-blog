import { z } from "zod";
import { memoryTypeSchema } from "./common";

export const memorySourceSchema = z.enum(["manual", "extracted"]);

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

export type MemorySource = z.infer<typeof memorySourceSchema>;
export type Memory = z.infer<typeof memorySchema>;
