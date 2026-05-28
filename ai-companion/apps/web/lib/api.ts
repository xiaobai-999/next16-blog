import {
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_REGISTER_PATH,
  API_COMPANIONS_PATH,
  API_CONVERSATIONS_PATH,
  API_FEEDBACK_PATH,
  API_MEMORIES_PATH,
  API_ME_PATH,
  type ApiErrorResponse
} from "@ai-companion/shared";
import type {
  AuthResponse,
  CompanionResponse,
  CompanionsResponse,
  ConversationResponse,
  ConversationsResponse,
  CreateCompanionInput,
  CreateFeedbackInput,
  CreateMemoryInput,
  FeedbackResponse,
  LoginInput,
  MeResponse,
  MemoriesResponse,
  MemoryResponse,
  MessagesResponse,
  RegisterInput
} from "@ai-companion/shared";

// apiBaseUrl：前端请求后端 API 的基础地址，本地默认指向 Wrangler dev。
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

/**
 * 统一的浏览器端 API 请求封装。
 *
 * 默认携带 HttpOnly Cookie，并把后端统一错误结构转换成 Error。
 */
async function apiRequest<T>(path: string, init?: RequestInit) {
  // response：后端 API 原始响应，成功后按调用方指定类型解析 JSON。
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    // error：后端约定的错误响应；解析失败时使用兜底错误文案。
    const error = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(error?.error.message ?? "请求失败");
  }

  return (await response.json()) as T;
}

/**
 * 注册新用户并建立登录态。
 */
export function register(input: RegisterInput) {
  return apiRequest<AuthResponse>(API_AUTH_REGISTER_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * 用户登录并写入 HttpOnly Cookie。
 */
export function login(input: LoginInput) {
  return apiRequest<AuthResponse>(API_AUTH_LOGIN_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * 退出登录并清理服务端认证 Cookie。
 */
export function logout() {
  return apiRequest<{ ok: true }>(API_AUTH_LOGOUT_PATH, {
    method: "POST"
  });
}

/**
 * 获取当前登录用户。
 */
export function getMe() {
  return apiRequest<MeResponse>(API_ME_PATH);
}

/**
 * 获取当前用户的伴侣列表。
 */
export function listCompanions() {
  return apiRequest<CompanionsResponse>(API_COMPANIONS_PATH);
}

/**
 * 创建当前用户的伴侣配置。
 */
export function createCompanion(input: CreateCompanionInput) {
  return apiRequest<CompanionResponse>(API_COMPANIONS_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * 获取当前用户的会话列表。
 */
export function listConversations() {
  return apiRequest<ConversationsResponse>(API_CONVERSATIONS_PATH);
}

/**
 * 手动创建一个空会话。
 *
 * 当前聊天页主要依赖首次发送消息时自动创建会话，此函数保留给后续“新会话”按钮使用。
 */
export function createConversation() {
  return apiRequest<ConversationResponse>(API_CONVERSATIONS_PATH, {
    method: "POST"
  });
}

/**
 * 获取指定会话的历史消息。
 */
export function listMessages(conversationId: string) {
  return apiRequest<MessagesResponse>(`${API_CONVERSATIONS_PATH}/${conversationId}/messages`);
}

/**
 * 获取当前用户的长期记忆列表。
 */
export function listMemories() {
  return apiRequest<MemoriesResponse>(API_MEMORIES_PATH);
}

/**
 * 手动新增一条长期记忆。
 */
export function createMemory(input: CreateMemoryInput) {
  return apiRequest<MemoryResponse>(API_MEMORIES_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * 删除指定长期记忆。
 */
export function deleteMemory(id: string) {
  return apiRequest<{ ok: true }>(`${API_MEMORIES_PATH}/${id}`, {
    method: "DELETE"
  });
}

/**
 * 提交当前用户对某条 assistant 回复的反馈。
 */
export function submitFeedback(input: CreateFeedbackInput) {
  return apiRequest<FeedbackResponse>(API_FEEDBACK_PATH, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
