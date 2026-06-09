export { baseSystemPrompt, buildSystemPrompt } from "./system-prompt";
export { buildPersonaPrompt, type PersonaPromptInput } from "./persona-prompt";
export { buildMemoryUsagePrompt, type MemoryPromptItem } from "./memory-usage-prompt";
export {
  buildClassificationUserPrompt,
  classificationFewShots,
  classificationSystemPrompt,
  type BuildClassificationPromptInput,
  type ClassificationPromptMessage
} from "./classification-prompt";

export const memoryExtractionPrompt = "Extract durable user memories when explicitly supported.";
