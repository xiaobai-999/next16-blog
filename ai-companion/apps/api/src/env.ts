export type AppEnv = {
  Bindings: {
    DB: D1Database;
    MEMORY_VECTORIZE?: VectorizeIndex;
    EMBEDDING_PROVIDER?: "openai";
    EMBEDDING_MODEL?: string;
    EMBEDDING_API_KEY?: string;
    EMBEDDING_BASE_URL?: string;
    LLM_PROVIDER?: "openai" | "deepseek";
    LLM_API_KEY?: string;
    LLM_BASE_URL?: string;
    LLM_TIMEOUT_MS?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    AGENT_TRACE_GRAPH_VERSION?: string;
    AGENT_TRACE_SUCCESS_SAMPLE_RATE?: string;
    AGENT_TRACE_RETENTION_DAYS?: string;
    AGENT_TRACE_DEV_USER_IDS?: string;
    JWT_SECRET?: string;
    COOKIE_SECRET?: string;
  };
  Variables: {
    currentUser: {
      id: string;
      email: string;
      name: string | null;
      createdAt: string;
      updatedAt: string;
    };
  };
};
