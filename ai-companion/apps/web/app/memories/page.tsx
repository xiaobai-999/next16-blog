"use client";

import type { Memory, MemoryType } from "@ai-companion/shared";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createMemory, deleteMemory, getMe, listMemories, logout } from "../../lib/api";

const memoryTypeLabels: Record<MemoryType, string> = {
  profile: "资料",
  preference: "偏好",
  event: "事件"
};

const memoryTypeOrder: MemoryType[] = ["profile", "preference", "event"];

/**
 * 记忆管理页面。
 *
 * 支持查看、手动新增和删除当前用户的长期记忆。
 */
export default function MemoriesPage() {
  const router = useRouter();
  // memories：当前用户的长期记忆列表，后端按重要性和更新时间排序。
  const [memories, setMemories] = useState<Memory[]>([]);
  // error：页面级错误提示，包含加载、新增和删除失败。
  const [error, setError] = useState("");
  // pending：表单提交状态，用于避免重复新增记忆。
  const [pending, setPending] = useState(false);
  // checking：进入页面时的登录校验和初始数据加载状态。
  const [checking, setChecking] = useState(true);

  const groupedMemories = useMemo(
    () =>
      memoryTypeOrder.map((type) => ({
        type,
        label: memoryTypeLabels[type],
        memories: memories.filter((memory) => memory.type === type)
      })),
    [memories]
  );

  /**
   * 重新加载当前用户记忆列表。
   */
  const refreshMemories = useCallback(async () => {
    const { memories: latestMemories } = await listMemories();

    setMemories(latestMemories);
  }, []);

  useEffect(() => {
    /**
     * 检查登录状态并加载记忆。
     *
     * 未登录时跳转登录页。
     */
    async function checkAccess() {
      try {
        await getMe();
        await refreshMemories();
      } catch {
        router.replace("/login");
      } finally {
        setChecking(false);
      }
    }

    void checkAccess();
  }, [refreshMemories, router]);

  /**
   * 退出登录并返回登录页。
   */
  async function onLogout() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  /**
   * 手动新增长期记忆。
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    // formData：记忆新增表单数据，提交前转成共享 schema 对应的字段。
    const formData = new FormData(event.currentTarget);
    // form：当前表单节点，成功后用于重置输入。
    const form = event.currentTarget;

    try {
      await createMemory({
        type: String(formData.get("type") ?? "preference") as MemoryType,
        content: String(formData.get("content") ?? ""),
        importance: Number(formData.get("importance") ?? 3)
      });
      form.reset();
      await refreshMemories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  /**
   * 删除一条长期记忆。
   */
  async function onDelete(id: string) {
    setError("");

    try {
      await deleteMemory(id);
      await refreshMemories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    }
  }

  if (checking) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Memory</p>
          <h1>读取中</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="memory-shell">
      <section className="memory-layout">
        <div className="memory-main">
          <div className="toolbar">
            <div>
              <p className="eyebrow">Memory</p>
              <h1>长期记忆</h1>
            </div>
            <div className="action-row compact-actions">
              <Link className="button-link secondary-link" href="/chat">
                返回聊天
              </Link>
              <button className="secondary-button" type="button" onClick={onLogout}>
                退出
              </button>
            </div>
          </div>
          <p className="summary">这些信息会在后续聊天中注入上下文，帮助伴侣记住你。</p>

          <div className="memory-groups">
            {groupedMemories.map((group) => (
              <section className="memory-section" key={group.type}>
                <h2>{group.label}</h2>
                {group.memories.length === 0 ? (
                  <p className="empty-memory">暂无记录。</p>
                ) : (
                  <div className="memory-list">
                    {group.memories.map((memory) => (
                      <article className="memory-item" key={memory.id}>
                        <div>
                          <p>{memory.content}</p>
                          <span>
                            重要性 {memory.importance} ·{" "}
                            {memory.source === "manual" ? "手动" : "自动提取"}
                          </span>
                        </div>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void onDelete(memory.id)}
                        >
                          删除
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>

        <form className="memory-form" onSubmit={onSubmit}>
          <h2>新增记忆</h2>
          <label>
            类型
            <select name="type" defaultValue="preference">
              <option value="profile">资料</option>
              <option value="preference">偏好</option>
              <option value="event">事件</option>
            </select>
          </label>
          <label>
            内容
            <textarea name="content" maxLength={500} required />
          </label>
          <label>
            重要性
            <input name="importance" type="number" min={1} max={5} defaultValue={3} required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? "保存中" : "保存"}
          </button>
        </form>
      </section>
    </main>
  );
}
