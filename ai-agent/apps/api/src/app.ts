import {
  BizCode,
  buildFailure,
  type ApiMeta,
} from '@repo/contracts'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import routes from './routes'

type AppErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 504

class AppError extends Error {
  constructor(
    readonly code: BizCode,
    message: string,
    readonly status: AppErrorStatus,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

// ── 公共工具函数（供各域路由使用） ──
export function createMeta(): ApiMeta {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
}

const app = new Hono()

// ── 全局错误处理 ──
app.onError((error, c) => {
  const meta = createMeta()

  if (error instanceof AppError) {
    const errorMsg = { code: error.code, message: error.message, details: error.details }
    const res = buildFailure(errorMsg, meta)
    return c.json(res, error.status)
  }

  if (error instanceof HTTPException) {
    const errorMsg = { code: BizCode.COMMON_INVALID_REQUEST, message: error.message }
    const res = buildFailure(errorMsg, meta)
    return c.json(res, error.status)
  }

  console.error(error)

  const errorMsg = { code: BizCode.SYSTEM_INTERNAL_ERROR, message: 'Internal server error' }
  const res = buildFailure(errorMsg, meta)
  return c.json(res, 500)
})

app.notFound((c) => {
  const errorMsg = { code: BizCode.COMMON_NOT_FOUND, message: 'Not found' }
  const res = buildFailure(errorMsg, createMeta())
  return c.json(res, 404)
})

// ── 挂载域路由 ──
const route = app.route('/', routes)

export type AppType = typeof route

export default app