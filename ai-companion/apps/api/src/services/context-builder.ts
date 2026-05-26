import { buildSystemPrompt } from "@ai-companion/prompts";
import { listCompanions } from "./companions";
import { ServiceError } from "./service-error";

export async function buildChatContext(db: D1Database, userId: string) {
  const [companion] = await listCompanions(db, userId);

  if (!companion) {
    throw new ServiceError("COMPANION_REQUIRED", "请先创建伴侣");
  }

  return {
    companion,
    systemPrompt: buildSystemPrompt({
      name: companion.name,
      persona: companion.persona,
      tone: companion.tone,
      relationship: companion.relationship,
      boundaries: companion.boundaries
    })
  };
}
