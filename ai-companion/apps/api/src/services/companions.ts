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

export async function createCompanion(
  db: D1Database,
  userId: string,
  input: CreateCompanionInput
) {
  const now = new Date().toISOString();
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
