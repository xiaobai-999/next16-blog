import { buildSuccess } from '@repo/contracts'
import { Hono } from 'hono'
import { createMeta } from '../../app'
import type { AppBindings } from '../../env'

const healthRoute = new Hono<{ Bindings: AppBindings }>()
  .get('/', (c) => {
    return c.json(buildSuccess({ service: 'api' }, createMeta()))
  })

export default healthRoute
