# 阶段 2：认证和伴侣创建

## 目标

完成最小账号体系和电子伴侣创建流程。这个阶段结束后，用户可以注册、登录，并创建一个属于自己的电子伴侣。

## 小册依据

- 076-085：Hono 路由、中间件、认证、鉴权
- 102-115：Zod schema、Hono 请求校验、单一事实源
- 013-014：服务端和前端共享类型

## 前置条件

- 阶段 1 已完成
- `users` 和 `companions` 表已可用
- Web 和 API 都能本地启动
- `packages/shared` 可以被 Web 和 API 引用

## 工程约定

- 鉴权方案统一为 `JWT + HttpOnly Cookie`。
- MVP 不建立 `sessions` 表。
- 密码哈希必须使用 Workers 兼容方案，不能依赖 Node-only API。
- 所有认证和伴侣请求 schema 放在 `packages/shared`。
- 所有受保护接口通过 `authMiddleware` 获取当前用户。
- 统一错误响应结构：

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "未登录"
  }
}
```

## 任务清单

- [ ] 编写注册接口
- [ ] 编写登录接口
- [ ] 编写退出接口
- [ ] 实现密码哈希
- [ ] 实现 JWT 签发与验证
- [ ] 使用 HttpOnly Cookie 保存登录态
- [ ] 编写鉴权中间件
- [ ] 编写获取当前用户接口
- [ ] 编写创建伴侣接口
- [ ] 编写获取伴侣接口
- [ ] 编写修改伴侣接口
- [ ] 创建注册页面
- [ ] 创建登录页面
- [ ] 创建伴侣设置页面
- [ ] 登录后跳转到伴侣设置或聊天页

## API 边界

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /me
POST /companions
GET  /companions
GET  /companions/:id
PATCH /companions/:id
```

## Zod Schema

```ts
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(40).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(100),
});

export const createCompanionSchema = z.object({
  name: z.string().min(1).max(40),
  persona: z.string().min(1).max(1000),
  tone: z.string().min(1).max(500),
  relationship: z.string().min(1).max(500),
  boundaries: z.string().max(1000).optional(),
});
```

## 请求示例

注册：

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "用户昵称"
}
```

登录：

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

创建伴侣：

```json
{
  "name": "小夏",
  "persona": "温柔、理性、有耐心",
  "tone": "简洁、自然、不说教",
  "relationship": "学习和生活陪伴",
  "boundaries": "不要过度鸡汤，不要替我做重大决定"
}
```

## UI 页面

```text
/register
/login
/companion/setup
```

## 页面行为

- 未登录用户访问受保护页面时跳转到 `/login`。
- 登录用户没有伴侣时跳转到 `/companion/setup`。
- 登录用户已有伴侣时可以进入 `/chat`。
- 创建伴侣成功后跳转到 `/chat`。

## 权限规则

- 用户只能读取和修改自己的伴侣。
- 所有 companion 查询必须带 `user_id` 条件。
- `GET /me` 只返回安全字段，不返回 `password_hash`。

## 不做事项

- 不做第三方登录
- 不做手机号登录
- 不做邮箱验证码
- 不做找回密码
- 不做 refresh token
- 不做多角色市场
- 不做头像生成

## 验收标准

- [ ] 用户可以注册
- [ ] 用户可以登录
- [ ] 登录态刷新后仍然有效
- [ ] 退出后 Cookie 被清除
- [ ] 未登录用户不能访问受保护接口
- [ ] 用户可以创建伴侣
- [ ] 用户只能读取和修改自己的伴侣
- [ ] 创建伴侣后可以进入聊天页
- [ ] 请求参数由共享 Zod schema 校验
- [ ] 认证错误返回统一错误结构

## 阶段产出

- 最小账号系统
- JWT + HttpOnly Cookie 登录态
- 鉴权中间件
- 伴侣创建和查询接口
- 注册、登录、伴侣设置页面
