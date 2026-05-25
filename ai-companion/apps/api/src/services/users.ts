import type { User } from "@ai-companion/shared";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
  updated_at: string;
};

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

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

export async function createUser(db: D1Database, input: Omit<UserRow, "created_at" | "updated_at">) {
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
