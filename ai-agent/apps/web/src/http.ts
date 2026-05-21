import { BizCode, type ApiResponse } from '@repo/contracts'
import { getWebClientEnv } from './env.client'
import { getWebServerEnv } from './env.server'

type QueryValue = string | number | boolean | null | undefined
type QueryParams = Record<string, QueryValue>

function resolveBaseURL() {
  if (typeof window === 'undefined') {
    return getWebServerEnv().API_BASE_URL
  }

  return getWebClientEnv().NEXT_PUBLIC_API_BASE_URL
}

function buildSearchParams(query?: QueryParams) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()

  return queryString ? `?${queryString}` : ''
}

function createURL(path: string, query?: QueryParams) {
  const pathname = path.startsWith('/') ? path : `/${path}`

  return new URL(`${pathname}${buildSearchParams(query)}`, resolveBaseURL()).toString()
}

function createRequestInit(method: 'GET' | 'POST', body?: unknown): RequestInit {
  if (method === 'GET') {
    return { method }
  }

  return {
    method,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  }
}

async function request<TData>(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; query?: QueryParams } = {},
): Promise<ApiResponse<TData>> {
  try {
    const response = await fetch(
      createURL(path, options.query),
      createRequestInit(method, options.body),
    )

    return await response.json()
  } catch (error) {
    return {
      ok: false,
      error: {
        code: BizCode.SYSTEM_UPSTREAM_TIMEOUT,
        message: error instanceof Error ? error.message : 'API request failed',
      },
      meta: {
        requestId: 'unavailable',
        timestamp: new Date().toISOString(),
      },
    }
  }
}

export const http = {
  get<TData>(path: string, query?: QueryParams) {
    return request<TData>('GET', path, { query })
  },
  post<TBody, TData>(path: string, body: TBody, query?: QueryParams) {
    return request<TData>('POST', path, { body, query })
  },
}
