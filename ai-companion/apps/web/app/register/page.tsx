"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { listCompanions, register } from "../../lib/api";

/**
 * 注册页面。
 *
 * 注册成功后会自动建立登录态，再进入伴侣创建或聊天流程。
 */
export default function RegisterPage() {
  const router = useRouter();
  // error：注册接口返回的错误信息，用于表单内展示。
  const [error, setError] = useState("");
  // pending：注册请求提交状态，用于禁用按钮防止重复提交。
  const [pending, setPending] = useState(false);

  /**
   * 提交注册表单并创建新用户。
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    // formData：注册表单数据，转换后提交给共享注册 schema 对应的接口。
    const formData = new FormData(event.currentTarget);

    try {
      await register({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        name: String(formData.get("name") ?? "") || undefined
      });

      // companions：注册后通常为空；保留判断以兼容已有账号补登录态的场景。
      const { companions } = await listCompanions();
      router.push(companions.length > 0 ? "/chat" : "/companion/setup");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "注册失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="shell">
      <form className="panel form-panel" onSubmit={onSubmit}>
        <p className="eyebrow">Account</p>
        <h1>创建账号</h1>
        <label>
          邮箱
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          昵称
          <input name="name" type="text" maxLength={40} autoComplete="name" />
        </label>
        <label>
          密码
          <input name="password" type="password" minLength={8} maxLength={100} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "创建中" : "注册"}
        </button>
        <p className="form-link">
          已有账号 <Link href="/login">登录</Link>
        </p>
      </form>
    </main>
  );
}
