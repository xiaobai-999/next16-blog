import type { PingRequest, PingResponse } from '@repo/contracts'
import { http } from '../../http'

export const rpcPayload: PingRequest = { name: 'web' }

export function getPingResponse() {
  return http.post<PingRequest, PingResponse>('/rpc/system/ping', rpcPayload)
}
