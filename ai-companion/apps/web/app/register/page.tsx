"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { listCompanions, register } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(event.currentTarget);

    try {
      await register({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        name: String(formData.get("name") ?? "") || undefined
      });

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
