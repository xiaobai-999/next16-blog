import {
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_REGISTER_PATH,
  API_COMPANIONS_PATH,
  API_ME_PATH,
  type ApiErrorResponse
} from "@ai-companion/shared";
import type {
  AuthResponse,
  CompanionResponse,
  CompanionsResponse,
  CreateCompanionInput,
  LoginInput,
  MeResponse,
  RegisterInput
} from "@ai-companion/shared";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(error?.error.message ?? "请求失败");
  }

  return (await response.json()) as T;
}

export function register(input: RegisterInput) {
  return apiRequest<AuthResponse>(API_AUTH_REGISTER_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(input: LoginInput) {
  return apiRequest<AuthResponse>(API_AUTH_LOGIN_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function logout() {
  return apiRequest<{ ok: true }>(API_AUTH_LOGOUT_PATH, {
    method: "POST"
  });
}

export function getMe() {
  return apiRequest<MeResponse>(API_ME_PATH);
}

export function listCompanions() {
  return apiRequest<CompanionsResponse>(API_COMPANIONS_PATH);
}

export function createCompanion(input: CreateCompanionInput) {
  return apiRequest<CompanionResponse>(API_COMPANIONS_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
