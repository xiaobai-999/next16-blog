import type { User } from "@ai-companion/shared";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 将 D1 的用户行转换成共享 User 类型。
 *
 * 返回给业务层时不会暴露 password_hash。
 */
function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 按邮箱查询用户。
 *
 * 登录场景需要同时返回原始行中的 password_hash 用于校验密码。
 */
export async function findUserByEmail(db: D1Database, email: string) {
  const row = await db
    .prepare(
      `SELECT id, email, password_hash, name, created_at, updated_at
       FROM users
       WHERE email = ?`
    )
    .bind(email)
    .first<UserRow>();

  return row ? { row, user: mapUser(row) } : null;
}

/**
 * 按用户 ID 查询用户公开信息。
 *
 * 主要用于认证中间件根据 JWT payload 恢复当前用户。
 */
export async function findUserById(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT id, email, password_hash, name, created_at, updated_at
       FROM users
       WHERE id = ?`
    )
    .bind(id)
    .first<UserRow>();

  return row ? mapUser(row) : null;
}

/**
 * 创建用户记录。
 *
 * 传入的 password_hash 必须已经由调用方完成哈希处理。
 */
export async function createUser(db: D1Database, input: Omit<UserRow, "created_at" | "updated_at">) {
  // now：用户创建和更新时间，统一保存 ISO 字符串。
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(input.id, input.email, input.password_hash, input.name, now, now)
    .run();

  return {
    id: input.id,
    email: input.email,
    name: input.name,
    createdAt: now,
    updatedAt: now
  } satisfies User;
}
