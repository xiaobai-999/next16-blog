import { z } from 'zod'

// ── system 域：Ping 接口契约 ──
export const PingRequestSchema = z.object({
  name: z.string().trim().min(1),
})

export const PingResponseSchema = z.object({
  service: z.literal('api'),
  message: z.string(),
})

export type PingRequest = z.infer<typeof PingRequestSchema>
export type PingResponse = z.infer<typeof PingResponseSchema>
