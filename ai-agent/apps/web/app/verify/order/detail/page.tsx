import { Card, CardContent } from '@repo/ui/card'
import Link from 'next/link'
import {
  orderDetailPayload,
  postOrderDetail,
} from '../../../../src/api/order/detail.api'

export const dynamic = 'force-dynamic'

export default async function VerifyOrderDetailPage() {
  const result = await postOrderDetail()
  const requestBody = JSON.stringify(orderDetailPayload, null, 2)
  const responseBody = JSON.stringify(result, null, 2)

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
                Order detail
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
                验证订单详情接口
              </h1>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-content-tertiary">
              <span className="rounded-full border border-border-default px-3 py-1">
                POST /rpc/order/detail
              </span>
              <span className="rounded-full border border-border-default px-3 py-1">
                {result.ok ? 'ok=true' : `code=${result.error.code}`}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border-default bg-surface-elevated p-4">
                <p className="text-sm font-medium text-content-primary">Request</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-content-secondary">
                  {requestBody}
                </pre>
              </div>
              <div className="rounded-2xl border border-border-default bg-surface-elevated p-4">
                <p className="text-sm font-medium text-content-primary">Response</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-content-secondary">
                  {responseBody}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
