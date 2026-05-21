import { Card, CardContent } from '@repo/ui/card'
import Link from 'next/link'

const links = [
  {
    href: '/verify/system/health',
    method: 'GET',
    path: '/health',
    title: '验证健康检查接口',
  },
  {
    href: '/verify/system/ping',
    method: 'POST',
    path: '/rpc/system/ping',
    title: '验证 Ping 接口',
  },
  {
    href: '/verify/catalog/list',
    method: 'GET',
    path: '/rpc/catalog/list',
    title: '验证目录列表接口',
  },
  {
    href: '/verify/user/profile',
    method: 'GET',
    path: '/rpc/user/profile',
    title: '验证用户资料接口',
  },
  {
    href: '/verify/order/detail',
    method: 'POST',
    path: '/rpc/order/detail',
    title: '验证订单详情接口',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-surface-canvas px-6 text-content-primary">
      <section className="mx-auto max-w-5xl py-10">
        <Card className="overflow-hidden border border-border-default bg-surface-panel shadow-sm">
          <CardContent className="space-y-6 p-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.3em] text-content-tertiary uppercase">
                Verify index
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
                接口验证入口
              </h1>
              <p className="text-sm text-content-secondary">
                页面只负责展示入口，具体请求逻辑放在对应的 api 文件中。
              </p>
            </div>
            <div className="grid gap-3">
              {links.map((item) => (
                <Link
                  className="rounded-2xl border border-border-default bg-surface-elevated p-4 transition hover:border-border-strong"
                  href={item.href}
                  key={item.href}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-medium text-content-primary">
                        {item.title}
                      </p>
                      <p className="text-sm text-content-tertiary">{item.path}</p>
                    </div>
                    <span className="rounded-full border border-border-default px-3 py-1 text-xs text-content-tertiary">
                      {item.method}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
