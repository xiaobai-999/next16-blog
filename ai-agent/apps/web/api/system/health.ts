import type { AppType } from '@repo/api'
import { BizCode, type ApiResponse } from '@repo/contracts'
import { type InferResponseType, hc } from 'hono/client'
import { createApiClient } from '../client'

type HealthData = {
  service: 'api'
}

type HealthEndpointResponse = InferResponseType<
  ReturnType<typeof hc<AppType>>['health']['$get']
>

export type HealthRpcResponse = HealthEndpointResponse | ApiResponse<HealthData>

export async function getHealthResponse(): Promise<HealthRpcResponse> {
  const client = createApiClient()

  try {
    const response = await client.health.$get()

    return await response.json()
  } catch (error) {
    return {
      ok: false,
      error: {
        code: BizCode.SYSTEM_UPSTREAM_TIMEOUT,
        message: error instanceof Error ? error.message : 'API request failed',
      },
      meta: {
        requestId: 'unavailable',
        timestamp: new Date().toISOString(),
      },
    } satisfies ApiResponse<HealthData>
  }
}
