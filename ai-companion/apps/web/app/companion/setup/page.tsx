"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createCompanion, getMe, listCompanions } from "../../../lib/api";

/**
 * 伴侣创建页面。
 *
 * 已登录但还没有伴侣的用户会进入这里，提交后进入连续聊天页。
 */
export default function CompanionSetupPage() {
  const router = useRouter();
  // error：保存伴侣配置失败时的页面级错误提示。
  const [error, setError] = useState("");
  // pending：伴侣配置提交状态，用于禁用按钮防止重复保存。
  const [pending, setPending] = useState(false);
  // checking：进入页面时检查登录态和已有伴侣的加载状态。
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    /**
     * 检查是否允许访问伴侣创建页。
     *
     * 未登录跳登录页；已创建伴侣则直接进入聊天页。
     */
    async function checkAccess() {
      try {
        await getMe();
        // companions：当前用户已有伴侣列表，第一版只允许一个默认伴侣流程。
        const { companions } = await listCompanions();

        if (companions.length > 0) {
          router.replace("/chat");
        }
      } catch {
        router.replace("/login");
      } finally {
        setChecking(false);
      }
    }

    void checkAccess();
  }, [router]);

  /**
   * 提交伴侣人设、语气、关系和边界配置。
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    // formData：伴侣设置表单数据，字段对应后端 createCompanion schema。
    const formData = new FormData(event.currentTarget);

    try {
      await createCompanion({
        name: String(formData.get("name") ?? ""),
        persona: String(formData.get("persona") ?? ""),
        tone: String(formData.get("tone") ?? ""),
        relationship: String(formData.get("relationship") ?? ""),
        boundaries: String(formData.get("boundaries") ?? "") || undefined
      });
      router.push("/chat");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  if (checking) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Companion</p>
          <h1>读取中</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <form className="panel form-panel wide-form" onSubmit={onSubmit}>
        <p className="eyebrow">Companion</p>
        <h1>伴侣设置</h1>
        <label>
          名字
          <input name="name" type="text" maxLength={40} required />
        </label>
        <label>
          人设
          <textarea name="persona" maxLength={1000} required />
        </label>
        <label>
          语气
          <textarea name="tone" maxLength={500} required />
        </label>
        <label>
          关系
          <textarea name="relationship" maxLength={500} required />
        </label>
        <label>
          边界
          <textarea name="boundaries" maxLength={1000} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "保存中" : "保存"}
        </button>
      </form>
    </main>
  );
}
