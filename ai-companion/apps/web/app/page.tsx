"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getMe, listCompanions } from "../lib/api";

/**
 * 根页面入口。
 *
 * 未登录用户进入登录页；已登录用户根据是否已有伴侣进入创建页或聊天页。
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    /**
     * 检查当前用户状态并跳转到实际工作流页面。
     */
    async function redirectBySession() {
      try {
        await getMe();

        // companions：当前用户的伴侣列表，第一版只需要判断是否已完成伴侣创建。
        const { companions } = await listCompanions();

        router.replace(companions.length > 0 ? "/chat" : "/companion/setup");
      } catch {
        router.replace("/login");
      }
    }

    void redirectBySession();
  }, [router]);

  return (
    <main className="shell">
      <section className="panel" aria-live="polite">
        <p className="summary">正在进入...</p>
      </section>
    </main>
  );
}
