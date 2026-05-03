import { z } from 'zod'

const ApiEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_BASE_URL: z.string().default('http://127.0.0.1:8787'),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_API_BASE_URL: z.string().default('http://127.0.0.1:8787'),
})

export type ApiEnv = z.infer<typeof ApiEnvSchema>

export function getApiEnv(env: unknown): ApiEnv {
  return ApiEnvSchema.parse(env ?? {})
}
