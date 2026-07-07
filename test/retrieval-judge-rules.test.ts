import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isFollowUpInstruction,
  looksLikeChitchat
} from '../src/main/services/retrieval-judge-rules.ts'
import type { Message } from '../src/shared/types.ts'

function makeMessage(role: 'user' | 'assistant', content: string): Message {
  return {
    id: `${role}-${Math.random()}`,
    conversationId: 'conv-1',
    role,
    content,
    createdAt: new Date().toISOString()
  }
}

const WITH_HISTORY = [
  makeMessage('user', '低空经济无人机监管作业流程'),
  makeMessage('assistant', '...regulatory workflow answer...')
]

test('Given mermaid follow-up with history, When checking, Then return true (skip retrieval)', () => {
  assert.equal(isFollowUpInstruction('使用 mermaid 画出流程', WITH_HISTORY), true)
})

test('Given translate follow-up with history, When checking, Then return true', () => {
  assert.equal(isFollowUpInstruction('翻译成英文', WITH_HISTORY), true)
  assert.equal(isFollowUpInstruction('translate to japanese', WITH_HISTORY), true)
})

test('Given summarize follow-up with history, When checking, Then return true', () => {
  assert.equal(isFollowUpInstruction('总结一下', WITH_HISTORY), true)
  assert.equal(isFollowUpInstruction('summarize the above', WITH_HISTORY), true)
  assert.equal(isFollowUpInstruction('要約して', WITH_HISTORY), true)
})

test('Given no assistant history, When checking, Then return false (defer to LLM)', () => {
  assert.equal(isFollowUpInstruction('使用 mermaid 画出流程', []), false)
  assert.equal(
    isFollowUpInstruction('使用 mermaid 画出流程', [makeMessage('user', 'only user')]),
    false
  )
})

test('Given new factual question with history, When checking, Then return false (defer to LLM)', () => {
  assert.equal(isFollowUpInstruction('低空经济无人机监管作业流程', WITH_HISTORY), false)
  assert.equal(isFollowUpInstruction('什么是 RAG 系统？', WITH_HISTORY), false)
})

test('Given message longer than 50 chars, When checking, Then return false (defer to LLM)', () => {
  const long =
    '请用 mermaid 画出流程，然后再翻译成英文，最后总结一下关键步骤和注意事项，要求详细展开每个环节的具体实现细节'
  assert.ok(long.length > 50, `expected length > 50, got ${long.length}`)
  assert.equal(isFollowUpInstruction(long, WITH_HISTORY), false)
})

test('Given empty message, When checking, Then return false', () => {
  assert.equal(isFollowUpInstruction('', WITH_HISTORY), false)
  assert.equal(isFollowUpInstruction('   ', WITH_HISTORY), false)
})

test('Given english follow-up with history, When checking, Then return true', () => {
  assert.equal(isFollowUpInstruction('draw a diagram', WITH_HISTORY), true)
  assert.equal(isFollowUpInstruction('rewrite it', WITH_HISTORY), true)
  assert.equal(isFollowUpInstruction('elaborate', WITH_HISTORY), true)
})

test('Given bare greeting, When checking chitchat, Then return true', () => {
  assert.equal(looksLikeChitchat('你好'), true)
  assert.equal(looksLikeChitchat('您好'), true)
  assert.equal(looksLikeChitchat('hi'), true)
  assert.equal(looksLikeChitchat('hello'), true)
  assert.equal(looksLikeChitchat('你好！'), true)
  assert.equal(looksLikeChitchat('hello!'), true)
})

test('Given thanks or farewell, When checking chitchat, Then return true', () => {
  assert.equal(looksLikeChitchat('谢谢'), true)
  assert.equal(looksLikeChitchat('感谢'), true)
  assert.equal(looksLikeChitchat('thanks'), true)
  assert.equal(looksLikeChitchat('再见'), true)
  assert.equal(looksLikeChitchat('bye'), true)
})

test('Given meta question about assistant, When checking chitchat, Then return true', () => {
  assert.equal(looksLikeChitchat('你是谁'), true)
  assert.equal(looksLikeChitchat('你叫什么'), true)
  assert.equal(looksLikeChitchat('你能做什么'), true)
  assert.equal(looksLikeChitchat('who are you'), true)
})

test('Given greeting followed by factual question, When checking chitchat, Then return false', () => {
  assert.equal(looksLikeChitchat('你好，请问低空经济是什么'), false)
  assert.equal(looksLikeChitchat('你好，帮我查一下无人机流程'), false)
})

test('Given factual topic or question, When checking chitchat, Then return false', () => {
  assert.equal(looksLikeChitchat('低空经济无人机监管作业流程'), false)
  assert.equal(looksLikeChitchat('什么是 RAG 系统'), false)
})

test('Given empty or long message, When checking chitchat, Then return false', () => {
  assert.equal(looksLikeChitchat(''), false)
  assert.equal(looksLikeChitchat('   '), false)
  const longGreeting = '你好'.repeat(11)
  assert.ok(longGreeting.length > 20, `expected length > 20, got ${longGreeting.length}`)
  assert.equal(looksLikeChitchat(longGreeting), false)
})
