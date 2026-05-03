import { z } from 'zod'

const ApiEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_BASE_URL: z.string().default('http://127.0.0.1:8787'),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_API_BASE_URL: z.string().default('http://127.0.0.1:8787'),
})

export type ApiEnv = z.infer<typeof ApiEnvSchema>

// Hono Bindings 类型（编译时类型提示）
export type AppBindings = {
  APP_ENV: 'development' | 'test' | 'production'
  API_BASE_URL: string
  NEXT_PUBLIC_APP_ENV: 'development' | 'test' | 'production'
  NEXT_PUBLIC_API_BASE_URL: string
}

// 运行时校验（含默认值回填）
export function getApiEnv(env: unknown): ApiEnv {
  return ApiEnvSchema.parse(env ?? {})
}
