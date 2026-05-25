export type Database = D1Database;

export const tables = [
  "users",
  "companions",
  "conversations",
  "messages",
  "memories",
  "model_logs",
  "feedback"
] as const;

export type TableName = (typeof tables)[number];
