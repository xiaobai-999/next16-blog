"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Companion, User } from "@ai-companion/shared";
import { getMe, listCompanions, logout } from "../../lib/api";

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [companion, setCompanion] = useState<Companion | null>(null);

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

  return (
    <main className="shell">
      <section className="panel">
        <div className="toolbar">
          <p className="eyebrow">Chat</p>
          <button className="secondary-button" type="button" onClick={onLogout}>
            退出
          </button>
        </div>
        <h1>{companion?.name ?? "聊天"}</h1>
        <p className="summary">
          {user ? `${user.email} 已登录` : "读取中"}
          {companion ? `，${companion.relationship}` : ""}
        </p>
      </section>
    </main>
  );
}
