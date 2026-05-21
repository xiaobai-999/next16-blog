import {
  BizCode,
  OrderDetailRequestSchema,
  buildFailure,
  buildSuccess,
} from '@repo/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createMeta } from '../../app'
import type { AppBindings } from '../../env'

const orderRoute = new Hono<{ Bindings: AppBindings }>().post(
  '/detail',
  zValidator('json', OrderDetailRequestSchema, (result, c) => {
    if (result.success) {
      return
    }

    return c.json(
      buildFailure(
        {
          code: BizCode.COMMON_INVALID_REQUEST,
          message: 'Invalid request payload',
          details: result.error.flatten(),
        },
        createMeta(),
      ),
      400,
    )
  }),
  (c) => {
    const payload = c.req.valid('json')

    return c.json(
      buildSuccess(
        {
          id: payload.orderId,
          status: 'paid' as const,
          total: 12800,
        },
        createMeta(),
      ),
    )
  },
)

export default orderRoute
