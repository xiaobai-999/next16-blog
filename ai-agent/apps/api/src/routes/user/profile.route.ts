import { buildSuccess } from '@repo/contracts'
import { Hono } from 'hono'
import { createMeta } from '../../app'
import type { AppBindings } from '../../env'

const userRoute = new Hono<{ Bindings: AppBindings }>().get('/profile', (c) => {
  return c.json(
    buildSuccess(
      {
        id: 'user-demo',
        name: 'Demo User',
        role: 'operator',
      },
      createMeta(),
    ),
  )
})

export default userRoute
