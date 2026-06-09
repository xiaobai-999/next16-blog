-- V2 Agent Trace 基座：记录一轮 Agent 执行摘要。
-- 该表只保存脱敏元数据、枚举、ID、耗时和错误摘要，不保存完整对话或 system prompt。
CREATE TABLE IF NOT EXISTS agent_runs (
  trace_id TEXT PRIMARY KEY, -- 一轮 Agent 执行的追踪 ID。
  request_id TEXT NOT NULL, -- 单次 HTTP 聊天请求 ID。
  user_id TEXT NOT NULL, -- 发起请求的用户 ID。
  companion_id TEXT, -- 伴侣 ID；会话创建前失败时可为空。
  conversation_id TEXT, -- 会话 ID；会话创建前失败时可为空。
  thread_id TEXT, -- LangGraph/Checkpointer 线程 ID，当前规则为 thread:{conversation_id}。
  graph_version TEXT NOT NULL, -- Agent 图或编排版本。
  graph_path TEXT NOT NULL, -- 本轮经过的节点路径 JSON 数组。
  intent TEXT, -- 意图分类标签，阶段 15 后写入。
  emotion TEXT, -- 情绪分类标签，阶段 15 后写入。
  risk_level TEXT, -- 风险等级，阶段 15 后写入。
  strategy TEXT, -- 回复策略，阶段 16 后写入。
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'degraded')), -- 本轮执行状态。
  degraded_reason TEXT, -- 降级原因摘要，必须脱敏并截断。
  sampled INTEGER NOT NULL CHECK (sampled IN (0, 1)), -- 是否保存 span 明细。
  started_at TEXT NOT NULL, -- 执行开始时间，ISO 字符串。
  ended_at TEXT NOT NULL, -- 执行结束时间，ISO 字符串。
  latency_ms INTEGER NOT NULL, -- 执行耗时，毫秒。
  retention_until TEXT NOT NULL, -- Trace 保留到期时间，用于过期清理。
  created_at TEXT NOT NULL, -- 记录创建时间，ISO 字符串。
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (companion_id) REFERENCES companions(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- V2 Agent Trace 基座：记录节点、工具、模型或持久化动作的执行 span。
-- input_summary 和 output_summary 只能保存脱敏摘要，不保存完整私人对话文本。
CREATE TABLE IF NOT EXISTS agent_spans (
  span_id TEXT PRIMARY KEY, -- 单个节点执行 span ID。
  trace_id TEXT NOT NULL, -- 所属 Agent run 的追踪 ID。
  parent_span_id TEXT, -- 父 span ID，用于后续工具和子节点层级。
  node_name TEXT NOT NULL, -- 节点、工具、模型或持久化动作名称。
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'degraded')), -- 节点执行状态。
  latency_ms INTEGER NOT NULL, -- 节点耗时，毫秒。
  model TEXT, -- 模型名称；非模型节点为空。
  input_summary TEXT, -- 脱敏后的输入摘要。
  output_summary TEXT, -- 脱敏后的输出摘要。
  error_code TEXT, -- 错误码。
  error_message TEXT, -- 脱敏后的错误摘要。
  started_at TEXT NOT NULL, -- 节点开始时间，ISO 字符串。
  ended_at TEXT NOT NULL, -- 节点结束时间，ISO 字符串。
  created_at TEXT NOT NULL, -- 记录创建时间，ISO 字符串。
  FOREIGN KEY (trace_id) REFERENCES agent_runs(trace_id),
  FOREIGN KEY (parent_span_id) REFERENCES agent_spans(span_id)
);

-- Agent Trace 查询索引：支持按用户、会话、thread、状态、过期时间和 traceId 定位。
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created
  ON agent_runs(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation
  ON agent_runs(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_runs_thread
  ON agent_runs(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status
  ON agent_runs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_runs_retention
  ON agent_runs(retention_until);

CREATE INDEX IF NOT EXISTS idx_agent_spans_trace
  ON agent_spans(trace_id, started_at);
