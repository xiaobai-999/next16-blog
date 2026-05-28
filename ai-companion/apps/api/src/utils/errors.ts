import type { Context } from "hono";
import type { ApiErrorCode, ApiErrorResponse } from "@ai-companion/shared";

// statusByCode：业务错误码到 HTTP 状态码的统一映射。
const statusByCode: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 409 | 500> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  COMPANION_REQUIRED: 409,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500
};

/**
 * 返回统一 API 错误响应。
 */
export function apiError(c: Context, code: ApiErrorCode, message: string) {
  // body：前端统一解析的错误响应结构。
  const body: ApiErrorResponse = {
    error: {
      code,
      message
    }
  };

  return c.json(body, statusByCode[code]);
}

/**
 * 将未知异常转换成可读错误文案。
 */
export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
