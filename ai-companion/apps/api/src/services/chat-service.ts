import type { ChatRequest, ChatRequestMessage } from "@ai-companion/shared";
import {
  convertToModelMessages,
  streamText,
  type ModelMessage,
  type UIMessage
} from "ai";
import type { AppEnv } from "../env";
import { buildChatContext } from "./context-builder";
import { getChatModel } from "./model-provider";

function readTextPart(part: { type: string } & Record<string, unknown>) {
  if (part.type !== "text") {
    return "";
  }

  return typeof part.text === "string" ? part.text : "";
}

function messageContent(message: ChatRequestMessage) {
  if (message.content !== undefined) {
    return message.content;
  }

  return message.parts?.map(readTextPart).join("").trim() ?? "";
}

function hasUiParts(message: ChatRequestMessage): message is ChatRequestMessage & UIMessage {
  return Array.isArray(message.parts);
}

function toModelMessages(input: ChatRequest): ModelMessage[] {
  if (input.message) {
    return [{ role: "user", content: input.message }];
  }

  const messages = input.messages ?? [];

  if (messages.every(hasUiParts)) {
    return convertToModelMessages(messages);
  }

  return messages
    .map((message) => ({
      role: message.role,
      content: messageContent(message)
    }))
    .filter((message) => message.content.length > 0);
}

export async function createChatStreamResponse(
  env: AppEnv["Bindings"],
  userId: string,
  input: ChatRequest
) {
  const { systemPrompt } = await buildChatContext(env.DB, userId);
  const messages = toModelMessages(input);
  const originalMessages =
    input.messages?.every(hasUiParts) === true ? (input.messages as UIMessage[]) : undefined;

  const result = streamText({
    model: getChatModel(env),
    system: systemPrompt,
    messages,
    temperature: 0.7
  });

  return result.toUIMessageStreamResponse({
    originalMessages,
    onError() {
      return "模型调用失败，请稍后再试。";
    }
  });
}
