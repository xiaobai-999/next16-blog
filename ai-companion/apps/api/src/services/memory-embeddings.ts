import type { Memory } from "@ai-companion/shared";
import type { AppEnv } from "../env";
import { ServiceError } from "./service-error";
import { deleteMemoryVector, upsertMemoryVector } from "./memory-vector-store";

type EmbeddingRow = {
  // memory_id：对应 memories.id。
  memory_id: string;
  // vector_id：向量库中的向量 ID。
  vector_id: string;
  // model：当前 embedding 使用的模型。
  model: string;
  // content_hash：embedding 输入文本 hash。
  content_hash: string;
};

type EmbeddingResponse = {
  // data：OpenAI 兼容 embedding 响应数据。
  data?: Array<{
    embedding?: number[];
  }>;
};

const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-0.6b";
const DEFAULT_EMBEDDING_BASE_URL = "https://api.nodion.ai/v1";

/**
 * 解析 embedding 供应商配置。
 */
function getEmbeddingConfig(env: AppEnv["Bindings"]) {
  // model：当前 embedding 模型，默认使用 OpenAI small embedding。
  const model = env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  // apiKey：优先使用专用 embedding key，再复用 OpenAI/LLM key。
  const apiKey = env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY ?? env.LLM_API_KEY;
  // baseUrl：OpenAI 兼容 embeddings endpoint 的 base URL。
  const baseUrl = env.EMBEDDING_BASE_URL ?? DEFAULT_EMBEDDING_BASE_URL;

  return {
    model,
    apiKey,
    baseUrl
  };
}

/**
 * 构建写入 embedding 的安全文本。
 *
 * 不包含用户邮箱、内部 ID、prompt 或来源消息 ID。
 */
export function buildMemoryEmbeddingText(memory: Pick<Memory, "type" | "content" | "importance">) {
  return [`type: ${memory.type}`, `content: ${memory.content}`, `importance: ${memory.importance}`].join(
    "\n"
  );
}

/**
 * 计算文本 SHA-256 hash，用于判断 embedding 是否需要重建。
 */
async function sha256Hex(input: string) {
  // bytes：待计算 hash 的 UTF-8 字节。
  const bytes = new TextEncoder().encode(input);
  // digest：SHA-256 原始字节。
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 判断一条记忆是否应该拥有 embedding。
 */
export function shouldEmbedMemory(memory: Memory, now = new Date().toISOString()) {
  return (
    memory.status === "active" &&
    memory.deletedAt === null &&
    memory.archivedAt === null &&
    (memory.expiresAt === null || memory.expiresAt > now)
  );
}

/**
 * 调用 OpenAI 兼容 embeddings API。
 */
export async function embedText(env: AppEnv["Bindings"], input: string) {
  const config = getEmbeddingConfig(env);

  if (!config.apiKey) {
    throw new ServiceError("INTERNAL_ERROR", "EMBEDDING_API_KEY is not configured");
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      input
    })
  });

  if (!response.ok) {
    throw new ServiceError("INTERNAL_ERROR", `Embedding request failed: ${response.status}`);
  }

  // body：OpenAI 兼容 embedding 响应体。
  const body = (await response.json()) as EmbeddingResponse;
  // embedding：第一条输入文本对应的向量。
  const embedding = body.data?.[0]?.embedding;

  if (!embedding || embedding.length === 0) {
    throw new ServiceError("INTERNAL_ERROR", "Embedding response is empty");
  }

  return embedding;
}

/**
 * 为查询文本生成 embedding。
 */
export function embedQuery(env: AppEnv["Bindings"], input: string) {
  return embedText(env, input);
}

/**
 * 为 active 记忆生成并保存 embedding。
 *
 * 本地 fallback 会把 vector_json 保存到 D1；有 Vectorize 绑定时也同步 upsert。
 */
export async function upsertMemoryEmbedding(env: AppEnv["Bindings"], memory: Memory) {
  if (!shouldEmbedMemory(memory)) {
    await deleteMemoryEmbedding(env, memory.id);
    return;
  }

  const config = getEmbeddingConfig(env);
  // embeddingText：进入 embedding 模型的安全文本。
  const embeddingText = buildMemoryEmbeddingText(memory);
  // contentHash：embeddingText 的 hash，用于跳过无变化更新。
  const contentHash = await sha256Hex(`${config.model}\n${embeddingText}`);
  // existing：当前记忆已有的 embedding 元数据。
  const existing = await env.DB.prepare(
    `SELECT memory_id, vector_id, model, content_hash
     FROM memory_embeddings
     WHERE memory_id = ?
     LIMIT 1`
  )
    .bind(memory.id)
    .first<EmbeddingRow>();

  if (existing && existing.content_hash === contentHash && existing.model === config.model) {
    return;
  }

  // vector：新生成的记忆 embedding。
  const vector = await embedText(env, embeddingText);
  // now：embedding 同步时间。
  const now = new Date().toISOString();
  // vectorId：向量库中的稳定 ID。
  const vectorId = existing?.vector_id ?? `memory:${memory.id}`;

  await env.DB.prepare(
    `INSERT INTO memory_embeddings
       (memory_id, user_id, companion_id, vector_id, model, content_hash, vector_json, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(memory_id) DO UPDATE SET
       user_id = excluded.user_id,
       companion_id = excluded.companion_id,
       vector_id = excluded.vector_id,
       model = excluded.model,
       content_hash = excluded.content_hash,
       vector_json = excluded.vector_json,
       deleted_at = NULL,
       updated_at = excluded.updated_at`
  )
    .bind(
      memory.id,
      memory.userId,
      memory.companionId,
      vectorId,
      config.model,
      contentHash,
      JSON.stringify(vector),
      now,
      now
    )
    .run();

  await upsertMemoryVector(env, {
    vectorId,
    memoryId: memory.id,
    userId: memory.userId,
    companionId: memory.companionId,
    type: memory.type,
    vector
  }).catch((error) => {
    console.error("Failed to upsert memory vector", { memoryId: memory.id, error });
  });
}

/**
 * 删除或标记失效一条记忆的 embedding。
 */
export async function deleteMemoryEmbedding(env: AppEnv["Bindings"], memoryId: string) {
  // existing：用于拿到 vector_id，删除 Vectorize 中的向量。
  const existing = await env.DB.prepare(
    `SELECT memory_id, vector_id, model, content_hash
     FROM memory_embeddings
     WHERE memory_id = ?
     LIMIT 1`
  )
    .bind(memoryId)
    .first<EmbeddingRow>();

  if (!existing) {
    return;
  }

  // now：向量失效时间。
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE memory_embeddings
     SET vector_json = NULL, deleted_at = ?, updated_at = ?
     WHERE memory_id = ?`
  )
    .bind(now, now, memoryId)
    .run();

  await deleteMemoryVector(env, existing.vector_id).catch((error) => {
    console.error("Failed to delete memory vector", { memoryId, error });
  });
}
