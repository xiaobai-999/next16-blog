import type { Companion, CreateCompanionInput, UpdateCompanionInput } from "@ai-companion/shared";

type CompanionRow = {
  id: string;
  user_id: string;
  name: string;
  persona: string;
  tone: string;
  relationship: string;
  boundaries: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 将 D1 的 snake_case 伴侣行转换成共享 Companion 类型。
 */
function mapCompanion(row: CompanionRow): Companion {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    persona: row.persona,
    tone: row.tone,
    relationship: row.relationship,
    boundaries: row.boundaries,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 创建当前用户的伴侣配置。
 */
export async function createCompanion(
  db: D1Database,
  userId: string,
  input: CreateCompanionInput
) {
  // now：伴侣创建和更新时间，统一保存 ISO 字符串。
  const now = new Date().toISOString();
  // companion：写入数据库前构造的伴侣领域对象。
  const companion = {
    id: crypto.randomUUID(),
    userId,
    name: input.name,
    persona: input.persona,
    tone: input.tone,
    relationship: input.relationship,
    boundaries: input.boundaries ?? null,
    createdAt: now,
    updatedAt: now
  } satisfies Companion;

  await db
    .prepare(
      `INSERT INTO companions
        (id, user_id, name, persona, tone, relationship, boundaries, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      companion.id,
      companion.userId,
      companion.name,
      companion.persona,
      companion.tone,
      companion.relationship,
      companion.boundaries,
      companion.createdAt,
      companion.updatedAt
    )
    .run();

  return companion;
}

/**
 * 查询当前用户的伴侣列表。
 */
export async function listCompanions(db: D1Database, userId: string) {
  const result = await db
    .prepare(
      `SELECT id, user_id, name, persona, tone, relationship, boundaries, created_at, updated_at
       FROM companions
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<CompanionRow>();

  return result.results.map(mapCompanion);
}

/**
 * 按 ID 查询当前用户的一条伴侣配置。
 */
export async function getCompanion(db: D1Database, userId: string, id: string) {
  const row = await db
    .prepare(
      `SELECT id, user_id, name, persona, tone, relationship, boundaries, created_at, updated_at
       FROM companions
       WHERE id = ? AND user_id = ?`
    )
    .bind(id, userId)
    .first<CompanionRow>();

  return row ? mapCompanion(row) : null;
}

/**
 * 更新当前用户的一条伴侣配置。
 */
export async function updateCompanion(
  db: D1Database,
  userId: string,
  id: string,
  input: UpdateCompanionInput
) {
  const existing = await getCompanion(db, userId, id);

  if (!existing) {
    return null;
  }

  // next：合并局部更新后的伴侣领域对象。
  const next = {
    ...existing,
    ...input,
    boundaries: input.boundaries === undefined ? existing.boundaries : input.boundaries,
    updatedAt: new Date().toISOString()
  } satisfies Companion;

  await db
    .prepare(
      `UPDATE companions
       SET name = ?, persona = ?, tone = ?, relationship = ?, boundaries = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .bind(
      next.name,
      next.persona,
      next.tone,
      next.relationship,
      next.boundaries,
      next.updatedAt,
      id,
      userId
    )
    .run();

  return next;
}
