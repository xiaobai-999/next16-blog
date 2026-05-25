import { z } from "zod";

export const createCompanionSchema = z.object({
  name: z.string().min(1).max(40),
  persona: z.string().min(1).max(1000),
  tone: z.string().min(1).max(500),
  relationship: z.string().min(1).max(500),
  boundaries: z.string().max(1000).optional()
});

export const updateCompanionSchema = createCompanionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

export const companionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().min(1),
  persona: z.string().min(1),
  tone: z.string().min(1),
  relationship: z.string().min(1),
  boundaries: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const companionResponseSchema = z.object({
  companion: companionSchema
});

export const companionsResponseSchema = z.object({
  companions: z.array(companionSchema)
});

export type CreateCompanionInput = z.infer<typeof createCompanionSchema>;
export type UpdateCompanionInput = z.infer<typeof updateCompanionSchema>;
export type Companion = z.infer<typeof companionSchema>;
export type CompanionResponse = z.infer<typeof companionResponseSchema>;
export type CompanionsResponse = z.infer<typeof companionsResponseSchema>;
