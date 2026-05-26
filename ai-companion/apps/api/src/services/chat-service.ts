import type { ChatRequest, ChatRequestMessage } from "@ai-companion/shared";
import { streamText, type UIMessage } from "ai";
import type { AppEnv } from "../env";
import { buildChatContext } from "./context-builder";
import {
  createConversation,
  requireConversation,
  titleFromMessage,
  touchConversation
} from "./conversations";
import { createMessage, listRecentModelMessages, uiMessageContent } from "./messages";
import { getChatModel } from "./model-provider";
import { ServiceError } from "./service-error";

/**
 * 读取 UIMessage text part 的文本内容。
 */
function readTextPart(part: { type: string } & Record<string, unknown>) {
  if (part.type !== "text") {
    return "";
  }

  return typeof part.text === "string" ? part.text : "";
}

/**
 * 从兼容旧版 content 和新版 parts 的消息结构中提取文本正文。
 */
function messageContent(message: ChatRequestMessage) {
  if (message.content !== undefined) {
    return message.content;
  }

  return message.parts?.map(readTextPart).join("").trim() ?? "";
}

/**
 * 判断请求消息是否是 AI SDK UIMessage parts 结构。
 */
function hasUiParts(message: ChatRequestMessage): message is ChatRequestMessage & UIMessage {
  return Array.isArray(message.parts);
}

/**
 * 从聊天请求中提取最新一条用户消息。
 *
 * 后端只信任最新用户输入，历史上下文统一从数据库读取。
 */
function latestUserMessageText(input: ChatRequest) {
  if (input.message) {
    return input.message.trim();
  }

  // messages：前端 useChat 当前消息列表，倒序后优先找到最近的 user 消息。
  const messages = [...(input.messages ?? [])].reverse();
  // latestUserMessage：本次要保存并发送给模型的新用户消息。
  const latestUserMessage = messages.find((message) => message.role === "user");

  if (!latestUserMessage) {
    return "";
  }

  return messageContent(latestUserMessage).trim();
}

/**
 * 创建聊天流式响应，并在生成前后完成消息持久化。
 *
 * 流程：
 * 1. 构建伴侣 system prompt。
 * 2. 创建或校验 conversation。
 * 3. 保存用户消息。
 * 4. 从数据库读取最近历史作为模型上下文。
 * 5. 流式返回 assistant 回复，并在完成后保存 assistant 消息。
 */
export async function createChatStreamResponse(
  env: AppEnv["Bindings"],
  userId: string,
  input: ChatRequest
) {
  // companion：当前用户的伴侣配置，用于新会话归属和 prompt 构建。
  // systemPrompt：由伴侣配置生成的系统提示词，不保存到消息列表。
  const { companion, systemPrompt } = await buildChatContext(env.DB, userId);
  // userMessageContent：本次请求中新发送的用户消息正文。
  const userMessageContent = latestUserMessageText(input);

  if (!userMessageContent) {
    throw new ServiceError("BAD_REQUEST", "消息不能为空");
  }

  const conversation = input.conversationId
    ? await requireConversation(env.DB, userId, input.conversationId)
    : await createConversation(env.DB, userId, {
        companionId: companion.id,
        title: titleFromMessage(userMessageContent)
      });

  await createMessage(env.DB, userId, {
    conversationId: conversation.id,
    role: "user",
    content: userMessageContent
  });
  await touchConversation(env.DB, userId, conversation.id);

  // messages：从数据库读取的最近上下文，按时间正序传给模型。
  const messages = await listRecentModelMessages(env.DB, userId, conversation.id);
  // originalMessages：AI SDK UIMessage 持久化模式需要的原始前端消息列表。
  const originalMessages =
    input.messages?.every(hasUiParts) === true ? (input.messages as UIMessage[]) : undefined;

  const result = streamText({
    model: getChatModel(env),
    system: systemPrompt,
    messages,
    temperature: 0.7
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Conversation-Id": conversation.id
    },
    originalMessages,
    async onFinish(event) {
      if (event.isAborted) {
        return;
      }

      // assistantContent：流式生成完成后的 assistant 纯文本回复，用于落库。
      const assistantContent = uiMessageContent(event.responseMessage);

      if (!assistantContent) {
        return;
      }

      try {
        await createMessage(env.DB, userId, {
          conversationId: conversation.id,
          role: "assistant",
          content: assistantContent
        });
        await touchConversation(env.DB, userId, conversation.id);
      } catch (error) {
        console.error("Failed to persist assistant message", error);
      }
    },
    onError() {
      return "模型调用失败，请稍后再试。";
    }
  });
}
