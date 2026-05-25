import { API_HEALTH_PATH, APP_NAME } from "@ai-companion/shared";
import type { HealthResponse } from "@ai-companion/shared";
import Link from "next/link";

async function getApiHealth(): Promise<HealthResponse | null> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${apiBaseUrl}${API_HEALTH_PATH}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await getApiHealth();

  return (
    <main className="shell">
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">MVP workspace</p>
        <h1 id="page-title">{APP_NAME}</h1>
        <p className="summary">
          Web and Worker API skeletons are wired through shared package contracts.
        </p>
        <dl className="status-grid">
          <div>
            <dt>API</dt>
            <dd>{health?.ok ? "healthy" : "not connected"}</dd>
          </div>
          <div>
            <dt>Health route</dt>
            <dd>{API_HEALTH_PATH}</dd>
          </div>
        </dl>
        <div className="action-row">
          <Link className="button-link" href="/login">
            登录
          </Link>
          <Link className="button-link secondary-link" href="/register">
            注册
          </Link>
        </div>
      </section>
    </main>
  );
}
