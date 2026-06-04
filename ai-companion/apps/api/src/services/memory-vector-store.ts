import type { AppEnv } from "../env";

export type MemoryVectorMatch = {
  // memoryId：匹配到的记忆 ID，后续必须回查 D1 memories。
  memoryId: string;
  // similarity：向量相似度，范围按 cosine 约定接近 0-1。
  similarity: number;
};

type MemoryVectorRecord = {
  // vectorId：向量库中的稳定 ID。
  vectorId: string;
  // memoryId：对应 D1 memories.id。
  memoryId: string;
  // userId：所属用户 ID，用于 Vectorize metadata 过滤。
  userId: string;
  // companionId：所属伴侣 ID，用于 Vectorize metadata 过滤。
  companionId: string;
  // type：记忆类型，写入 metadata 便于后续调试或过滤。
  type: string;
  // vector：embedding 数值数组。
  vector: number[];
};

type MemoryEmbeddingRow = {
  // memory_id：对应 memories.id。
  memory_id: string;
  // vector_json：本地 fallback 使用的向量 JSON。
  vector_json: string | null;
};

type VectorizeLike = {
  upsert?: (vectors: Array<Record<string, unknown>>) => Promise<unknown>;
  deleteByIds?: (ids: string[]) => Promise<unknown>;
  query?: (vector: number[], options: Record<string, unknown>) => Promise<{
    matches?: Array<{
      id?: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
};

/**
 * 计算两个 embedding 向量的 cosine 相似度。
 */
function cosineSimilarity(left: number[], right: number[]) {
  // length：两段向量参与计算的共同长度。
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    // leftValue/rightValue：当前维度的数值。
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/**
 * 安全解析 D1 中保存的向量 JSON。
 */
function parseVectorJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    // vector：从 JSON 解析出的向量数组。
    const vector = JSON.parse(value) as unknown;

    if (Array.isArray(vector) && vector.every((item) => typeof item === "number")) {
      return vector;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 获取可选 Vectorize 绑定的松散接口。
 */
function getVectorize(env: AppEnv["Bindings"]) {
  return env.MEMORY_VECTORIZE as unknown as VectorizeLike | undefined;
}

/**
 * 向 Vectorize upsert 记忆向量。
 *
 * 没有 Vectorize 绑定时直接跳过，本地仍可依赖 D1 vector_json 召回。
 */
export async function upsertMemoryVector(env: AppEnv["Bindings"], record: MemoryVectorRecord) {
  // vectorize：Cloudflare Vectorize 绑定，可选存在。
  const vectorize = getVectorize(env);

  if (!vectorize?.upsert) {
    return;
  }

  await vectorize.upsert([
    {
      id: record.vectorId,
      values: record.vector,
      metadata: {
        memoryId: record.memoryId,
        userId: record.userId,
        companionId: record.companionId,
        type: record.type,
        status: "active"
      }
    }
  ]);
}

/**
 * 从 Vectorize 删除记忆向量。
 */
export async function deleteMemoryVector(env: AppEnv["Bindings"], vectorId: string) {
  // vectorize：Cloudflare Vectorize 绑定，可选存在。
  const vectorize = getVectorize(env);

  if (!vectorize?.deleteByIds) {
    return;
  }

  await vectorize.deleteByIds([vectorId]);
}

/**
 * 使用 Vectorize 查询记忆向量。
 */
async function queryVectorize(
  env: AppEnv["Bindings"],
  userId: string,
  companionId: string,
  vector: number[],
  topK: number
) {
  // vectorize：Cloudflare Vectorize 绑定，可选存在。
  const vectorize = getVectorize(env);

  if (!vectorize?.query) {
    return null;
  }

  const result = await vectorize.query(vector, {
    topK,
    returnMetadata: true,
    filter: {
      userId,
      companionId,
      status: "active"
    }
  });

  return (
    result.matches
      ?.map((match) => ({
        memoryId:
          typeof match.metadata?.memoryId === "string" ? match.metadata.memoryId : match.id ?? "",
        similarity: match.score ?? 0
      }))
      .filter((match) => match.memoryId) ?? []
  );
}

/**
 * 使用 D1 中保存的向量 JSON 做本地 fallback 查询。
 */
async function queryD1Vectors(
  db: D1Database,
  userId: string,
  companionId: string,
  vector: number[],
  topK: number
) {
  const result = await db
    .prepare(
      `SELECT memory_id, vector_json
       FROM memory_embeddings
       WHERE user_id = ?
         AND companion_id = ?
         AND deleted_at IS NULL
         AND vector_json IS NOT NULL`
    )
    .bind(userId, companionId)
    .all<MemoryEmbeddingRow>();

  return result.results
    .map((row) => {
      // storedVector：D1 中保存的记忆 embedding。
      const storedVector = parseVectorJson(row.vector_json);

      if (!storedVector) {
        return null;
      }

      return {
        memoryId: row.memory_id,
        similarity: cosineSimilarity(vector, storedVector)
      };
    })
    .filter((match): match is MemoryVectorMatch => match !== null)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK);
}

/**
 * 查询记忆向量，优先使用 Vectorize，失败时回退到 D1 本地向量。
 */
export async function queryMemoryVectors(
  db: D1Database,
  env: AppEnv["Bindings"],
  input: {
    userId: string;
    companionId: string;
    vector: number[];
    topK: number;
  }
) {
  try {
    // vectorizeMatches：真实向量库的召回结果。
    const vectorizeMatches = await queryVectorize(
      env,
      input.userId,
      input.companionId,
      input.vector,
      input.topK
    );

    if (vectorizeMatches) {
      return vectorizeMatches;
    }
  } catch (error) {
    console.error("Vectorize query failed, fallback to D1 vectors", { error });
  }

  return queryD1Vectors(db, input.userId, input.companionId, input.vector, input.topK);
}
