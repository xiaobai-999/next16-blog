import type { OrderDetailRequest, OrderDetailResponse } from '@repo/contracts'
import { http } from '../../http'

export const orderDetailPayload: OrderDetailRequest = { orderId: 'order-demo-001' }

export function postOrderDetail(payload: OrderDetailRequest = orderDetailPayload) {
  return http.post<OrderDetailRequest, OrderDetailResponse>(
    '/rpc/order/detail',
    payload,
  )
}
