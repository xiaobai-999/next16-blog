import {
  BizCode,
  PingRequestSchema,
  buildFailure,
  buildSuccess,
} from '@repo/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createMeta } from '../../app'
import { getApiEnv, type AppBindings } from '../../env'

const pingRoute = new Hono<{ Bindings: AppBindings }>()
  .post(
    '/',
    zValidator('json', PingRequestSchema, (result, c) => {
      if (result.success) {
        return
      }

      const res = {
        code: BizCode.COMMON_INVALID_REQUEST,
        message: 'Invalid request payload',
        details: result.error.issues,
      }

      return c.json(buildFailure(res, createMeta()), 400)
    }),
    (c) => {
      const payload = c.req.valid('json')
      const env = getApiEnv(c.env)

      return c.json(
        buildSuccess(
          {
            service: 'api',
            message: `pong, ${payload.name}`,
            env: env.APP_ENV,
          },
          createMeta(),
        ),
      )
    },
  )

export default pingRoute
