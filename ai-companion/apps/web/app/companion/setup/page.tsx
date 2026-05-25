"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createCompanion, getMe, listCompanions } from "../../../lib/api";

export default function CompanionSetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      try {
        await getMe();
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

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
