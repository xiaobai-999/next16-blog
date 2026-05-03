import { Hono } from 'hono'
import type { AppBindings } from '../env'
import healthRoute from './system/health.route'
import pingRoute from './system/ping.route'

const routes = new Hono<{ Bindings: AppBindings }>()

const appRoutes = routes
  .route('/health', healthRoute)
  .route('/rpc/system/ping', pingRoute)

export type RoutesType = typeof appRoutes

export default appRoutes
