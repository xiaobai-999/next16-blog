export type PersonaPromptInput = {
  name: string;
  persona: string;
  tone: string;
  relationship: string;
  boundaries?: string | null;
};

export function buildPersonaPrompt(input: PersonaPromptInput) {
  return [
    `伴侣名称：${input.name}`,
    `伴侣人格：${input.persona}`,
    `说话风格：${input.tone}`,
    `关系定位：${input.relationship}`,
    `边界要求：${input.boundaries?.trim() || "遵守基础系统规则，保持尊重和分寸。"}`
  ].join("\n");
}
