import { Card, CardContent } from '@repo/ui/card'
import Link from 'next/link'
import { getHealthResponse } from '../../../../api/system/health'

export const dynamic = 'force-dynamic'

export default async function VerifySystemHealthPage() {
  const healthResult = await getHealthResponse()
  const responseBody = JSON.stringify(healthResult, null, 2)

  return (
    <main className="min-h-screen bg-surface-canvas px-6 text-content-primary">
      <section className="mx-auto max-w-5xl py-10">
        <div className="mb-6">
          <Link className="text-sm text-content-tertiary hover:text-content-primary" href="/">
            返回验证入口
          </Link>
        </div>
        <Card className="overflow-hidden border border-border-default bg-surface-panel shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.3em] text-content-tertiary uppercase">
                System health
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
                验证健康检查接口
              </h1>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-content-tertiary">
              <span className="rounded-full border border-border-default px-3 py-1">
                GET /health
              </span>
              <span className="rounded-full border border-border-default px-3 py-1">
                {healthResult.ok ? 'ok=true' : `code=${healthResult.error.code}`}
              </span>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-elevated p-4">
              <p className="text-sm font-medium text-content-primary">Response</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-content-secondary">
                {responseBody}
              </pre>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
