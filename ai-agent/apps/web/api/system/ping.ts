import type { AppType } from '@repo/api'
import {
  BizCode,
  type ApiResponse,
  type PingRequest,
  type PingResponse,
} from '@repo/contracts'
import { type InferResponseType, hc } from 'hono/client'
import { createApiClient } from '../client'

export const rpcPayload: PingRequest = { name: 'web' }

export type PingRpcResponse = InferResponseType<
  ReturnType<typeof hc<AppType>>['rpc']['system']['ping']['$post']
>

export async function getPingResponse(): Promise<PingRpcResponse> {
  const client = createApiClient()

  try {
    const response = await client.rpc.system.ping.$post({
      json: rpcPayload,
    })

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
    } satisfies ApiResponse<PingResponse>
  }
}
