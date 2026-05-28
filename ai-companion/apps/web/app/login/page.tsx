"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { listCompanions, login } from "../../lib/api";

/**
 * 登录页面。
 *
 * 登录成功后根据用户是否已创建伴侣进入聊天页或伴侣设置页。
 */
export default function LoginPage() {
  const router = useRouter();
  // error：登录接口返回的错误信息，用于表单内展示。
  const [error, setError] = useState("");
  // pending：登录请求提交状态，用于禁用按钮防止重复提交。
  const [pending, setPending] = useState(false);

  /**
   * 提交登录表单并建立登录态。
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    // formData：登录表单数据，转换后提交给共享登录 schema 对应的接口。
    const formData = new FormData(event.currentTarget);

    try {
      await login({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? "")
      });

      // companions：登录后判断用户是否已完成伴侣创建，用于决定下一页。
      const { companions } = await listCompanions();
      router.push(companions.length > 0 ? "/chat" : "/companion/setup");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="shell">
      <form className="panel form-panel" onSubmit={onSubmit}>
        <p className="eyebrow">Account</p>
        <h1>登录</h1>
        <label>
          邮箱
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          密码
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "登录中" : "登录"}
        </button>
        <p className="form-link">
          没有账号 <Link href="/register">注册</Link>
        </p>
      </form>
    </main>
  );
}
