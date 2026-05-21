import type { ApiResponse } from '@repo/contracts'
import { http } from '../../http'

type HealthData = {
  service: 'api'
}

export function getHealthResponse(): Promise<ApiResponse<HealthData>> {
  return http.get<HealthData>('/health')
}
