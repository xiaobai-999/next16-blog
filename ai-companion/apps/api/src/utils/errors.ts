import type { Context } from "hono";
import type { ApiErrorCode, ApiErrorResponse } from "@ai-companion/shared";

const statusByCode: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 409 | 500> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500
};

export function apiError(c: Context, code: ApiErrorCode, message: string) {
  const body: ApiErrorResponse = {
    error: {
      code,
      message
    }
  };

  return c.json(body, statusByCode[code]);
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
