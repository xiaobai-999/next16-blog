"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { API_CHAT_PATH } from "@ai-companion/shared";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Companion, User } from "@ai-companion/shared";
import { apiBaseUrl, getMe, listCompanions, logout } from "../../lib/api";

function MessageText({ message }: { message: { parts?: Array<{ type: string; text?: string }> } }) {
  const text = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

  return <>{text}</>;
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}${API_CHAT_PATH}`,
        credentials: "include"
      }),
    []
  );
  const { error, messages, regenerate, sendMessage, status } = useChat({
    transport
  });
  const isSending = status === "submitted" || status === "streaming";

  useEffect(() => {
    async function checkAccess() {
      try {
        const me = await getMe();
        const { companions } = await listCompanions();

        if (companions.length === 0) {
          router.replace("/companion/setup");
          return;
        }

        setUser(me.user);
        setCompanion(companions[0]);
      } catch {
        router.replace("/login");
      }
    }

    void checkAccess();
  }, [router]);

  async function onLogout() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || isSending) {
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
        </p>
        <div className="message-list" aria-live="polite">
          {messages.length === 0 ? (
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
            disabled={!companion || isSending}
            onChange={(event) => setInput(event.target.value)}
            placeholder={companion ? "输入消息..." : "正在读取伴侣信息..."}
            rows={2}
            value={input}
          />
          <button disabled={!companion || !input.trim() || isSending} type="submit">
            {isSending ? "发送中" : "发送"}
          </button>
        </form>
      </section>
    </main>
  );
}
