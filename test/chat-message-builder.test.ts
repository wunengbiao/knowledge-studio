import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChatCompletionMessages } from '../src/main/services/chat-message-builder.ts'
import type { Message } from '../src/shared/types.ts'

const baseMessage = (
  overrides: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>
): Message => ({
  conversationId: 'conversation-1',
  createdAt: '2026-06-25T00:00:00.000Z',
  ...overrides
})

test('Given failed empty assistant history, When building chat messages, Then omit the empty assistant turn', () => {
  const messages = buildChatCompletionMessages({
    systemPrompt: 'system',
    history: [
      baseMessage({ id: 'user-1', role: 'user', content: 'hello' }),
      baseMessage({ id: 'assistant-failed', role: 'assistant', content: '' })
    ],
    currentUserMessageId: 'user-current',
    currentAssistantMessageId: 'assistant-current',
    contextCount: 12,
    userMessage: 'retry'
  })

  assert.deepEqual(messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'hello' },
    { role: 'user', content: 'retry' }
  ])
})

test('Given current assistant placeholder, When building chat messages, Then omit that placeholder', () => {
  const messages = buildChatCompletionMessages({
    systemPrompt: 'system',
    history: [
      baseMessage({ id: 'assistant-current', role: 'assistant', content: 'partial text' }),
      baseMessage({ id: 'assistant-valid', role: 'assistant', content: 'previous answer' })
    ],
    currentUserMessageId: 'user-current',
    currentAssistantMessageId: 'assistant-current',
    contextCount: 12,
    userMessage: 'next question'
  })

  assert.deepEqual(messages, [
    { role: 'system', content: 'system' },
    { role: 'assistant', content: 'previous answer' },
    { role: 'user', content: 'next question' }
  ])
})

test('Given persisted current user message, When building chat messages, Then omit that message before appending the current user text', () => {
  const messages = buildChatCompletionMessages({
    systemPrompt: 'system',
    history: [
      baseMessage({ id: 'assistant-valid', role: 'assistant', content: 'previous answer' }),
      baseMessage({ id: 'user-current', role: 'user', content: 'current question' })
    ],
    currentUserMessageId: 'user-current',
    currentAssistantMessageId: 'assistant-current',
    contextCount: 12,
    userMessage: 'current question'
  })

  assert.deepEqual(messages, [
    { role: 'system', content: 'system' },
    { role: 'assistant', content: 'previous answer' },
    { role: 'user', content: 'current question' }
  ])
})

test('Given more than twelve sendable history messages, When building chat messages, Then keep the most recent twelve sendable turns', () => {
  const history = Array.from({ length: 13 }, (_, index) =>
    baseMessage({ id: `user-${index}`, role: 'user', content: `message ${index}` })
  )

  const messages = buildChatCompletionMessages({
    systemPrompt: 'system',
    history,
    currentUserMessageId: 'user-current',
    currentAssistantMessageId: 'assistant-current',
    contextCount: 12,
    userMessage: 'latest'
  })

  assert.equal(messages.length, 14)
  assert.equal(messages[1]?.content, 'message 1')
  assert.equal(messages[12]?.content, 'message 12')
  assert.deepEqual(messages[13], { role: 'user', content: 'latest' })
})

test('Given contextCount zero, When building chat messages, Then omit all history', () => {
  const history = [
    baseMessage({ id: 'user-1', role: 'user', content: 'old message' }),
    baseMessage({ id: 'assistant-1', role: 'assistant', content: 'old answer' })
  ]

  const messages = buildChatCompletionMessages({
    systemPrompt: 'system',
    history,
    currentUserMessageId: 'user-current',
    currentAssistantMessageId: 'assistant-current',
    contextCount: 0,
    userMessage: 'fresh start'
  })

  assert.deepEqual(messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'fresh start' }
  ])
})

test('Given Mistral-compatible text chat, When building messages, Then emit only role and content fields', () => {
  const messages = buildChatCompletionMessages({
    systemPrompt: 'system',
    history: [baseMessage({ id: 'assistant-valid', role: 'assistant', content: 'answer' })],
    currentUserMessageId: 'user-current',
    currentAssistantMessageId: 'assistant-current',
    contextCount: 12,
    userMessage: 'question'
  })

  for (const message of messages) {
    assert.deepEqual(Object.keys(message).sort(), ['content', 'role'])
  }
})
