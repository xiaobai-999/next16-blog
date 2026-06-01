"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { API_CHAT_PATH } from "@ai-companion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Companion, FeedbackRating, Message } from "@ai-companion/shared";
import {
  apiBaseUrl,
  getMe,
  listCompanions,
  listConversations,
  listMessages as listConversationMessages,
  logout,
  submitFeedback
} from "../../lib/api";

/**
 * 将后端数据库消息转换成 useChat 可展示的 UIMessage。
 */
function dbMessageToUiMessage(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }]
  };
}

/**
 * 渲染 UIMessage 中的文本 parts。
 *
 * 当前聊天页只展示文本消息，非文本 part 会被忽略。
 */
function MessageText({ message }: { message: UIMessage }) {
  // text：拼接后的消息正文，用于展示用户和 assistant 的文本内容。
  const text = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

  return <>{text}</>;
}

export default function ChatPage() {
  const router = useRouter();
  // companion：当前用户的默认伴侣，聊天页标题和 prompt 均依赖它。
  const [companion, setCompanion] = useState<Companion | null>(null);
  // conversationId：当前连续聊天会话 ID；为空时后端会复用或创建当前伴侣的持续会话。
  const [conversationId, setConversationId] = useState<string | null>(null);
  // isLoadingHistory：历史消息加载状态，用于禁用发送和切换会话。
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // input：消息输入框内容。
  const [input, setInput] = useState("");
  // feedbackByMessage：当前页面已提交的消息反馈，按消息 ID 保存点赞/点踩状态。
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, FeedbackRating>>({});
  // pendingFeedbackMessageId：正在提交反馈的消息 ID，用于禁用重复点击。
  const [pendingFeedbackMessageId, setPendingFeedbackMessageId] = useState<string | null>(null);
  // openFeedbackMessageId：当前打开消息操作菜单的 assistant 消息 ID。
  const [openFeedbackMessageId, setOpenFeedbackMessageId] = useState<string | null>(null);
  // feedbackError：反馈提交失败时的轻量提示。
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  // memoryCorrectionMessageId：最近一次“记错了”反馈对应的消息 ID，用于展示记忆管理入口。
  const [memoryCorrectionMessageId, setMemoryCorrectionMessageId] = useState<string | null>(null);
  // responseConversationIdRef：保存本次流式响应头里的会话 ID，避免依赖会话列表最新项。
  const responseConversationIdRef = useRef<string | null>(null);
  // transport：AI SDK 聊天传输层，负责把当前 conversationId 带给后端。
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}${API_CHAT_PATH}`,
        credentials: "include",
        async fetch(input, init) {
          // response：保留原始流式响应，同时读取后端透传的会话 ID。
          const response = await globalThis.fetch(input, init);
          // nextConversationId：后端确认的当前会话 ID，首次新会话创建后用于前端稳定续写。
          const nextConversationId = response.headers.get("X-Conversation-Id");

          if (nextConversationId) {
            responseConversationIdRef.current = nextConversationId;
            setConversationId(nextConversationId);
          }

          return response;
        },
        prepareSendMessagesRequest({ messages }) {
          return {
            body: {
              conversationId: conversationId ?? undefined,
              messages
            }
          };
        }
      }),
    [conversationId]
  );
  const { error, messages, sendMessage, setMessages, status } = useChat({
    transport,
    onFinish() {
      void refreshCurrentConversation();
    }
  });
  // isSending：AI SDK 当前是否正在提交或接收流式回复。
  const isSending = status === "submitted" || status === "streaming";

  const loadConversationMessages = useCallback(
    async (id: string) => {
      setIsLoadingHistory(true);

      try {
        // history：从数据库读取的会话消息，刷新页面后用于恢复聊天列表。
        const { messages: history } = await listConversationMessages(id);
        setMessages(history.map(dbMessageToUiMessage));
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [setMessages]
  );

  /**
   * 刷新会话列表和当前会话消息。
   *
   * 新会话在首次发送消息后由后端创建，优先使用响应头返回的会话 ID。
   */
  async function refreshCurrentConversation() {
    // latestConversations：后端保存后的会话列表，用于在缺少响应头时兜底定位当前会话。
    const { conversations: latestConversations } = await listConversations();
    // nextConversationId：优先使用当前状态，其次使用本次响应头里的会话 ID。
    const nextConversationId =
      conversationId ?? responseConversationIdRef.current ?? latestConversations[0]?.id ?? null;

    if (nextConversationId) {
      setConversationId(nextConversationId);
      await loadConversationMessages(nextConversationId);
    }
  }

  useEffect(() => {
    /**
     * 检查用户是否具备进入聊天页的条件。
     *
     * 未登录跳转登录页；没有伴侣则跳转伴侣创建页；有历史会话则加载最近会话。
     */
    async function checkAccess() {
      try {
        await getMe();
        // companions：当前用户创建的伴侣列表，第一版只使用第一项。
        const { companions } = await listCompanions();

        if (companions.length === 0) {
          router.replace("/companion/setup");
          return;
        }

        setCompanion(companions[0]);

        // existingConversations：当前用户已有会话，进入页面时默认恢复最近一条。
        const { conversations: existingConversations } = await listConversations();

        if (existingConversations[0]) {
          setConversationId(existingConversations[0].id);
          await loadConversationMessages(existingConversations[0].id);
        }
      } catch {
        router.replace("/login");
      }
    }

    void checkAccess();
  }, [loadConversationMessages, router]);

  async function onLogout() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  /**
   * 提交 assistant 消息反馈。
   *
   * 反馈只绑定数据库中的 assistant 消息；流式回复未结束时先禁用按钮，避免提交临时消息 ID。
   */
  async function onFeedback(messageId: string, rating: FeedbackRating, reason?: string) {
    setPendingFeedbackMessageId(messageId);
    setFeedbackError(null);

    try {
      await submitFeedback({ messageId, rating, reason });
      setFeedbackByMessage((current) => ({
        ...current,
        [messageId]: rating
      }));
      setMemoryCorrectionMessageId(reason === "[memory_error]" ? messageId : null);
      setOpenFeedbackMessageId(null);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "反馈提交失败");
    } finally {
      setPendingFeedbackMessageId(null);
    }
  }

  /**
   * 提交用户输入。
   *
   * 实际消息保存、会话创建和模型调用由后端 /chat 统一完成。
   */
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // text：去除首尾空白后的用户输入，空消息不会发送。
    const text = input.trim();

    if (!text || isSending || isLoadingHistory) {
      return;
    }

    void sendMessage({ text });
    setInput("");
  }

  return (
    <main className="chat-shell">
      <section className="chat-panel">
        <div className="toolbar">
          <div>
            <h1>{companion?.name ?? "聊天"}</h1>
            <p className="chat-presence">{isSending ? "正在回复" : "在线"}</p>
          </div>
          <div className="action-row compact-actions">
            <button className="secondary-button" type="button" onClick={onLogout}>
              退出
            </button>
          </div>
        </div>
        <div className="message-list" aria-live="polite">
          {isLoadingHistory ? (
            <div className="empty-chat">
              <p>读取中。</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-chat">
              <p>开始和 {companion?.name ?? "伴侣"} 聊聊。</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble-wrap">
                  <div className="message-bubble">
                    <MessageText message={message} />
                  </div>
                  {message.role === "assistant" ? (
                    <div className="message-actions">
                      <button
                        aria-expanded={openFeedbackMessageId === message.id}
                        aria-label="消息操作"
                        className={`message-menu-trigger ${
                          openFeedbackMessageId === message.id ? "open" : ""
                        }`}
                        disabled={isSending || pendingFeedbackMessageId === message.id}
                        onClick={() =>
                          setOpenFeedbackMessageId((current) =>
                            current === message.id ? null : message.id
                          )
                        }
                        type="button"
                      >
                        ...
                      </button>
                      <div
                        className={`message-action-menu ${
                          openFeedbackMessageId === message.id ? "open" : ""
                        }`}
                        role="menu"
                      >
                        <button
                          disabled={pendingFeedbackMessageId === message.id}
                          onClick={() => void onFeedback(message.id, "up")}
                          type="button"
                        >
                          喜欢
                        </button>
                        <button
                          disabled={pendingFeedbackMessageId === message.id}
                          onClick={() => void onFeedback(message.id, "down", "[memory_error]")}
                          type="button"
                        >
                          记错了
                        </button>
                        <button
                          disabled={pendingFeedbackMessageId === message.id}
                          onClick={() =>
                            void onFeedback(message.id, "down", "[persona_mismatch]")
                          }
                          type="button"
                        >
                          不太像你
                        </button>
                      </div>
                      {feedbackByMessage[message.id] ? (
                        <p className="feedback-saved">已记录</p>
                      ) : null}
                      {memoryCorrectionMessageId === message.id ? (
                        <Link className="memory-correction-link" href="/memories">
                          去记忆管理页检查
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        {feedbackError ? <p className="feedback-error">{feedbackError}</p> : null}
        {error ? (
          <div className="chat-error">
            <span>发送失败，请稍后再试。</span>
          </div>
        ) : null}
        <form className="chat-input-row" onSubmit={onSubmit}>
          <textarea
            aria-label="消息"
            disabled={!companion || isSending || isLoadingHistory}
            onChange={(event) => setInput(event.target.value)}
            placeholder={companion ? "输入消息..." : "正在读取伴侣信息..."}
            rows={2}
            value={input}
          />
          <button
            disabled={!companion || !input.trim() || isSending || isLoadingHistory}
            type="submit"
          >
            {isSending ? "发送中" : "发送"}
          </button>
        </form>
      </section>
    </main>
  );
}
