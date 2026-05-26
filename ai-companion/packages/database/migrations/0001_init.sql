-- 用户账号表：保存登录账号、密码哈希和基础资料。
CREATE TABLE users (
  id TEXT PRIMARY KEY, -- 用户 ID。
  email TEXT NOT NULL UNIQUE, -- 登录邮箱，必须唯一。
  password_hash TEXT NOT NULL, -- 密码哈希，不保存明文密码。
  name TEXT, -- 用户展示名称。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  updated_at TEXT NOT NULL -- 更新时间，ISO 字符串。
);

-- AI 伴侣配置表：保存用户创建的伴侣人设、语气和关系设定。
CREATE TABLE companions (
  id TEXT PRIMARY KEY, -- 伴侣 ID。
  user_id TEXT NOT NULL, -- 所属用户 ID。
  name TEXT NOT NULL, -- 伴侣名称。
  persona TEXT NOT NULL, -- 伴侣人设描述。
  tone TEXT NOT NULL, -- 回复语气。
  relationship TEXT NOT NULL, -- 与用户的关系设定。
  boundaries TEXT, -- 边界和禁忌设定。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  updated_at TEXT NOT NULL, -- 更新时间，ISO 字符串。
  FOREIGN KEY (user_id) REFERENCES users(id) -- 关联用户。
);

-- 聊天会话表：一个会话包含多条消息，用于刷新后恢复上下文。
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, -- 会话 ID。
  user_id TEXT NOT NULL, -- 所属用户 ID，用于权限过滤。
  companion_id TEXT NOT NULL, -- 会话对应的伴侣 ID。
  title TEXT, -- 会话标题，默认取首条用户消息摘要。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  updated_at TEXT NOT NULL, -- 最近消息或会话更新时间，ISO 字符串。
  FOREIGN KEY (user_id) REFERENCES users(id), -- 关联用户。
  FOREIGN KEY (companion_id) REFERENCES companions(id) -- 关联伴侣。
);

-- 聊天消息表：保存用户和 AI 回复消息，system 消息默认不进入消息列表。
CREATE TABLE messages (
  id TEXT PRIMARY KEY, -- 消息 ID。
  user_id TEXT NOT NULL, -- 所属用户 ID，用于权限过滤。
  conversation_id TEXT NOT NULL, -- 所属会话 ID。
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')), -- 消息角色。
  content TEXT NOT NULL, -- 消息正文。
  token_count INTEGER, -- 估算 token 数，第一版不做精确统计。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  FOREIGN KEY (user_id) REFERENCES users(id), -- 关联用户。
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) -- 关联会话。
);

-- 长期记忆表：保存从对话中提取或手动录入的用户偏好、资料和事件。
CREATE TABLE memories (
  id TEXT PRIMARY KEY, -- 记忆 ID。
  user_id TEXT NOT NULL, -- 所属用户 ID。
  companion_id TEXT NOT NULL, -- 所属伴侣 ID。
  type TEXT NOT NULL CHECK (type IN ('profile', 'preference', 'event')), -- 记忆类型。
  content TEXT NOT NULL, -- 记忆内容。
  importance INTEGER NOT NULL DEFAULT 1, -- 重要程度，数值越高越重要。
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted')), -- 来源：手动或模型提取。
  source_message_id TEXT, -- 来源消息 ID，可为空。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  updated_at TEXT NOT NULL, -- 更新时间，ISO 字符串。
  FOREIGN KEY (user_id) REFERENCES users(id), -- 关联用户。
  FOREIGN KEY (companion_id) REFERENCES companions(id), -- 关联伴侣。
  FOREIGN KEY (source_message_id) REFERENCES messages(id) -- 关联来源消息。
);

-- 模型调用日志表：记录模型供应商、模型名、token、耗时和错误信息。
CREATE TABLE model_logs (
  id TEXT PRIMARY KEY, -- 日志 ID。
  trace_id TEXT NOT NULL, -- 一次请求链路的追踪 ID。
  user_id TEXT NOT NULL, -- 发起调用的用户 ID。
  conversation_id TEXT, -- 关联会话 ID，可为空。
  provider TEXT NOT NULL, -- 模型供应商。
  model TEXT NOT NULL, -- 模型名称。
  prompt_tokens INTEGER, -- 输入 token 数。
  completion_tokens INTEGER, -- 输出 token 数。
  latency_ms INTEGER, -- 调用耗时，毫秒。
  status TEXT NOT NULL CHECK (status IN ('success', 'error')), -- 调用状态。
  error_code TEXT, -- 错误码。
  error_message TEXT, -- 错误信息。
  created_at TEXT NOT NULL -- 创建时间，ISO 字符串。
);

-- 反馈表：保存用户对某条 AI 消息的点赞或点踩反馈。
CREATE TABLE feedback (
  id TEXT PRIMARY KEY, -- 反馈 ID。
  message_id TEXT NOT NULL, -- 被反馈的消息 ID。
  user_id TEXT NOT NULL, -- 反馈用户 ID。
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')), -- 反馈类型：赞或踩。
  reason TEXT, -- 反馈原因，可为空。
  created_at TEXT NOT NULL, -- 创建时间，ISO 字符串。
  FOREIGN KEY (message_id) REFERENCES messages(id), -- 关联消息。
  FOREIGN KEY (user_id) REFERENCES users(id) -- 关联用户。
);

-- 常用查询索引。
CREATE INDEX idx_companions_user_id ON companions(user_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_companion_id ON conversations(companion_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_memories_user_companion ON memories(user_id, companion_id);
CREATE INDEX idx_model_logs_trace_id ON model_logs(trace_id);
CREATE INDEX idx_feedback_message_id ON feedback(message_id);
