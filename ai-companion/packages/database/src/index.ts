export type Database = D1Database;

export const tables = [
  "users",
  "companions",
  "conversations",
  "messages",
  "memories",
  "agent_runs",
  "agent_spans",
  "model_logs",
  "feedback"
] as const;

export type TableName = (typeof tables)[number];
