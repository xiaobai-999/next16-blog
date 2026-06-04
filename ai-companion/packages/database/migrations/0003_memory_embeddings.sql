-- V1 语义记忆召回：保存记忆 embedding 元数据和本地向量副本。
-- D1 memories 仍是事实源；该表用于同步 Vectorize，并在本地开发时提供等价向量召回。
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY, -- 对应 memories.id。
  user_id TEXT NOT NULL, -- 所属用户 ID，用于召回隔离。
  companion_id TEXT NOT NULL, -- 所属伴侣 ID，用于召回隔离。
  vector_id TEXT NOT NULL, -- 向量库中的向量 ID。
  model TEXT NOT NULL, -- 生成 embedding 的模型名。
  content_hash TEXT NOT NULL, -- embedding 输入文本 hash，用于判断是否需要重建。
  vector_json TEXT, -- 本地开发 fallback 使用的向量 JSON。
  deleted_at TEXT, -- 向量删除/失效时间，保留记录用于审计。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  updated_at TEXT NOT NULL, -- 更新时间，ISO 字符串。
  FOREIGN KEY (memory_id) REFERENCES memories(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (companion_id) REFERENCES companions(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_scope
  ON memory_embeddings(user_id, companion_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector
  ON memory_embeddings(vector_id);
