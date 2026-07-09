import type { Message, MessageImage } from '../../shared/types'

export type ChatCompletionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatCompletionToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/**
 * OpenAI-compatible chat completion message. `assistant.tool_calls` and the
 * `tool` role are used only inside the in-memory tool-calling loop; persisted
 * history from `buildChatCompletionMessages` stays `role`+`content` only.
 */
export type ChatCompletionMessage =
  | { role: 'system' | 'user'; content: string | ChatCompletionContentPart[] }
  | {
      role: 'assistant'
      content: string | ChatCompletionContentPart[] | null
      tool_calls?: ChatCompletionToolCall[]
    }
  | { role: 'tool'; content: string; tool_call_id: string }

function imagesToContentParts(images: readonly MessageImage[]): ChatCompletionContentPart[] {
  return images.map((img) => ({
    type: 'image_url',
    image_url: { url: img.dataUrl }
  }))
}

function messageToContent(
  message: Message,
  modelSupportsImage: boolean
): string | ChatCompletionContentPart[] {
  if (
    modelSupportsImage &&
    message.role === 'user' &&
    message.images &&
    message.images.length > 0
  ) {
    return [{ type: 'text', text: message.content }, ...imagesToContentParts(message.images)]
  }
  return message.content
}

export function buildChatCompletionMessages(params: {
  systemPrompt: string
  history: readonly Message[]
  currentUserMessageId: string
  currentAssistantMessageId: string
  userMessage: string
  userImages?: MessageImage[]
  modelSupportsImage: boolean
}): ChatCompletionMessage[] {
  const recentHistory = params.history
    .filter((message) =>
      isSendableHistoryMessage(
        message,
        params.currentUserMessageId,
        params.currentAssistantMessageId
      )
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: messageToContent(message, params.modelSupportsImage)
    }))

  const currentUserContent: string | ChatCompletionContentPart[] =
    params.modelSupportsImage && params.userImages && params.userImages.length > 0
      ? [{ type: 'text', text: params.userMessage }, ...imagesToContentParts(params.userImages)]
      : params.userMessage

  return [
    { role: 'system', content: params.systemPrompt },
    ...recentHistory,
    { role: 'user', content: currentUserContent }
  ]
}

function isSendableHistoryMessage(
  message: Message,
  currentUserMessageId: string,
  currentAssistantMessageId: string
): boolean {
  if (message.id === currentUserMessageId || message.id === currentAssistantMessageId) return false
  return message.content.trim().length > 0 || (!!message.images && message.images.length > 0)
}
