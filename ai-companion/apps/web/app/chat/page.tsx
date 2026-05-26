"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { API_CHAT_PATH } from "@ai-companion/shared";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Companion, Conversation, Message, User } from "@ai-companion/shared";
import {
  apiBaseUrl,
  getMe,
  listCompanions,
  listConversations,
  listMessages as listConversationMessages,
  logout
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
  // user：当前登录用户，用于显示登录状态。
  const [user, setUser] = useState<User | null>(null);
  // companion：当前用户的默认伴侣，聊天页标题和 prompt 均依赖它。
  const [companion, setCompanion] = useState<Companion | null>(null);
  // conversations：当前用户的会话列表，按后端 updatedAt 倒序返回。
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // conversationId：当前选中的会话 ID；为空时首条消息会让后端自动创建会话。
  const [conversationId, setConversationId] = useState<string | null>(null);
  // isLoadingHistory：历史消息加载状态，用于禁用发送和切换会话。
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // input：消息输入框内容。
  const [input, setInput] = useState("");
  // transport：AI SDK 聊天传输层，负责把当前 conversationId 带给后端。
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}${API_CHAT_PATH}`,
        credentials: "include",
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
  const { error, messages, regenerate, sendMessage, setMessages, status } = useChat({
    transport,
    onFinish() {
      void refreshCurrentConversation();
    }
  });
  // isSending：AI SDK 当前是否正在提交或接收流式回复。
  const isSending = status === "submitted" || status === "streaming";
  // currentConversation：当前选中的会话对象，用于展示标题。
  const currentConversation = conversations.find(
    (conversation) => conversation.id === conversationId
  );

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
   * 新会话在首次发送消息后由后端创建，因此流结束后需要重新读取会话列表。
   */
  async function refreshCurrentConversation() {
    // latestConversations：保存消息后最新的会话列表，通常第一项是刚更新的会话。
    const { conversations: latestConversations } = await listConversations();
    // nextConversationId：当前会话优先；首次聊天时使用后端刚创建的最新会话。
    const nextConversationId = conversationId ?? latestConversations[0]?.id ?? null;

    setConversations(latestConversations);

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
        // me：当前登录用户信息。
        const me = await getMe();
        // companions：当前用户创建的伴侣列表，第一版只使用第一项。
        const { companions } = await listCompanions();

        if (companions.length === 0) {
          router.replace("/companion/setup");
          return;
        }

        setUser(me.user);
        setCompanion(companions[0]);

        // existingConversations：当前用户已有会话，进入页面时默认恢复最近一条。
        const { conversations: existingConversations } = await listConversations();

        setConversations(existingConversations);

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

  /**
   * 切换当前会话并加载对应历史消息。
   */
  async function onSelectConversation(id: string) {
    if (id === conversationId || isSending) {
      return;
    }

    setConversationId(id);
    await loadConversationMessages(id);
  }

  async function onLogout() {
    await logout().catch(() => undefined);
    router.replace("/login");
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
      <aside className="conversation-sidebar" aria-label="会话列表">
        <div className="sidebar-title">会话</div>
        <div className="conversation-items">
          {conversations.map((conversation) => (
            <button
              className={`conversation-item ${conversation.id === conversationId ? "active" : ""}`}
              disabled={isSending || isLoadingHistory}
              key={conversation.id}
              onClick={() => void onSelectConversation(conversation.id)}
              type="button"
            >
              {conversation.title || "新会话"}
            </button>
          ))}
        </div>
      </aside>
      <section className="chat-panel">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Chat</p>
            <h1>{companion?.name ?? "聊天"}</h1>
          </div>
          <button className="secondary-button" type="button" onClick={onLogout}>
            退出
          </button>
        </div>
        <p className="summary">
          {user ? `${user.email} 已登录` : "读取中"}
          {companion ? `，${companion.relationship}` : ""}
          {currentConversation ? `，${currentConversation.title || "新会话"}` : ""}
        </p>
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
                <div className="message-bubble">
                  <MessageText message={message} />
                </div>
              </div>
            ))
          )}
        </div>
        {error ? (
          <div className="chat-error">
            <span>发送失败，请稍后再试。</span>
            <button className="secondary-button" type="button" onClick={() => void regenerate()}>
              重试
            </button>
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
