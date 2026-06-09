import type { ChatRequest, ChatRequestMessage } from "@ai-companion/shared";
import { streamText, type UIMessage } from "ai";
import { threadIdFromConversationId } from "../agent/agent-context";
import type { AgentTraceStatus } from "../agent/agent-state";
import { createTraceService, getAgentTraceConfig } from "../agent/trace-service";
import type { AppEnv } from "../env";
import { buildChatContext } from "./context-builder";
import {
  createConversation,
  getLatestConversationForCompanion,
  requireConversation,
  titleFromMessage,
  touchConversation
} from "./conversations";
import { extractAndStoreMemories } from "./memory-extractor";
import { createMessage, listRecentModelMessages, uiMessageContent } from "./messages";
import { createModelLog } from "./model-logs";
import { getChatModel, getModelProviderInfo } from "./model-provider";
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
 * 提取可写入日志的错误摘要。
 */
function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      code: error.name || "Error",
      message: error.message.slice(0, 500)
    };
  }

  return {
    code: "UnknownError",
    message: String(error).slice(0, 500)
  };
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
  input: ChatRequest,
  traceId: string,
  requestId: string,
  waitUntil?: (promise: Promise<unknown>) => void
) {
  // agentStartedAt：本轮请求进入聊天服务的时间，用于 Agent run 端到端耗时。
  const agentStartedAt = new Date().toISOString();
  // userMessageContent：本次请求中新发送的用户消息正文。
  const userMessageContent = latestUserMessageText(input);

  if (!userMessageContent) {
    throw new ServiceError("BAD_REQUEST", "消息不能为空");
  }

  // companion：当前用户的伴侣配置，用于新会话归属和 prompt 构建。
  // systemPrompt：由伴侣配置和语义召回记忆生成的系统提示词，不保存到消息列表。
  const { companion, systemPrompt } = await buildChatContext(env, userId, userMessageContent);

  const conversation =
    input.conversationId !== undefined
      ? await requireConversation(env.DB, userId, input.conversationId)
      : ((await getLatestConversationForCompanion(env.DB, userId, companion.id)) ??
        (await createConversation(env.DB, userId, {
          companionId: companion.id,
          title: titleFromMessage(userMessageContent)
        })));

  if (conversation.companionId !== companion.id) {
    throw new ServiceError("FORBIDDEN", "无权访问该会话");
  }

  const userMessage = await createMessage(env.DB, userId, {
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
  // modelInfo：当前聊天调用实际使用的模型供应商和模型名，用于日志定位。
  const modelInfo = getModelProviderInfo(env);
  // traceService：Agent Trace 写入服务，失败时只降级为本地日志。
  const traceService = createTraceService(env.DB, getAgentTraceConfig(env));
  // threadId：同一 conversation 多轮请求稳定使用同一个线程 ID。
  const threadId = threadIdFromConversationId(conversation.id);
  let agentTraceRecorded = false;

  const scheduleAgentTrace = (input: {
    status: AgentTraceStatus;
    spanStatus?: AgentTraceStatus;
    degradedReason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    outputSummary?: string | null;
  }) => {
    if (agentTraceRecorded) {
      return;
    }

    agentTraceRecorded = true;

    const endedAt = new Date().toISOString();
    const traceWrite = traceService
      .recordTrace({
        run: {
          traceId,
          requestId,
          userId,
          companionId: companion.id,
          conversationId: conversation.id,
          threadId,
          graphPath: ["v1_chat_stream"],
          status: input.status,
          degradedReason: input.degradedReason ?? null,
          startedAt: agentStartedAt,
          endedAt
        },
        spans: [
          {
            traceId,
            nodeName: "v1_chat_stream",
            status: input.spanStatus ?? input.status,
            model: modelInfo.model,
            inputSummary: `user_message_chars=${userMessageContent.length};model_messages=${messages.length}`,
            outputSummary: input.outputSummary ?? null,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
            startedAt: modelStartedAtIso,
            endedAt
          }
        ]
      })
      .catch((error) => {
        console.error("Failed to write agent trace", { traceId, requestId, error });
      });

    if (waitUntil) {
      waitUntil(traceWrite);
    } else {
      void traceWrite;
    }
  };

  // modelStartedAt：模型流式调用开始时间，用于计算端到端耗时。
  const modelStartedAt = Date.now();
  const modelStartedAtIso = new Date(modelStartedAt).toISOString();
  let model: ReturnType<typeof getChatModel>;

  try {
    model = getChatModel(env);
  } catch (error) {
    const summary = errorSummary(error);

    await createModelLog(env.DB, {
      traceId,
      userId,
      conversationId: conversation.id,
      provider: modelInfo.provider,
      model: modelInfo.model,
      latencyMs: Date.now() - modelStartedAt,
      status: "error",
      errorCode: summary.code,
      errorMessage: summary.message
    }).catch((logError) => {
      console.error("Failed to write model log", { traceId, error: logError });
    });

    scheduleAgentTrace({
      status: "error",
      errorCode: summary.code,
      errorMessage: summary.message,
      outputSummary: "model_provider_initialization_failed"
    });

    throw error;
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    temperature: 0.7,
    async onFinish(event) {
      try {
        await createModelLog(env.DB, {
          traceId,
          userId,
          conversationId: conversation.id,
          provider: modelInfo.provider,
          model: modelInfo.model,
          promptTokens: event.totalUsage.inputTokens ?? null,
          completionTokens: event.totalUsage.outputTokens ?? null,
          latencyMs: Date.now() - modelStartedAt,
          status: "success"
        });
      } catch (error) {
        console.error("Failed to write model log", { traceId, error });
      }
    },
    onError(event) {
      const summary = errorSummary(event.error);

      void createModelLog(env.DB, {
        traceId,
        userId,
        conversationId: conversation.id,
        provider: modelInfo.provider,
        model: modelInfo.model,
        latencyMs: Date.now() - modelStartedAt,
        status: "error",
        errorCode: summary.code,
        errorMessage: summary.message
      }).catch((error) => {
        console.error("Failed to write model log", { traceId, error });
      });

      scheduleAgentTrace({
        status: "error",
        errorCode: summary.code,
        errorMessage: summary.message,
        outputSummary: "model_stream_failed"
      });
    }
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Conversation-Id": conversation.id,
      "X-Trace-Id": traceId,
      "X-Request-Id": requestId
    },
    originalMessages,
    async onFinish(event) {
      if (event.isAborted) {
        scheduleAgentTrace({
          status: "degraded",
          spanStatus: "degraded",
          degradedReason: "stream_aborted",
          outputSummary: "stream_aborted"
        });

        return;
      }

      // assistantContent：流式生成完成后的 assistant 纯文本回复，用于落库。
      const assistantContent = uiMessageContent(event.responseMessage);

      if (!assistantContent) {
        scheduleAgentTrace({
          status: "degraded",
          spanStatus: "degraded",
          degradedReason: "empty_assistant_content",
          outputSummary: "assistant_message_chars=0"
        });

        return;
      }

      try {
        const assistantMessage = await createMessage(env.DB, userId, {
          conversationId: conversation.id,
          role: "assistant",
          content: assistantContent
        });
        await touchConversation(env.DB, userId, conversation.id);

        const memoryExtraction = extractAndStoreMemories(env, {
          traceId,
          userId,
          conversationId: conversation.id,
          companionId: conversation.companionId,
          sourceMessageId: userMessage.id,
          userMessage: userMessage.content,
          assistantMessage: assistantMessage.content
        }).catch((error) => {
          console.error("Failed to extract memories", { traceId, error });
        });

        if (waitUntil) {
          waitUntil(memoryExtraction);
        } else {
          void memoryExtraction;
        }

        scheduleAgentTrace({
          status: "ok",
          outputSummary: `assistant_message_chars=${assistantContent.length}`
        });
      } catch (error) {
        console.error("Failed to persist assistant message", { traceId, error });

        const summary = errorSummary(error);

        scheduleAgentTrace({
          status: "degraded",
          spanStatus: "degraded",
          degradedReason: "assistant_message_persist_failed",
          errorCode: summary.code,
          errorMessage: summary.message,
          outputSummary: `assistant_message_chars=${assistantContent.length}`
        });
      }
    },
    onError() {
      return "模型调用失败，请稍后再试。";
    }
  });
}
