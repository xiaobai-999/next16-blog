"use client";

import type { Memory, MemoryType } from "@ai-companion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmMemory,
  createMemory,
  deleteMemory,
  getMe,
  listMemories,
  logout,
  rejectMemory,
  updateMemory
} from "../../lib/api";

const memoryTypeLabels: Record<MemoryType, string> = {
  profile: "资料",
  preference: "偏好",
  event: "事件",
  relationship: "关系",
  boundary: "边界"
};

const memoryStatusLabels: Record<Memory["status"], string> = {
  active: "已启用",
  archived: "已归档",
  deleted: "已删除",
  pending_confirmation: "待确认"
};

const memoryTypeOrder: MemoryType[] = ["profile", "preference", "event", "relationship", "boundary"];

type MemoryEditDraft = {
  // type：编辑表单中暂存的记忆类型。
  type: MemoryType;
  // content：编辑表单中暂存的记忆正文。
  content: string;
  // importance：以字符串暂存，避免用户输入中间态被强制转数字。
  importance: string;
  // expiresAt：datetime-local 控件需要的本地时间字符串。
  expiresAt: string;
};

/**
 * 将 ISO 时间转换成 datetime-local 可接收的本地时间值。
 */
function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  // date：后端保存的 ISO 时间，转换失败时不填充输入框。
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  // localDate：抵消时区偏移后取 YYYY-MM-DDTHH:mm。
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 16);
}

/**
 * 将 datetime-local 的本地时间值转换成后端 schema 需要的 ISO 字符串。
 */
function fromDatetimeLocalValue(value: string) {
  // trimmedValue：空字符串表示清除过期时间。
  const trimmedValue = value.trim();

  return trimmedValue ? new Date(trimmedValue).toISOString() : null;
}

/**
 * 格式化更新时间，避免页面暴露内部 ID。
 */
