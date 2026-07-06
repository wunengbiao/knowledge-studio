import type { Message } from '../../shared/types'

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function buildChatCompletionMessages(params: {
  systemPrompt: string
  history: readonly Message[]
  currentUserMessageId: string
  currentAssistantMessageId: string
  userMessage: string
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
    .map((message) => ({ role: message.role, content: message.content }))

  return [
    { role: 'system', content: params.systemPrompt },
    ...recentHistory,
    { role: 'user', content: params.userMessage }
  ]
}

function isSendableHistoryMessage(
  message: Message,
  currentUserMessageId: string,
  currentAssistantMessageId: string
): boolean {
  if (message.id === currentUserMessageId || message.id === currentAssistantMessageId) return false
  return message.content.trim().length > 0
}
