-- V1 长期记忆模型：重建 memories 表以扩展 type 枚举并补齐治理字段。
-- SQLite/D1 不能直接修改已有 CHECK 约束，因此先迁移旧表数据再创建新表。
DROP INDEX IF EXISTS idx_memories_user_companion;

ALTER TABLE memories RENAME TO memories_v0;

-- 长期记忆表 V1：保存记忆类型、状态、置信度、来源会话、过期和确认信息。
CREATE TABLE memories (
  id TEXT PRIMARY KEY, -- 记忆 ID。
  user_id TEXT NOT NULL, -- 所属用户 ID。
  companion_id TEXT NOT NULL, -- 所属伴侣 ID。
  type TEXT NOT NULL CHECK (type IN ('profile', 'preference', 'event', 'relationship', 'boundary')), -- 记忆类型。
  content TEXT NOT NULL, -- 记忆内容。
  importance INTEGER NOT NULL DEFAULT 1, -- 重要程度，数值越高越重要。
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted')), -- 来源：手动或模型提取。
  source_message_id TEXT, -- 来源消息 ID，可为空。
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted', 'pending_confirmation')), -- 记忆状态，只有 active 可进入 prompt。
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1), -- 模型提取置信度，手动记忆默认 1。
  source_conversation_id TEXT, -- 来源会话 ID，用于追踪记忆来自哪轮对话。
  expires_at TEXT, -- 过期时间，主要用于近期事件类记忆。
  archived_at TEXT, -- 归档时间，归档后不进入 prompt。
  deleted_at TEXT, -- 软删除时间，删除后不展示、不进入 prompt。
  conflict_with_memory_id TEXT, -- 冲突时指向旧记忆，阶段 8 仅预留。
  confirmation_reason TEXT, -- 需要用户确认时展示的简短原因。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  updated_at TEXT NOT NULL, -- 更新时间，ISO 字符串。
  FOREIGN KEY (user_id) REFERENCES users(id), -- 关联用户。
  FOREIGN KEY (companion_id) REFERENCES companions(id), -- 关联伴侣。
  FOREIGN KEY (source_message_id) REFERENCES messages(id), -- 关联来源消息。
  FOREIGN KEY (source_conversation_id) REFERENCES conversations(id), -- 关联来源会话。
  FOREIGN KEY (conflict_with_memory_id) REFERENCES memories(id) -- 关联冲突记忆。
);

-- 将 V0 记忆迁移为 active 且 confidence=1，确保旧记忆仍可读取和注入。
INSERT INTO memories (
  id,
  user_id,
  companion_id,
  type,
  content,
  importance,
  source,
  source_message_id,
  status,
  confidence,
  source_conversation_id,
  expires_at,
  archived_at,
  deleted_at,
  conflict_with_memory_id,
  confirmation_reason,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  companion_id,
  type,
  content,
  importance,
  source,
  source_message_id,
  'active',
  1,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  created_at,
  updated_at
FROM memories_v0;

DROP TABLE memories_v0;

-- V1 记忆查询索引：覆盖管理列表、prompt 注入、来源追踪和冲突预留查询。
CREATE INDEX idx_memories_user_companion ON memories(user_id, companion_id);
CREATE INDEX idx_memories_active_context ON memories(user_id, companion_id, status, expires_at);
CREATE INDEX idx_memories_source_conversation ON memories(source_conversation_id);
CREATE INDEX idx_memories_conflict ON memories(conflict_with_memory_id);
