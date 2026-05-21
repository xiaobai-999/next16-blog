import { z } from 'zod'

const ApiEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']),
})

export type ApiEnv = z.infer<typeof ApiEnvSchema>

export type AppBindings = {
  APP_ENV: 'development' | 'test' | 'production'
}

export function getApiEnv(env: unknown): ApiEnv {
  const bindings = env as Partial<AppBindings> | undefined

  return ApiEnvSchema.parse({
    APP_ENV: bindings?.APP_ENV,
  })
}
