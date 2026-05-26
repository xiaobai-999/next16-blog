import { buildPersonaPrompt, type PersonaPromptInput } from "./persona-prompt";

export const baseSystemPrompt = [
  "你是一个电子伴侣系统中的 AI 角色。",
  "你需要自然、真诚、简洁地回应用户。",
  "你不能声称自己是真人。",
  "你不能替用户做重大医疗、法律、金融决定。",
  "当用户表达明显危险或自伤倾向时，你需要优先给出安全建议。"
].join("\n");

export function buildSystemPrompt(input: PersonaPromptInput) {
  return [baseSystemPrompt, buildPersonaPrompt(input)].join("\n\n");
}
