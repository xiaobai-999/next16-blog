import { buildSuccess } from '@repo/contracts'
import { Hono } from 'hono'
import { createMeta } from '../../app'
import type { AppBindings } from '../../env'

const catalogRoute = new Hono<{ Bindings: AppBindings }>().get('/list', (c) => {
  return c.json(
    buildSuccess(
      {
        items: [
          { id: 'cat-ai', name: 'AI Companion', category: 'agent' },
          { id: 'cat-workflow', name: 'Workflow Kit', category: 'automation' },
        ],
      },
      createMeta(),
    ),
  )
})

export default catalogRoute
