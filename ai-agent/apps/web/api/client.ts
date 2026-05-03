import type { AppType } from '@repo/api'
import { hc } from 'hono/client'

export const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:8787'

export function createApiClient() {
  return hc<AppType>(apiBaseUrl)
}
