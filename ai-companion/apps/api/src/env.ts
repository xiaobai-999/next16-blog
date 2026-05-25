export type AppEnv = {
  Bindings: {
    DB: D1Database;
    OPENAI_API_KEY?: string;
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
