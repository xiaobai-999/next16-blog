import { z } from 'zod'

export const OrderDetailRequestSchema = z.object({
  orderId: z.string().trim().min(1),
})

export const OrderDetailResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'paid', 'fulfilled']),
  total: z.number(),
})

export type OrderDetailRequest = z.infer<typeof OrderDetailRequestSchema>
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>