function formatUpdatedAt(value: string) {
  // date：后端返回的更新时间。
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "更新时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/**
 * 返回用户可理解的记忆来源文案。
 */
function getSourceLabel(memory: Memory) {
  return memory.source === "manual" ? "来自你手动添加" : "来自最近一次对话";
}

/**
 * 记忆管理页面。
 *
 * 支持查看、编辑、确认、拒绝和软删除当前用户的长期记忆。
 */
export default function MemoriesPage() {
  const router = useRouter();
  // memories：当前用户可管理的 active 和 pending_confirmation 记忆。
  const [memories, setMemories] = useState<Memory[]>([]);
  // error：页面级错误提示，包含加载、新增、编辑和删除失败。
  const [error, setError] = useState("");
  // pending：新增记忆表单提交状态，用于避免重复提交。
  const [pending, setPending] = useState(false);
  // checking：进入页面时的登录校验和初始数据加载状态。
  const [checking, setChecking] = useState(true);
  // editingMemoryId：当前正在编辑的记忆 ID，同一时间只允许编辑一条。
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  // editDraft：当前编辑表单的本地草稿。
  const [editDraft, setEditDraft] = useState<MemoryEditDraft | null>(null);
  // actionPendingKey：正在执行的单条记忆操作，用于禁用重复点击。
  const [actionPendingKey, setActionPendingKey] = useState<string | null>(null);

  const pendingMemories = useMemo(
    () => memories.filter((memory) => memory.status === "pending_confirmation"),
    [memories]
  );

  const groupedActiveMemories = useMemo(
    () =>
      memoryTypeOrder.map((type) => ({
        type,
        label: memoryTypeLabels[type],
        memories: memories.filter((memory) => memory.status === "active" && memory.type === type)
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
   * 进入单条记忆编辑状态。
   */
  function onStartEdit(memory: Memory) {
    setError("");
    setEditingMemoryId(memory.id);
    setEditDraft({
      type: memory.type,
      content: memory.content,
      importance: String(memory.importance),
      expiresAt: toDatetimeLocalValue(memory.expiresAt)
    });
  }

  /**
   * 修改当前编辑草稿中的一个字段。
   */
  function updateEditDraftField<Field extends keyof MemoryEditDraft>(
    field: Field,
    value: MemoryEditDraft[Field]
  ) {
    setEditDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  /**
   * 取消当前编辑状态。
   */
  function onCancelEdit() {
    setEditingMemoryId(null);
    setEditDraft(null);
  }

  /**
   * 保存单条记忆的编辑结果。
   */
  async function onSaveEdit(id: string) {
    if (!editDraft) {
      return;
    }

    setError("");
    setActionPendingKey(`update:${id}`);

    try {
      await updateMemory(id, {
        type: editDraft.type,
        content: editDraft.content,
        importance: Number(editDraft.importance),
        expiresAt: fromDatetimeLocalValue(editDraft.expiresAt)
      });
      onCancelEdit();
      await refreshMemories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新失败");
    } finally {
      setActionPendingKey(null);
    }
  }

  /**
   * 删除一条长期记忆，后端实际执行软删除。
   */
  async function onDelete(id: string) {
    setError("");
    setActionPendingKey(`delete:${id}`);

    try {
      await deleteMemory(id);
      await refreshMemories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setActionPendingKey(null);
    }
  }

  /**
   * 确认一条待确认记忆。
   */
  async function onConfirm(id: string) {
    setError("");
    setActionPendingKey(`confirm:${id}`);

    try {
      await confirmMemory(id);
      await refreshMemories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "确认失败");
    } finally {
      setActionPendingKey(null);
    }
  }

  /**
   * 拒绝一条待确认记忆，后端会按软删除处理。
   */
  async function onReject(id: string) {
    setError("");
    setActionPendingKey(`reject:${id}`);

    try {
      await rejectMemory(id);
      await refreshMemories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "拒绝失败");
    } finally {
      setActionPendingKey(null);
    }
  }

  /**
   * 渲染单条记忆卡片。
   */
  function renderMemoryItem(memory: Memory) {
    // isEditing：当前卡片是否处于编辑态。
    const isEditing = editingMemoryId === memory.id;
    // isActionPending：当前卡片是否有操作正在提交。
    const isActionPending = actionPendingKey?.endsWith(`:${memory.id}`) ?? false;

    return (
      <article className={`memory-item ${memory.status}`} key={memory.id}>
        {isEditing && editDraft ? (
          <form
            className="memory-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onSaveEdit(memory.id);
            }}
          >
            <div className="memory-edit-grid">
              <label>
                类型
                <select
                  value={editDraft.type}
                  onChange={(event) =>
                    updateEditDraftField("type", event.target.value as MemoryType)
                  }
                >
                  {memoryTypeOrder.map((type) => (
                    <option key={type} value={type}>
                      {memoryTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                重要性
                <input
                  max={5}
                  min={1}
                  required
                  type="number"
                  value={editDraft.importance}
                  onChange={(event) => updateEditDraftField("importance", event.target.value)}
                />
              </label>
              <label>
                过期时间
                <input
                  type="datetime-local"
                  value={editDraft.expiresAt}
                  onChange={(event) => updateEditDraftField("expiresAt", event.target.value)}
                />
              </label>
            </div>
            <label>
              内容
              <textarea
                maxLength={500}
                required
                value={editDraft.content}
                onChange={(event) => updateEditDraftField("content", event.target.value)}
              />
            </label>
            <div className="memory-actions">
              <button disabled={isActionPending} type="submit">
                {isActionPending ? "保存中" : "保存"}
              </button>
              <button className="secondary-button" type="button" onClick={onCancelEdit}>
                取消
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="memory-content">
              <div className="memory-meta-row">
                <span className={`memory-status ${memory.status}`}>
                  {memoryStatusLabels[memory.status]}
                </span>
                <span>{memoryTypeLabels[memory.type]}</span>
                <span>重要性 {memory.importance}</span>
              </div>
              <p>{memory.content}</p>
              <div className="memory-meta-row muted">
                <span>{getSourceLabel(memory)}</span>
                <span>更新于 {formatUpdatedAt(memory.updatedAt)}</span>
              </div>
              {memory.confirmationReason ? (
                <p className="memory-reason">{memory.confirmationReason}</p>
              ) : null}
            </div>
            <div className="memory-actions">
              <button
                className="secondary-button"
                disabled={isActionPending}
                type="button"
                onClick={() => onStartEdit(memory)}
              >
                编辑
              </button>
              {memory.status === "pending_confirmation" ? (
                <>
                  <button
                    disabled={isActionPending}
                    type="button"
                    onClick={() => void onConfirm(memory.id)}
                  >
                    确认
                  </button>
                  <button
                    className="secondary-button"
                    disabled={isActionPending}
                    type="button"
                    onClick={() => void onReject(memory.id)}
                  >
                    拒绝
                  </button>
                </>
              ) : null}
              <button
                className="secondary-button danger-button"
                disabled={isActionPending}
                type="button"
                onClick={() => void onDelete(memory.id)}
              >
                删除
              </button>
            </div>
          </>
        )}
      </article>
    );
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
          <p className="summary">你可以确认、修正或删除这些信息。待确认记忆在确认前不会进入聊天上下文。</p>
          {error ? <p className="form-error memory-page-error">{error}</p> : null}

          <div className="memory-groups">
            <section className="memory-section pending-section">
              <div className="section-heading-row">
                <h2>待确认</h2>
                <span>{pendingMemories.length} 条</span>
              </div>
              {pendingMemories.length === 0 ? (
                <p className="empty-memory">暂无需要确认的记忆。</p>
              ) : (
                <div className="memory-list">{pendingMemories.map(renderMemoryItem)}</div>
              )}
            </section>

            {groupedActiveMemories.map((group) => (
              <section className="memory-section" key={group.type}>
                <div className="section-heading-row">
                  <h2>{group.label}</h2>
                  <span>{group.memories.length} 条</span>
                </div>
                {group.memories.length === 0 ? (
                  <p className="empty-memory">暂无记录。</p>
                ) : (
                  <div className="memory-list">{group.memories.map(renderMemoryItem)}</div>
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
              <option value="relationship">关系</option>
              <option value="boundary">边界</option>
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
          <button type="submit" disabled={pending}>
            {pending ? "保存中" : "保存"}
          </button>
        </form>
      </section>
    </main>
  );
}
